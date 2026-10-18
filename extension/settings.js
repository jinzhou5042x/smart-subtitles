import './languages.js';
import { PROVIDERS, endpoint } from './translation.js';
import { CHATGPT_PERMISSIONS } from './chatgpt-permissions.js';
import { withDeadline } from './async.js';
const $ = id => document.getElementById(id);
const call = async m => { const r = await chrome.runtime.sendMessage(m); if (!r?.ok) throw Object.assign(new Error(r?.error || 'Request failed'), { code: r?.code }); return r.data; };
// Three choices: two built-in translators and every key-based provider behind one card.
const API_PROVIDERS = ['google', 'openai', 'claude', 'deepseek', 'qwen', 'custom'];
const optionOf = provider => ['builtin', 'chatgpt'].includes(provider) ? provider : 'cloud';
let preferences = {}, profiles = {}, opened = null, apiProvider = 'google';
let accountState = { accounts: [] }, selectedAccount, loginAction = null, signInError = '', loginAttempt = 0, refreshingAccount = false;

$('version').textContent = 'v' + chrome.runtime.getManifest().version;
for (const id of API_PROVIDERS) $('provider').append(new Option(PROVIDERS[id].name, id));
for (const language of globalThis.SubtitleLanguages.list) $('target').append(new Option(language.name, language.code));

function say(text, tone = '') { $('result').dataset.tone = tone; $('result').textContent = text; if (tone !== 'error') $('usageLimit').hidden = true; }
async function run(action, button) {
  say('Working…'); if (button) button.disabled = true;
  try { say(await action() || 'Saved.'); }
  catch (e) { say(e.message, 'error'); $('usageLimit').hidden = e.code !== 'subscription_sharing_usage_limit_exceeded'; }
  finally { if (button) button.disabled = false; }
}
const ready = provider => provider === 'builtin' || (provider === 'chatgpt' ? !!accountState.accounts.find(a => a.id === accountState.active)?.ready : !!profiles[provider]?.configured);
async function activate(provider) {
  if (preferences.provider === provider) return;
  preferences = await call({ type: 'saveSettings', settings: { provider } }); render();
}

function render() {
  const current = optionOf(preferences.provider);
  for (const option of document.querySelectorAll('.option')) {
    const id = option.dataset.option, open = opened === id, active = id === current;
    option.dataset.active = String(active);
    option.querySelector('.option-head').setAttribute('aria-expanded', String(open));
    option.querySelector('.panel').hidden = !open;
    option.querySelector('.state').textContent = active ? 'In use' : id === 'cloud' ? (API_PROVIDERS.some(ready) ? 'Ready' : 'Set up') : ready(id) ? 'Ready' : 'Set up';
    // Messages appear inside the card they are about.
    if (open) option.querySelector('.panel').append($('result'), $('usageLimit'));
  }
  if (!opened) $('result').closest('.block').append($('result'), $('usageLimit'));
  const using = current === 'cloud' && PROVIDERS[preferences.provider];
  $('cloudSummary').textContent = using ? `Using ${using.name}${profiles[preferences.provider]?.model && preferences.provider !== 'google' ? ` · ${profiles[preferences.provider].model}` : ''}` : 'Google Cloud, OpenAI, Claude, DeepSeek, Qwen or a local model.';
}
async function choose(id) {
  say('');
  if (opened === id) { opened = null; render(); return; }
  opened = id; render();
  try {
    if (id === 'builtin') { await activate('builtin'); say('Subtitles now use browser translation.'); }
    if (id === 'chatgpt') { await refreshAccount(); if (ready('chatgpt') && preferences.provider !== 'chatgpt') { await activate('chatgpt'); say('Subtitles now use your ChatGPT plan.'); } }
    if (id === 'cloud' && ready(apiProvider) && preferences.provider !== apiProvider) { await activate(apiProvider); say(`Subtitles now use ${PROVIDERS[apiProvider].name}.`); }
  } catch (e) { say(e.message, 'error'); }
}
for (const option of document.querySelectorAll('.option')) option.querySelector('.option-head').onclick = () => choose(option.dataset.option);

