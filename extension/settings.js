import './languages.js';
import { PROVIDERS, KINDS, endpoint } from './translation.js';
import { CHATGPT_PERMISSIONS } from './chatgpt-permissions.js';
import { withDeadline } from './async.js';
const $ = id => document.getElementById(id);
const call = async m => { const r = await chrome.runtime.sendMessage(m); if (!r?.ok) throw Object.assign(new Error(r?.error || 'Request failed'), { code: r?.code }); return r.data; };
// Kinds of translator, each with its providers, all from the registry in translation.js.
// Every API provider shares one setup form; other kinds have a setup per provider.
const kindOf = id => PROVIDERS[id]?.kind;
const providersOf = kind => Object.keys(PROVIDERS).filter(id => kindOf(id) === kind);
const panelOf = id => kindOf(id) === 'api' ? 'cloud' : id;
let preferences = {}, profiles = {}, opened = null;
const lastShown = {};
let accountState = { accounts: [] }, selectedAccount, loginAction = null, signInError = '', loginAttempt = 0, refreshingAccount = false;

$('version').textContent = 'v' + chrome.runtime.getManifest().version;
for (const language of globalThis.SubtitleLanguages.list) $('target').append(new Option(language.name, language.code));
const element = (tag, props = {}, ...children) => { const e = Object.assign(document.createElement(tag), props); e.append(...children); return e; };
const dot = () => element('span', { className: 'live', ariaHidden: 'true' });
const tabs = Object.entries(KINDS).map(([kind, { name }]) => {
  const tab = element('button', { type: 'button', id: 'kind-' + kind, role: 'tab' }, dot(), name);
  tab.dataset.kind = kind; tab.setAttribute('aria-controls', 'kindPanel'); return tab;
});
$('kinds').append(...tabs);
const tiles = Object.entries(PROVIDERS).map(([id, { short }]) => {
  const tile = element('button', { type: 'button', className: 'provider', role: 'radio' }, element('span', { className: 'name' }, dot(), element('span', {}, short)), element('span', { className: 'state' }));
  tile.dataset.provider = id; return tile;
});
$('providers').append(...tiles);

function say(text, tone = '') { $('result').dataset.tone = tone; $('result').textContent = text; if (tone !== 'error') $('usageLimit').hidden = true; }
async function run(action, button) {
  say(''); if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
  try { say(await action() || ''); }
  catch (e) { say(e.message, 'error'); $('usageLimit').hidden = e.code !== 'subscription_sharing_usage_limit_exceeded'; }
  finally { if (button) { button.disabled = false; button.removeAttribute('aria-busy'); } }
}
const ready = provider => kindOf(provider) === 'browser' || (provider === 'chatgpt' ? !!accountState.accounts.find(a => a.id === accountState.active)?.ready : !!profiles[provider]?.configured);
const stateOf = id => preferences.provider === id ? 'In use' : ready(id) ? 'Ready' : kindOf(id) === 'subscription' ? 'Sign in' : profiles[id] ? 'Key needed' : 'Not set up';
async function activate(provider) {
  if (preferences.provider === provider) return;
  preferences = await call({ type: 'saveSettings', settings: { provider } }); render();
}
const NAMES = { builtin: 'browser translation', chatgpt: 'your ChatGPT plan' };
// The provider a kind opens on: the one last shown there, the one in use, a ready one, or the first.
const firstOf = kind => lastShown[kind] || (kindOf(preferences.provider) === kind ? preferences.provider : providersOf(kind).find(ready) || providersOf(kind)[0]);

// Choosing a kind or a provider only shows it; Use, or finishing its setup, switches to it.
function render() {
  const kind = kindOf(opened);
  for (const tab of tabs) {
    const open = tab.dataset.kind === kind;
    tab.setAttribute('aria-selected', String(open)); tab.tabIndex = open ? 0 : -1;
    tab.dataset.active = String(tab.dataset.kind === kindOf(preferences.provider));
  }
  $('kindPanel').setAttribute('aria-labelledby', 'kind-' + kind);
  $('kindBlurb').textContent = KINDS[kind].blurb;
  for (const tile of tiles) {
    const id = tile.dataset.provider, open = id === opened;
    tile.hidden = kindOf(id) !== kind;
    tile.setAttribute('aria-checked', String(open)); tile.tabIndex = open ? 0 : -1;
    tile.dataset.active = String(id === preferences.provider);
    tile.lastElementChild.textContent = stateOf(id);
  }
  $('detailName').textContent = PROVIDERS[opened].name; $('detailBlurb').textContent = PROVIDERS[opened].blurb;
  for (const panel of ['builtin', 'chatgpt', 'cloud']) $(panel).hidden = panelOf(opened) !== panel;
  $('detail').dataset.active = String(opened === preferences.provider);
  $('use').hidden = !ready(opened);
}
function show(id) {
  const changed = opened !== id;
  if (changed) say('');
  opened = id; lastShown[kindOf(id)] = id;
  if (changed && kindOf(id) === 'api') renderCloud();
  render(); if (id === 'chatgpt') void refreshAccount();
}
// Arrow keys move along the kind tabs, and along the provider tiles shown.
const arrows = (items, pick) => e => {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (!step) return;
  e.preventDefault(); const shown = items.filter(i => !i.hidden), next = shown[(shown.indexOf(e.currentTarget) + step + shown.length) % shown.length];
  pick(next); next.focus();
};
for (const tab of tabs) { tab.onclick = () => show(firstOf(tab.dataset.kind)); tab.onkeydown = arrows(tabs, next => show(firstOf(next.dataset.kind))); }
for (const tile of tiles) { tile.onclick = () => show(tile.dataset.provider); tile.onkeydown = arrows(tiles, next => show(next.dataset.provider)); }
$('use').onclick = () => run(async () => { const id = opened; await activate(id); return `Subtitles now use ${NAMES[id] || PROVIDERS[id].name}.`; }, $('use'));

