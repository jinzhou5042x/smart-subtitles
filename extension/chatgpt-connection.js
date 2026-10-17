// Browser integration only. The worker owns OAuth, JWT validation, token renewal and inference.
import { CHATGPT_PERMISSIONS } from './chatgpt-permissions.js';
const RULE = 5042, LOGIN_ALARM = 'chatgpt-sign-in-expired';
let creating, initialized = false, starting = false;
export async function hasRuntime() { return (await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [chrome.runtime.getURL('chatgpt-runtime.html')] })).length > 0; }
async function runtime() {
  if (initialized) return;
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
export async function clearLoginRule() {
  if (await chrome.permissions.contains({ permissions: ['declarativeNetRequestWithHostAccess'] })) await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [RULE] });
  await chrome.alarms.clear(LOGIN_ALARM);
}
export async function beginLogin(args) {
  if (starting) throw new Error('A ChatGPT sign-in is already starting.');
  starting = true;
  try { return await startLogin(args); } finally { starting = false; }
}
async function startLogin(args) {
  if (!await chrome.permissions.contains(CHATGPT_PERMISSIONS)) throw new Error('Allow the ChatGPT connection in Translator settings first.');
  if ((await chatgpt('status')).pending) throw new Error('Complete or cancel the current ChatGPT sign-in first.');
  await clearLoginRule();
  const tab = await chrome.tabs.create({ url: 'about:blank', active: true });
  try {
    const auth = await chatgpt('begin', { ...args, tabId: tab.id });
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [RULE], addRules: [{ id: RULE, priority: 1,
      action: { type: 'redirect', redirect: { regexSubstitution: chrome.runtime.getURL('auth-callback.html') + '?\\1' } },
      condition: { regexFilter: '^http://127\\.0\\.0\\.1:1455/auth/callback\\?(.*)$', resourceTypes: ['main_frame'], tabIds: [tab.id] } }] });
    await chrome.alarms.create(LOGIN_ALARM, { delayInMinutes: 10 });
    await chrome.tabs.update(tab.id, { url: auth.url });
    return { opened: true };
  } catch (error) { await clearLoginRule(); await chatgpt('cancel').catch(() => {}); await chrome.tabs.remove(tab.id).catch(() => {}); throw error; }
}
export async function finishLogin(sender, params) {
  if (sender.id !== chrome.runtime.id || !sender.tab || sender.url?.split(/[?#]/)[0] !== chrome.runtime.getURL('auth-callback.html')) throw new Error('Unexpected sign-in callback.');
  try { return await chatgpt('finish', { ...params, tabId: sender.tab.id }); }
  finally { if (!(await chatgpt('status')).pending) await clearLoginRule(); }
}
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === LOGIN_ALARM) { void clearLoginRule(); void chatgpt('cancel').catch(() => {}); } });
chrome.tabs.onRemoved.addListener(async tabId => { if (await hasRuntime() && await chatgpt('cancel', { tabId }).catch(() => false)) await clearLoginRule(); });
