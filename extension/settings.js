import { PROVIDERS, endpoint } from './translation.js';
import { CHATGPT_PERMISSIONS } from './chatgpt-permissions.js';
import { withDeadline } from './async.js';
const $ = id => document.getElementById(id);
const call = async m => { const r = await chrome.runtime.sendMessage(m); if (!r?.ok) throw Object.assign(new Error(r?.error || 'Request failed'), { code: r?.code }); return r.data; };
let profiles = {};
const providerButtons = [...$('providerNavigation').querySelectorAll('[data-provider]')];
const activeProvider = id => {
  $('currentProvider').textContent = PROVIDERS[id].name;
  for (const button of providerButtons) button.dataset.active = String(button.dataset.provider === id);
};
function choices(container, items, selected, pick, className = 'choice-button') {
  const signature = JSON.stringify(items);
  if (container.dataset.items !== signature) {
    container.dataset.items = signature;
    container.replaceChildren(...items.map(({ id, label }) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = className;
      button.dataset.value = id; button.textContent = label; button.onclick = () => pick(id); return button;
    }));
  }
  for (const button of container.children) button.setAttribute('aria-pressed', String(button.dataset.value === selected));
}
function selectProvider(id) { $('provider').value = id; history.replaceState(null, '', '#' + id); show(); }
for (const button of providerButtons) button.onclick = () => selectProvider(button.dataset.provider);
$('version').textContent = 'v' + chrome.runtime.getManifest().version;
function show() {
  const id = $('provider').value, preset = PROVIDERS[id], p = profiles[id] || {};
  for (const button of providerButtons) button.setAttribute('aria-pressed', String(button.dataset.provider === id));
  $('builtin').hidden = id !== 'builtin'; $('chatgpt').hidden = id !== 'chatgpt'; $('cloud').hidden = ['builtin', 'chatgpt'].includes(id);
  $('cloudHeading').textContent = preset.name;
  $('cloudDescription').textContent = id === 'google' ? 'Fast translations with your Google Cloud API key.' : id === 'custom' ? 'Connect an OpenAI-compatible API or a model running on this computer.' : `Connect ${preset.name} with your own API key and model.`;
  $('baseUrl').value = p.baseUrl || preset.baseUrl || ''; $('baseUrl').readOnly = !!preset.baseUrl;
  $('endpointField').hidden = !!preset.baseUrl; $('modelField').hidden = id === 'google';
  $('model').value = p.model || preset.model || ''; $('model').disabled = id === 'google';
  $('key').value = ''; $('key').placeholder = p.configured ? 'Saved for this session — leave blank to keep it' : id === 'custom' ? 'Optional for local models' : 'Paste your API key';
  $('keyState').textContent = p.configured ? 'Saved this session' : id === 'custom' ? 'Optional' : '';
  $('remove').hidden = !profiles[id]; $('test').disabled = !p.configured;
  $('guide').hidden = !preset.guide; $('guide').href = preset.guide || '#'; $('result').textContent = '';
  if (id === 'chatgpt') void refreshAccount();
  $('endpointHelp').textContent = id === 'qwen' ? 'Copy the workspace API base URL for your region from Model Studio.' : 'Use your provider’s API base URL. Local models may use http://localhost:PORT/v1.';
}
async function run(action) { $('usageLimit').hidden = true; $('result').dataset.tone = ''; try { $('result').textContent = 'Working…'; const message = await action(); $('result').textContent = message || 'Saved.'; } catch (e) { $('result').dataset.tone = 'error'; $('result').textContent = e.message; $('usageLimit').hidden = e.code !== 'subscription_sharing_usage_limit_exceeded'; } }
$('useBuiltin').onclick = () => run(async () => { await call({ type: 'saveSettings', settings: { provider: 'builtin' } }); activeProvider('builtin'); return 'Ready. Open your video and choose a language in the extension.'; });
$('cloud').onsubmit = e => {
  e.preventDefault(); const provider = $('provider').value;
  let baseUrl; try { baseUrl = endpoint(provider, { baseUrl: $('baseUrl').value }); } catch (e) { $('result').textContent = e.message; return; }
  // Called directly from the click, while user activation is present.
  const permission = chrome.permissions.request({ origins: [new URL(baseUrl).origin + '/*'] });
  run(async () => {
    if (!await permission) throw new Error('API server permission was not granted');
    await call({ type: 'saveProfile', provider, profile: { baseUrl, model: $('model').value, key: $('key').value } });
    await call({ type: 'saveSettings', settings: { provider } }); activeProvider(provider); profiles = await call({ type: 'profiles' }); show();
    return 'Saved. Translation uses this provider when you play a video.';
  });
};
$('test').onclick = () => run(async () => { const r = await call({ type: 'testProfile', provider: $('provider').value }); return `Connected: ${r.text}`; });
$('remove').onclick = () => run(async () => { await call({ type: 'saveProfile', provider: $('provider').value, clear: true }); profiles = await call({ type: 'profiles' }); show(); return 'Key removed.'; });
async function refreshCache() {
  try {
    const stats = await call({ type: 'cacheStats' });
    $('cacheCount').textContent = stats.count.toLocaleString('en-US');
    $('cacheBytes').textContent = `${(stats.bytes / 1048576).toFixed(1)} MB in this browser`;
    $('cacheProgress').style.width = Math.min(100, stats.count / stats.limit * 100) + '%';
    $('clear').disabled = !stats.count;
  } catch { $('cacheBytes').textContent = 'Storage information unavailable'; }
}
$('clear').onclick = () => $('clearDialog').showModal();
$('cancelClear').onclick = () => $('clearDialog').close();
$('confirmClear').onclick = () => { $('clearDialog').close(); void run(async () => { await call({ type: 'clearCache' }); await refreshCache(); return 'Saved translations cleared.'; }); };
let accountState = { accounts: [] }, refreshingAccount = false, selectedAccount, modelAccount;
let loginAction = null, signInError = '', loginAttempt = 0;
const accountCall = (action, extra = {}) => withDeadline(call({ type: 'chatgptAccount', action, ...extra }), action === 'begin' ? 23000 : 12000, action === 'begin' ? 'ChatGPT did not open. Please try again.' : 'The connection did not respond. Reload this page and try again.');
function renderLogin() {
  const account = accountState.accounts.find(a => a.id === selectedAccount);
  const phase = loginAction || accountState.login?.phase || 'idle';
  const busy = phase !== 'idle';
  const error = busy ? '' : signInError || accountState.loginError;
  const views = {
    permission: ['Allow the connection in Chrome', 'Choose Allow in Chrome’s permission prompt to continue. If you do not see it, check near the address bar.', 'Waiting for Chrome…'],
    opening: ['Opening ChatGPT…', 'The sign-in page will open in a new tab. This should only take a moment.', 'Opening ChatGPT…'],
    waiting: ['Finish signing in on OpenAI', 'Complete sign-in in the tab that opened. You can return to it below; there is no need to start again.', 'Waiting for sign-in…'],
    verifying: ['Finishing sign-in…', 'Checking your account and available models. You will return here automatically.', 'Finishing sign-in…'],
    cancelling: ['Cancelling sign-in…', 'Closing this sign-in attempt.', 'Cancelling…'],
  };
  const view = views[phase] || (error ? ['Could not connect', error, 'Continue with ChatGPT'] : account?.sharing ? ['Using ChatGPT plan', account.ready ? 'Your account is connected. Subtitles can use the model below.' : 'Your account is connected. Choose an available model below.', 'Continue with ChatGPT'] : account?.connected ? ['Allow ChatGPT plan usage', 'You are signed in. Continue with ChatGPT to authorize subtitle translation.', 'Continue with ChatGPT'] : ['Connect your ChatGPT account', 'Chrome will ask you to allow the connection, then open OpenAI’s sign-in page.', 'Continue with ChatGPT']);
  $('loginPanel').dataset.state = busy ? phase : error ? 'error' : account?.sharing ? 'connected' : 'idle';
  $('accountStatus').textContent = view[0]; $('loginDetail').textContent = view[1];
  $('signin').textContent = view[2]; $('signin').disabled = busy;
  $('signin').hidden = phase === 'waiting' || (!busy && account?.sharing && !error);
  $('returnLogin').hidden = phase !== 'waiting';
  $('cancelLogin').hidden = !busy; $('cancelLogin').disabled = phase === 'cancelling';
  $('signout').hidden = busy || !account?.connected;
  for (const button of $('accountChoices').children) button.disabled = busy;
}
async function refreshAccount() {
  if (refreshingAccount) return;
  refreshingAccount = true;
  try {
    const previousActive = accountState.active, previousAccountCount = accountState.accounts.length;
    accountState = await accountCall('status');
    if (selectedAccount === undefined || accountState.active !== previousActive) selectedAccount = accountState.active || '';
    if (!selectedAccount && !accountState.active && !previousAccountCount && accountState.accounts.length === 1) selectedAccount = accountState.accounts[0].id;
    const entries = accountState.accounts;
    $('accountPicker').hidden = !entries.length;
    $('account').value = selectedAccount;
    choices($('accountChoices'), [...entries.map(a => ({ id: a.id, label: `${a.email || 'Previous sign-in'} · ${a.id.slice(-6)}` })), { id: '', label: '+ Add account' }], selectedAccount, id => { selectedAccount = id; signInError = ''; void refreshAccount(); });
    const account = entries.find(a => a.id === selectedAccount);
    renderLogin();
    $('chatgptModelSettings').hidden = !account?.sharing;
    const model = modelAccount === selectedAccount ? $('chatgptModel').value || account?.model : account?.model;
    $('chatgptModel').value = account?.models?.some(m => m.slug === model) ? model : '';
    choices($('modelChoices'), (account?.models || []).map(m => ({ id: m.slug, label: m.name })), $('chatgptModel').value, id => {
      $('chatgptModel').value = id; $('useChatgpt').disabled = false;
      for (const button of $('modelChoices').children) button.setAttribute('aria-pressed', String(button.dataset.value === id));
    });
    $('modelHelp').textContent = account?.sharing && !$('chatgptModel').value ? `${model || 'gpt-6-luna'} is unavailable. Choose a model above.` : 'Default: gpt-6-luna · low reasoning effort.';
    modelAccount = selectedAccount;
    $('useChatgpt').disabled = !$('chatgptModel').value;
    $('testChatgpt').disabled = !account?.ready || account.id !== accountState.active;
    const active = entries.find(a => a.id === accountState.active);
    if (active?.ready && previousActive !== accountState.active) activeProvider((await call({ type: 'settings' })).provider);
    if (active?.sharing && !active.welcomed && !$('planWelcome').open) $('planWelcome').showModal();
  } catch (e) { signInError = e.message; renderLogin(); }
  finally { refreshingAccount = false; }
}
$('signin').onclick = () => {
  if (loginAction || accountState.login) return;
  const attempt = ++loginAttempt;
  signInError = ''; loginAction = 'permission'; $('result').textContent = ''; $('usageLimit').hidden = true; renderLogin();
  // Start the permission request synchronously in the click; preserve user activation.
  let permission;
  try { permission = chrome.permissions.request(CHATGPT_PERMISSIONS); }
  catch (e) { loginAction = null; signInError = e.message; renderLogin(); return; }
  void (async () => {
    try {
      const allowed = await withDeadline(permission, 45000, 'Chrome is still waiting for permission. Close its prompt, then try again.');
      if (attempt !== loginAttempt) return;
      if (!allowed) throw new Error('Connection permission was declined. Try again and choose Allow in Chrome’s prompt.');
      loginAction = 'opening'; renderLogin();
      const account = accountState.accounts.find(a => a.id === selectedAccount);
      await accountCall('begin', { accountId: selectedAccount || '', enablePlan: !!account?.connected && !account.sharing });
    } catch (e) { if (attempt === loginAttempt) signInError = e.message; }
    finally { if (attempt === loginAttempt) { loginAction = null; await refreshAccount(); renderLogin(); } }
  })();
};
$('cancelLogin').onclick = async () => {
  ++loginAttempt; loginAction = 'cancelling'; signInError = ''; renderLogin();
  try { await accountCall('cancel'); $('result').textContent = 'Sign-in cancelled.'; }
  catch (e) { signInError = e.message; }
  finally { loginAction = null; await refreshAccount(); renderLogin(); }
};
$('returnLogin').onclick = async () => { try { await accountCall('focus'); } catch (e) { signInError = e.message; await refreshAccount(); renderLogin(); } };
$('signout').onclick = () => run(async () => { const r = await accountCall('signOut', { accountId: selectedAccount }); await refreshAccount(); return r.message; });
$('useChatgpt').onclick = () => run(async () => { await accountCall('use', { accountId: selectedAccount, model: $('chatgptModel').value }); activeProvider('chatgpt'); await refreshAccount(); return 'Saved. Subtitles use this ChatGPT account and model.'; });
$('refreshModels').onclick = () => run(async () => { await accountCall('models', { accountId: selectedAccount }); await refreshAccount(); return 'Model list updated.'; });
$('testChatgpt').onclick = () => run(async () => { const r = await call({ type: 'testProfile', provider: 'chatgpt' }); return `Connected: ${r.text}`; });
$('welcomeDone').onclick = () => run(async () => { await accountCall('welcome'); $('planWelcome').close(); return 'Ready. Open your video to start subtitles.'; });
$('planWelcome').addEventListener('cancel', e => { e.preventDefault(); $('welcomeDone').click(); });
setInterval(() => { if ($('provider').value === 'chatgpt') void refreshAccount(); }, 2000);
setInterval(() => { if (!document.hidden) void refreshCache(); }, 15000);
try { profiles = await call({ type: 'profiles' }); const s = await call({ type: 'settings' }); activeProvider(s.provider); $('provider').value = PROVIDERS[location.hash.slice(1)] ? location.hash.slice(1) : s.provider; show(); void refreshCache(); } catch (e) { $('result').dataset.tone = 'error'; $('result').textContent = e.message; }
