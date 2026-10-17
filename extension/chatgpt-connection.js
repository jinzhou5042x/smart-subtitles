// Browser integration only. The worker owns OAuth, JWT validation, token renewal and inference.
import { CHATGPT_PERMISSIONS } from './chatgpt-permissions.js';
import { withDeadline } from './async.js';
const RULE_BASE = 100000, LOGIN_ALARM = 'chatgpt-sign-in-expired';
let creating, initialized = false, starting = null, loginError = '';
export async function hasRuntime() { return (await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [chrome.runtime.getURL('chatgpt-runtime.html')] })).length > 0; }
async function runtime() {
  if (initialized && await hasRuntime()) return;
  initialized = false;
  if (!creating) creating = (async () => {
    if (!await hasRuntime()) await chrome.offscreen.createDocument({ url: 'chatgpt-runtime.html', reasons: ['WORKERS'], justification: 'Run the ChatGPT connection worker and keep its credentials in memory, without storing tokens on disk.' });
    const { chatgptMetadata = {} } = await chrome.storage.local.get('chatgptMetadata');
    const reply = await chrome.runtime.sendMessage({ target: 'chatgpt-runtime', id: crypto.randomUUID(), command: 'initialize', args: { metadata: chatgptMetadata } });
    await persist(reply); if (!reply?.ok) throw new Error(reply?.error?.message || 'Could not start the ChatGPT connection.');
    initialized = true;
  })().catch(async error => {
    initialized = false;
    if (await hasRuntime()) await chrome.offscreen.closeDocument();
    throw error;
  }).finally(() => { creating = null; });
  await creating;
}
async function persist(reply) { if (reply?.metadata) await chrome.storage.local.set({ chatgptMetadata: reply.metadata }); }
export async function chatgpt(command, args = {}, signal) {
  // Merely viewing settings must not create a worker before optional host access is granted.
  if (command === 'status' && !await hasRuntime()) {
    const { chatgptMetadata = {} } = await chrome.storage.local.get('chatgptMetadata');
    return { active: chatgptMetadata.active || '', pending: false, login: null, accounts: (chatgptMetadata.accounts || []).map(a => ({ ...a, connected: false, sharing: false, ready: false, models: [] })) };
  }
  await runtime(); signal?.throwIfAborted();
  const id = crypto.randomUUID();
  const cancel = () => { chrome.runtime.sendMessage({ target: 'chatgpt-runtime', id: crypto.randomUUID(), command: 'cancelOperation', args: { id } }).catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    let reply;
    try { reply = await chrome.runtime.sendMessage({ target: 'chatgpt-runtime', id, command, args }); }
    catch { initialized = false; throw new Error('The ChatGPT connection stopped. Sign in again.'); }
    if (!reply || reply.error?.code === 'chatgpt_worker_stopped') {
      initialized = false;
      if (await hasRuntime()) await chrome.offscreen.closeDocument();
      throw new Error('The ChatGPT connection stopped. Sign in again.');
    }
    await persist(reply); signal?.throwIfAborted();
    if (!reply?.ok) throw Object.assign(new Error(reply?.error?.message || 'The ChatGPT connection stopped. Sign in again.'), reply?.error || {});
    return reply.data;
  } finally { signal?.removeEventListener('abort', cancel); }
}
export async function clearLoginRule(tabId) {
  const rules = tabId === undefined ? (await withDeadline(chrome.declarativeNetRequest.getSessionRules(), 3000, 'Could not reset sign-in. Reload the extension and try again.')).filter(r => r.action.redirect?.regexSubstitution?.startsWith(chrome.runtime.getURL('auth-callback.html'))).map(r => r.id) : [RULE_BASE + tabId];
  if (rules.length) await withDeadline(chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: rules }), 3000, 'Could not reset sign-in. Reload the extension and try again.');
}
export async function loginStatus() {
  const state = await chatgpt('status');
  return { ...state, login: starting ? { phase: 'opening' } : state.login, loginError };
}
export function beginLogin(args) {
  if (starting) return starting.promise;
  const attempt = { controller: new AbortController(), tabId: undefined };
  starting = attempt; loginError = '';
  attempt.promise = startLogin(args, attempt).finally(() => { if (starting === attempt) starting = null; });
  return attempt.promise;
}
async function startLogin(args, attempt) {
  const signal = attempt.controller.signal;
  const timeout = setTimeout(() => attempt.controller.abort(new Error('Could not open ChatGPT. Please try again.')), 15000);
  const step = async promise => { const value = await withDeadline(promise, 15000, 'Could not open ChatGPT. Please try again.', signal); signal.throwIfAborted(); return value; };
  try {
    if (!await step(chrome.permissions.contains(CHATGPT_PERMISSIONS))) throw new Error('Allow the Chrome connection to open ChatGPT.');
    const state = await step(chatgpt('status'));
    if (state.pending) return { opened: true };
    // Recreate a disconnected runtime after permission changes, retaining only saved metadata.
    if (!state.accounts.some(a => a.connected) && await hasRuntime()) {
      await step(chrome.offscreen.closeDocument()); initialized = false;
    }
    await step(chatgpt('checkConnection'));
    await step(clearLoginRule());
    const creatingTab = chrome.tabs.create({ url: 'about:blank', active: true }).then(tab => { attempt.tabId = tab.id; if (signal.aborted) void chrome.tabs.remove(tab.id).catch(() => {}); return tab; });
    const tab = await step(creatingTab);
    const auth = await step(chatgpt('begin', { ...args, tabId: tab.id }));
    const install = chrome.declarativeNetRequest.updateSessionRules({ addRules: [{ id: RULE_BASE + tab.id, priority: 1,
      action: { type: 'redirect', redirect: { regexSubstitution: chrome.runtime.getURL('auth-callback.html') + '?\\1' } },
      condition: { regexFilter: '^http://127\\.0\\.0\\.1:1455/auth/callback\\?(.*)$', resourceTypes: ['main_frame'], tabIds: [tab.id] } }] });
    // A late browser response cannot install an abandoned attempt's callback rule.
    void install.then(() => { if (signal.aborted) void clearLoginRule(tab.id).catch(() => {}); }, () => {});
    await step(install);
    await step(chrome.alarms.create(LOGIN_ALARM, { delayInMinutes: 10 }));
    await step(chrome.tabs.update(tab.id, { url: auth.url }));
    return { opened: true };
  } catch (error) {
    if (starting === attempt && !attempt.cancelled) loginError = error.message;
    attempt.controller.abort(error);
    if (attempt.tabId !== undefined) {
      await withDeadline(chatgpt('cancel', { tabId: attempt.tabId }), 3000, 'Sign-in cancelled.').catch(() => {});
      await Promise.allSettled([clearLoginRule(attempt.tabId), chrome.tabs.remove(attempt.tabId)]);
    }
    throw error;
  } finally { clearTimeout(timeout); }
}
export async function cancelLogin(message = '') {
  const attempt = starting;
  if (attempt) attempt.cancelled = true;
  attempt?.controller.abort(new Error('Sign-in cancelled.'));
  const state = await withDeadline(chatgpt('status'), 3000, 'The connection stopped. Reload this page.');
  await withDeadline(chatgpt('cancel'), 3000, 'The connection stopped. Reload this page.');
  loginError = message;
  const tabId = state.login?.tabId ?? attempt?.tabId;
  await chrome.alarms.clear(LOGIN_ALARM);
  if (tabId !== undefined) await Promise.allSettled([clearLoginRule(tabId), chrome.tabs.remove(tabId)]);
  if (starting === attempt) starting = null;
}
export async function focusLogin() {
  const state = await chatgpt('status');
  if (!state.login) throw new Error('The sign-in page has closed. Start sign-in again.');
  try { const tab = await chrome.tabs.update(state.login.tabId, { active: true }); await chrome.windows.update(tab.windowId, { focused: true }); }
  catch { await cancelLogin('The sign-in page has closed. Please try again.'); throw new Error(loginError); }
}
export async function finishLogin(sender, params) {
  if (sender.id !== chrome.runtime.id || !sender.tab || sender.frameId !== 0 || sender.url?.split(/[?#]/)[0] !== chrome.runtime.getURL('auth-callback.html')) throw new Error('Unexpected sign-in callback.');
  try { const result = await chatgpt('finish', { ...params, tabId: sender.tab.id }); loginError = ''; return result; }
  catch (error) { loginError = error.message; throw error; }
  finally { if (!(await chatgpt('status')).pending) { await clearLoginRule(sender.tab.id); await chrome.alarms.clear(LOGIN_ALARM); } }
}
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === LOGIN_ALARM) void cancelLogin('Sign-in expired. Please try again.').catch(() => {}); });
chrome.tabs.onRemoved.addListener(tabId => { void (async () => {
  if (starting?.tabId === tabId) starting.controller.abort(new Error('The sign-in page was closed. Please try again.'));
  if (await hasRuntime() && await chatgpt('cancel', { tabId }).catch(() => false)) { loginError = 'The sign-in page was closed. Please try again.'; await clearLoginRule(tabId); await chrome.alarms.clear(LOGIN_ALARM); }
})().catch(() => {}); });