// Your own API key
function renderCloud() {
  const preset = PROVIDERS[apiProvider], p = profiles[apiProvider] || {};
  $('provider').value = apiProvider;
  $('key').value = '';
  $('key').placeholder = p.configured && apiProvider !== 'custom' ? 'Saved until Chrome closes. Leave blank to keep it.' : apiProvider === 'custom' ? 'Optional for local models' : 'Paste your API key';
  $('guide').hidden = !preset.guide; $('guide').href = preset.guide || '#';
  $('modelRow').hidden = apiProvider === 'google'; $('model').value = p.model || preset.model || '';
  $('endpointRow').hidden = !!preset.baseUrl; $('baseUrl').value = p.baseUrl || preset.baseUrl || '';
  $('endpointHelp').textContent = apiProvider === 'qwen' ? 'Copy the API base URL for your region from Model Studio.' : 'An OpenAI-compatible base URL. A model on this computer can use http://localhost:PORT/v1.';
  $('remove').hidden = !profiles[apiProvider];
}
$('provider').onchange = async () => {
  apiProvider = $('provider').value; renderCloud(); say('');
  if (ready(apiProvider)) { try { await activate(apiProvider); say(`Subtitles now use ${PROVIDERS[apiProvider].name}.`); } catch (e) { say(e.message, 'error'); } }
};
$('cloudPanel').onsubmit = e => {
  e.preventDefault(); const provider = apiProvider;
  let baseUrl; try { baseUrl = endpoint(provider, { baseUrl: $('baseUrl').value }); } catch (error) { say(error.message, 'error'); return; }
  // Requested directly in the click, while user activation is present.
  const permission = chrome.permissions.request({ origins: [new URL(baseUrl).origin + '/*'] });
  void run(async () => {
    if (!await permission) throw new Error('Chrome did not allow access to this server. Click Connect and choose Allow.');
    await call({ type: 'saveProfile', provider, profile: { baseUrl, model: $('model').value, key: $('key').value } });
    profiles = await call({ type: 'profiles' }); renderCloud(); say('Checking the connection…');
    await call({ type: 'testProfile', provider });
    await activate(provider); render();
    return `Connected. Subtitles now use ${PROVIDERS[provider].name}.`;
  }, $('connect'));
};
$('remove').onclick = () => run(async () => {
  const provider = apiProvider;
  await call({ type: 'saveProfile', provider, clear: true }); profiles = await call({ type: 'profiles' });
  renderCloud();
  if (preferences.provider === provider) { await activate('builtin'); return 'Disconnected. Subtitles now use browser translation.'; }
  render(); return 'Disconnected.';
});