// Your own API key
function renderCloud() {
  const provider = opened, preset = PROVIDERS[provider], p = profiles[provider] || {};
  $('key').value = '';
  $('key').placeholder = p.configured && provider !== 'custom' ? 'Saved until Chrome closes. Leave blank to keep it.' : provider === 'custom' ? 'Optional for local models' : 'Paste your API key';
  $('guide').hidden = !preset.guide; $('guide').href = preset.guide || '#';
  $('modelRow').hidden = provider === 'google'; $('model').value = p.model || preset.model || '';
  $('endpointRow').hidden = !!preset.baseUrl; $('baseUrl').value = p.baseUrl || preset.baseUrl || '';
  $('endpointHelp').textContent = provider === 'qwen' ? 'Copy the API base URL for your region from Model Studio.' : 'An OpenAI-compatible base URL. A model on this computer can use http://localhost:PORT/v1.';
  $('remove').hidden = !profiles[provider];
}
$('cloud').onsubmit = e => {
  e.preventDefault(); const provider = opened;
  let baseUrl; try { baseUrl = endpoint(provider, { baseUrl: $('baseUrl').value }); } catch (error) { say(error.message, 'error'); return; }
  // Requested directly in the click, while user activation is present.
  const permission = chrome.permissions.request({ origins: [new URL(baseUrl).origin + '/*'] });
  void run(async () => {
    if (!await permission) throw new Error('Chrome did not allow access to this server. Click Connect and choose Allow.');
    await call({ type: 'saveProfile', provider, profile: { baseUrl, model: $('model').value, key: $('key').value } });
    profiles = await call({ type: 'profiles' }); renderCloud();
    await call({ type: 'testProfile', provider });
    await activate(provider); render();
    return `Connected. Subtitles now use ${PROVIDERS[provider].name}.`;
  }, $('connect'));
};
$('remove').onclick = () => run(async () => {
  const provider = opened;
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
    waiting: ['Finish signing in on OpenAI', 'Complete sign-in in the tab that opened, and allow plan usage. You will come back here automatically. If OpenAI says your organization hasn’t enabled access for this app, your work workspace does not let apps use its plan: cancel, sign in again and choose your personal account, or choose another translator.', 'Waiting for sign-in…'],
    verifying: ['Finishing sign-in…', 'Checking your account and its models.', 'Finishing sign-in…'],
    cancelling: ['Cancelling sign-in…', '', 'Cancelling…'],
  };
  const view = views[phase] || (error ? ['Could not connect', error, 'Continue with ChatGPT']
    : account?.connected && account.plan === 'denied' ? ['ChatGPT plan usage was not granted', 'OpenAI signed you in but did not allow plan usage for this connection. Work workspaces (ChatGPT Business, Enterprise, Edu) may not let apps use their plan, and their admins have no setting for it. Use a different account and pick your personal one, or choose another translator.', 'Continue with ChatGPT']
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
  if (account?.ready) { await accountCall('use', { accountId: account.id, model: account.model }); preferences = await call({ type: 'settings' }); await refreshAccount(); render(); return `Subtitles now use ChatGPT with ${account.email || 'this account'}.`; }
  renderChatgpt(); return '';
});
$('chatgptModel').onchange = () => run(async () => {
  if (!$('chatgptModel').value) return '';
  const switching = preferences.provider !== 'chatgpt', name = $('chatgptModel').selectedOptions[0].text;
  await accountCall('use', { accountId: selectedAccount, model: $('chatgptModel').value });
  preferences = await call({ type: 'settings' }); await refreshAccount(); render();
  return switching ? `Subtitles now use your ChatGPT plan with ${name}.` : `Model saved. Subtitles use ${name} from the next line.`;
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
  show(PROVIDERS[requested] ? requested : KINDS[requested] ? firstOf(requested) : PROVIDERS[preferences.provider] ? preferences.provider : 'builtin');
  renderSubtitles();
  if (opened === 'chatgpt' || preferences.provider === 'chatgpt') await refreshAccount();
  else void refreshAccount();
  void refreshCache();
} catch (e) { say(e.message, 'error'); }