// ChatGPT
const accountCall = (action, extra = {}) => withDeadline(call({ type: 'chatgptAccount', action, ...extra }), action === 'begin' ? 23000 : 12000, action === 'begin' ? 'ChatGPT did not open. Please try again.' : 'The connection did not respond. Reload this page and try again.');
function renderChatgpt() {
  const accounts = accountState.accounts, account = accounts.find(a => a.id === selectedAccount);
  const phase = loginAction || accountState.login?.phase || 'idle', busy = phase !== 'idle';
  const error = busy ? '' : signInError || accountState.loginError;
  const connected = !busy && !error && !!account?.sharing;
  const views = {
    permission: ['Allow the connection in Chrome', 'Choose Allow in Chrome’s prompt. If you do not see it, look near the address bar.', 'Waiting for Chrome…'],
    opening: ['Opening ChatGPT…', 'OpenAI’s sign-in page opens in a new tab.', 'Opening ChatGPT…'],
    waiting: ['Finish signing in on OpenAI', 'Complete sign-in in the tab that opened, and allow plan usage. You will come back here automatically. If OpenAI says your organization hasn’t enabled access for this app, that work workspace does not let apps use its plan: cancel, then sign in with a personal Plus or Pro account, or choose another translator.', 'Waiting for sign-in…'],
    verifying: ['Finishing sign-in…', 'Checking your account and its models.', 'Finishing sign-in…'],
    cancelling: ['Cancelling sign-in…', '', 'Cancelling…'],
  };
  const view = views[phase] || (error ? ['Could not connect', error, 'Continue with ChatGPT']
    : account?.connected && account.plan === 'denied' ? ['ChatGPT plan usage was not granted', 'OpenAI signed you in but did not allow plan usage for this connection. A connection stays tied to the workspace chosen when it was added. If your workspace admin has allowed it, use a different account and pick that workspace.', 'Continue with ChatGPT']
    : account?.connected ? ['Allow ChatGPT plan usage', 'You are signed in. Continue to allow subtitle translation with your plan.', 'Continue with ChatGPT']
    : account ? ['Sign in again', `Sign-in ends when Chrome closes. Continue to reconnect${account.email ? ` ${account.email}` : ''}.`, 'Continue with ChatGPT']
    : ['Connect your ChatGPT account', 'Sign in on OpenAI’s page and allow plan usage. You will come back here automatically.', 'Continue with ChatGPT']);
  $('loginPanel').hidden = connected; $('chatgptReady').hidden = !connected;
  $('loginPanel').dataset.state = busy ? phase : error ? 'error' : 'idle';
  $('accountStatus').textContent = view[0]; $('loginDetail').textContent = view[1];
  $('signin').textContent = view[2]; $('signin').disabled = busy; $('signin').hidden = phase === 'waiting';
  $('returnLogin').hidden = phase !== 'waiting';
  $('cancelLogin').hidden = !busy; $('cancelLogin').disabled = phase === 'cancelling';
  const back = accounts.find(a => a.id === accountState.active && a.sharing);
  $('otherAccount').hidden = busy || !(account || back);
  $('otherAccount').textContent = account ? 'Use a different account' : `Back to ${back?.email || 'the connected account'}`;
  if (connected) {
    const options = [...accounts.map(a => [a.id, `${a.email || 'ChatGPT account'} · ${a.id.slice(-6)}`]), ['', 'Add another account…']];
    if ($('account').dataset.items !== JSON.stringify(options)) { $('account').dataset.items = JSON.stringify(options); $('account').replaceChildren(...options.map(([id, label]) => new Option(label, id))); }
    $('account').value = selectedAccount;
    const models = [...(account.models.some(m => m.slug === account.model) ? [] : [['', 'Choose a model']]), ...account.models.map(m => [m.slug, m.name])];
    if ($('chatgptModel').dataset.items !== JSON.stringify(models)) { $('chatgptModel').dataset.items = JSON.stringify(models); $('chatgptModel').replaceChildren(...models.map(([id, label]) => new Option(label, id))); }
    if (document.activeElement !== $('chatgptModel')) $('chatgptModel').value = account.models.some(m => m.slug === account.model) ? account.model : '';
    $('testChatgpt').disabled = !account.ready || account.id !== accountState.active;
  }
}
async function refreshAccount() {
  if (refreshingAccount) return;
  refreshingAccount = true;
  try {
    const previousActive = accountState.active;
    accountState = await accountCall('status');
    if (selectedAccount === undefined || (accountState.active && accountState.active !== previousActive)) selectedAccount = accountState.active || (accountState.accounts.length === 1 ? accountState.accounts[0].id : '');
    const active = accountState.accounts.find(a => a.id === accountState.active);
    if (active?.ready && !active.welcomed) {
      preferences = await call({ type: 'settings' });
      opened = 'chatgpt'; say('Connected. Subtitles now use your ChatGPT plan.');
      await accountCall('welcome'); active.welcomed = true;
    }
    renderChatgpt(); render();
  } catch (e) { signInError = e.message; renderChatgpt(); }
  finally { refreshingAccount = false; }
}
$('signin').onclick = () => {
  if (loginAction || accountState.login) return;
  const attempt = ++loginAttempt;
  signInError = ''; loginAction = 'permission'; say(''); renderChatgpt();
  // Start the permission request synchronously in the click; preserve user activation.
  let permission;
  try { permission = chrome.permissions.request(CHATGPT_PERMISSIONS); }
  catch (e) { loginAction = null; signInError = e.message; renderChatgpt(); return; }
  void (async () => {
    try {
      const allowed = await withDeadline(permission, 45000, 'Chrome is still waiting for permission. Close its prompt, then try again.');
      if (attempt !== loginAttempt) return;
      if (!allowed) throw new Error('Connection permission was declined. Try again and choose Allow in Chrome’s prompt.');
      loginAction = 'opening'; renderChatgpt();
      const account = accountState.accounts.find(a => a.id === selectedAccount);
      await accountCall('begin', { accountId: selectedAccount || '', enablePlan: !!account?.connected && !account.sharing });
    } catch (e) { if (attempt === loginAttempt) signInError = e.message; }
    finally { if (attempt === loginAttempt) { loginAction = null; await refreshAccount(); renderChatgpt(); } }
  })();
};
$('cancelLogin').onclick = async () => {
  ++loginAttempt; loginAction = 'cancelling'; signInError = ''; renderChatgpt();
  try { await accountCall('cancel'); say('Sign-in cancelled.'); }
  catch (e) { signInError = e.message; }
  finally { loginAction = null; await refreshAccount(); renderChatgpt(); }
};
$('returnLogin').onclick = async () => { try { await accountCall('focus'); } catch (e) { signInError = e.message; await refreshAccount(); } };
$('otherAccount').onclick = () => {
  signInError = ''; say('');
  selectedAccount = accountState.accounts.some(a => a.id === selectedAccount) ? '' : accountState.active;
  renderChatgpt();
};
$('account').onchange = () => run(async () => {
  signInError = ''; selectedAccount = $('account').value;
  const account = accountState.accounts.find(a => a.id === selectedAccount);
  if (account?.ready) { await accountCall('use', { accountId: account.id, model: account.model }); preferences = await call({ type: 'settings' }); await refreshAccount(); return `Subtitles now use ${account.email || 'this account'}.`; }
  renderChatgpt(); return '';
});
$('chatgptModel').onchange = () => run(async () => {
  if (!$('chatgptModel').value) return '';
  await accountCall('use', { accountId: selectedAccount, model: $('chatgptModel').value });
  preferences = await call({ type: 'settings' }); await refreshAccount();
  return 'Model saved. Subtitles use it from the next line.';
});
$('signout').onclick = () => run(async () => {
  const r = await accountCall('signOut', { accountId: selectedAccount });
  if (preferences.provider === 'chatgpt') { await activate('builtin'); await refreshAccount(); return `${r.message} Subtitles now use browser translation.`; }
  await refreshAccount(); return r.message;
});
$('testChatgpt').onclick = () => run(async () => `Connected: ${(await call({ type: 'testProfile', provider: 'chatgpt' })).text}`, $('testChatgpt'));

// Subtitles
$('target').onchange = () => run(async () => { preferences = await call({ type: 'saveSettings', settings: { target: $('target').value } }); return ''; });
$('fontSize').oninput = () => { $('fontSizeValue').value = $('fontSize').value; };
$('fontSize').onchange = () => run(async () => { preferences = await call({ type: 'saveSettings', settings: { fontSize: Number($('fontSize').value) } }); return ''; });
function renderSubtitles() {
  if (document.activeElement !== $('target')) $('target').value = preferences.target;
  if (document.activeElement !== $('fontSize')) { $('fontSize').value = preferences.fontSize; $('fontSizeValue').value = preferences.fontSize; }
}

// Saved translations
async function refreshCache() {
  try {
    const stats = await call({ type: 'cacheStats' });
    $('cacheCount').textContent = stats.count.toLocaleString('en-US');
    $('cacheBytes').textContent = `· ${(stats.bytes / 1048576).toFixed(1)} MB`;
    $('cacheProgress').style.width = Math.min(100, stats.count / stats.limit * 100) + '%';
    $('clear').disabled = !stats.count;
  } catch { $('cacheBytes').textContent = 'Storage information unavailable'; }
}
$('clear').onclick = () => $('clearDialog').showModal();
$('cancelClear').onclick = () => $('clearDialog').close();
$('confirmClear').onclick = () => { $('clearDialog').close(); void run(async () => { await call({ type: 'clearCache' }); await refreshCache(); return 'Saved translations cleared.'; }); };

// Keep the page in step with the popup and with sign-in finishing in another tab.
setInterval(async () => {
  if (document.hidden) return;
  try { preferences = await call({ type: 'settings' }); renderSubtitles(); render(); } catch {}
  if (opened === 'chatgpt' || accountState.login || loginAction) void refreshAccount();
}, 2000);
setInterval(() => { if (!document.hidden) void refreshCache(); }, 15000);
try {
  [preferences, profiles] = await Promise.all([call({ type: 'settings' }), call({ type: 'profiles' })]);
  const requested = location.hash.slice(1);
  apiProvider = API_PROVIDERS.includes(requested) ? requested : API_PROVIDERS.includes(preferences.provider) ? preferences.provider : API_PROVIDERS.find(id => profiles[id]?.configured) || 'google';
  opened = PROVIDERS[requested] ? optionOf(requested) : optionOf(preferences.provider);
  renderCloud(); renderSubtitles(); render();
  if (opened === 'chatgpt' || preferences.provider === 'chatgpt') await refreshAccount();
  else void refreshAccount();
  void refreshCache();
} catch (e) { say(e.message, 'error'); }
