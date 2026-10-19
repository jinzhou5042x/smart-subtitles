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
let preferences = {}, profiles = {}, opened = null, editingKey = false;
let accountState = { accounts: [] }, accountsLoaded = false, selectedAccount, loginAction = null, signInError = '', loginAttempt = 0, refreshingAccount = false;

$('version').textContent = 'v' + chrome.runtime.getManifest().version;
for (const language of globalThis.SubtitleLanguages.list) $('target').append(new Option(language.name, language.code));
const element = (tag, props = {}, ...children) => { const e = Object.assign(document.createElement(tag), props); e.append(...children); return e; };
const svg = path => { const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); icon.setAttribute('viewBox', '0 0 16 16'); icon.setAttribute('aria-hidden', 'true'); icon.innerHTML = `<path d="${path}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`; return icon; };
// One grouped list per kind, one row per provider; the open row's setup unfolds beneath it.
const rows = [];
for (const [kind, { name }] of Object.entries(KINDS)) {
  const items = providersOf(kind).map(id => {
    const chevron = svg('M6 3.5L10.5 8 6 12.5'); chevron.classList.add('chevron');
    const row = element('button', { type: 'button', className: 'option' }, element('span', { className: 'name' }, PROVIDERS[id].short), element('span', { className: 'state' }), chevron);
    row.dataset.provider = id; row.setAttribute('aria-controls', 'detail'); row.onclick = () => show(opened === id ? null : id);
    rows.push(row); return row;
  });
  $('kinds').append(element('div', { className: 'kind' }, element('p', { className: 'kind-name' }, name), element('div', { className: 'group' }, ...items)));
}

// Every action answers where it was taken: busy while it runs, then what happened.
// tone: '' (plain), 'busy', 'success' or 'error'.
function say(text, tone = '', out = $('result')) { out.dataset.tone = text ? tone : ''; out.textContent = text; if (out === $('result') && tone !== 'error') $('usageLimit').hidden = true; }
async function run(action, { button, out = $('result'), busy = '' } = {}) {
  say(busy, 'busy', out); if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
  try { const text = await action(); say(text || '', 'success', out); }
  catch (e) { say(e.message, 'error', out); if (out === $('result')) $('usageLimit').hidden = e.code !== 'subscription_sharing_usage_limit_exceeded'; }
  finally { if (button) { button.disabled = false; button.removeAttribute('aria-busy'); } }
}

const ready = id => kindOf(id) === 'browser' || (id === 'chatgpt' ? !!accountState.accounts.find(a => a.id === accountState.active)?.ready : !!profiles[id]?.configured);
// Set up once, but its sign-in or key ended when Chrome closed.
const lapsed = id => !ready(id) && (id === 'chatgpt' ? accountsLoaded && accountState.accounts.length > 0 : !!profiles[id]);
const needs = id => kindOf(id) === 'subscription' ? 'Signed out' : 'Key needed';
// What a row says, and its tone: in use and working, in use but stopped, set up, or nothing.
function stateOf(id) {
  if (preferences.provider === id) {
    if (id === 'chatgpt' && !accountsLoaded) return ['', ''];
    return ready(id) ? ['In use', 'active'] : [needs(id), 'warn'];
  }
  return ready(id) && kindOf(id) !== 'browser' ? ['Ready', ''] : lapsed(id) ? [needs(id), ''] : ['', ''];
}
const attention = id => preferences.provider === id && stateOf(id)[1] === 'warn';
const NAMES = { builtin: 'browser translation', chatgpt: 'ChatGPT' };

// Opening a provider only shows its setup; Use, or finishing its setup, switches to it.
function render() {
  for (const row of rows) {
    const id = row.dataset.provider, [label, tone] = stateOf(id), state = row.querySelector('.state');
    row.setAttribute('aria-expanded', String(id === opened));
    row.dataset.active = String(id === preferences.provider);
    state.dataset.tone = tone; state.replaceChildren(...(tone === 'active' ? [svg('M3.5 8.5l3 3 6-7')] : tone === 'warn' ? [svg('M8 1.8a6.2 6.2 0 1 0 0 12.4A6.2 6.2 0 0 0 8 1.8zM8 5v3.4M8 10.9v.1')] : []), label);
  }
  $('detail').hidden = !opened;
  if (!opened) return;
  const row = rows.find(r => r.dataset.provider === opened);
  if (row.nextElementSibling !== $('detail')) row.after($('detail'));
  // What a provider is matters before it is set up; afterwards its own state says enough.
  $('detailBlurb').textContent = PROVIDERS[opened].blurb;
  $('detailBlurb').hidden = kindOf(opened) !== 'browser' && (ready(opened) || lapsed(opened));
  // ChatGPT's sign-in view says this itself (the account, "Sign in again").
  $('attention').hidden = !attention(opened) || kindOf(opened) !== 'api';
  $('attention').textContent = 'The saved key could not be read. Enter it again.';
  for (const panel of ['chatgpt', 'cloud']) $(panel).hidden = panelOf(opened) !== panel;
  // API providers switch with Connect; the others with Use once they are ready.
  $('useRow').hidden = kindOf(opened) === 'api' || preferences.provider === opened || !ready(opened);
  $('use').textContent = `Use ${PROVIDERS[opened].short}`;
  if (kindOf(opened) === 'api') $('connect').textContent = preferences.provider === opened && ready(opened) ? 'Save' : 'Connect';
}
function show(id) {
  const changed = opened !== id;
  if (changed) { say(''); editingKey = false; }
  opened = id;
  if (changed && kindOf(id) === 'api') renderCloud();
  render(); if (id === 'chatgpt') void refreshAccount();
}
$('use').onclick = () => run(async () => {
  const id = opened;
  preferences = await call({ type: 'saveSettings', settings: { provider: id } }); render();
  return `Now using ${NAMES[id] || PROVIDERS[id].name}.`;
}, { button: $('use') });

// Your own API key
function renderCloud() {
  const provider = opened, preset = PROVIDERS[provider], p = profiles[provider] || {};
  // A saved key shows as its last four characters; Change opens the field to replace it.
  const saved = !!p.keyHint && !editingKey;
  $('key').value = ''; $('key').hidden = saved; $('keyHint').hidden = saved;
  $('keySaved').hidden = !saved; $('keyMask').textContent = `•••• ${p.keyHint || ''}`;
  $('key').placeholder = provider === 'custom' ? 'Optional' : 'Paste your key';
  $('guide').hidden = !preset.guide; $('guide').href = preset.guide || '#';
  $('modelRow').hidden = provider === 'google'; $('model').value = p.model || preset.model || '';
  $('endpointRow').hidden = !!preset.baseUrl; $('baseUrl').value = p.baseUrl || preset.baseUrl || '';
  $('endpointHelp').textContent = provider === 'qwen' ? 'Your region’s base URL from Model Studio.' : '';
  $('remove').hidden = !profiles[provider]; $('remove').textContent = provider === 'custom' ? 'Remove' : 'Remove key';
}
$('cloud').onsubmit = e => {
  e.preventDefault(); const provider = opened, switching = preferences.provider !== provider;
  let baseUrl; try { baseUrl = endpoint(provider, { baseUrl: $('baseUrl').value }); } catch (error) { say(error.message, 'error'); return; }
  // Requested directly in the click, while user activation is present.
  const permission = chrome.permissions.request({ origins: [new URL(baseUrl).origin + '/*'] });
  void run(async () => {
    if (!await permission) throw new Error('Chrome did not allow access to this server. Click Connect and choose Allow.');
    // The background tests the key with one short line and saves it only if that works.
    preferences = await call({ type: 'connectProfile', provider, profile: { baseUrl, model: $('model').value, key: $('key').value } });
    profiles = await call({ type: 'profiles' }); editingKey = false; renderCloud(); render();
    return switching ? `Connected. Now using ${PROVIDERS[provider].name}.` : 'Saved.';
  }, { button: $('connect'), busy: 'Testing…' });
};
$('changeKey').onclick = () => { editingKey = true; renderCloud(); $('key').focus(); };
$('remove').onclick = () => run(async () => {
  const provider = opened, wasActive = preferences.provider === provider;
  preferences = await call({ type: 'removeProfile', provider }); profiles = await call({ type: 'profiles' });
  renderCloud(); render();
  return wasActive ? 'Removed. Now using browser translation.' : 'Removed.';
}, { button: $('remove') });

// ChatGPT
const accountCall = (action, extra = {}) => withDeadline(call({ type: 'chatgptAccount', action, ...extra }), action === 'begin' ? 23000 : 12000, action === 'begin' ? 'ChatGPT did not open. Please try again.' : 'The connection did not respond. Reload this page and try again.');
function renderChatgpt() {
  const accounts = accountState.accounts, account = accounts.find(a => a.id === selectedAccount);
  const phase = loginAction || accountState.login?.phase || 'idle', busy = phase !== 'idle';
  const error = busy ? '' : signInError || accountState.loginError;
  const connected = !busy && !error && !!account?.sharing;
  const views = {
    permission: ['Allow the connection in Chrome', 'Choose Allow in Chrome’s prompt, near the address bar.', 'Waiting for Chrome…'],
    opening: ['Opening ChatGPT…', '', 'Opening ChatGPT…'],
    waiting: ['Finish signing in on OpenAI', 'Use your personal account in the new tab and allow plan usage.', 'Waiting for sign-in…'],
    verifying: ['Finishing sign-in…', '', 'Finishing sign-in…'],
    cancelling: ['Cancelling sign-in…', '', 'Cancelling…'],
  };
  // [title, detail, button]. A returning account is named by itself with one button; a first
  // connection is just the button. Titles appear only for progress and problems.
  const name = account?.email || 'Your ChatGPT account';
  const view = views[phase] || (error ? ['Could not connect', error, 'Try again']
    : account?.connected && account.plan === 'denied' ? ['Plan usage was not allowed', 'Work accounts cannot share their plan. Use another account and pick your personal one.', 'Try again']
    : account?.connected ? [name, 'Allow plan usage to translate with it.', 'Continue']
    : account ? [name, '', 'Sign in again']
    : ['', '', 'Continue with ChatGPT']);
  $('loginPanel').hidden = connected; $('chatgptReady').hidden = !connected;
  $('loginPanel').dataset.state = busy ? phase : error ? 'error' : 'idle';
  $('accountStatus').textContent = view[0]; $('loginDetail').textContent = view[1];
  $('signin').textContent = view[2]; $('signin').disabled = busy; $('signin').hidden = phase === 'waiting';
  $('returnLogin').hidden = phase !== 'waiting';
  $('cancelLogin').hidden = !busy; $('cancelLogin').disabled = phase === 'cancelling';
  const back = accounts.find(a => a.id === accountState.active && a.sharing);
  $('otherAccount').hidden = busy || !(account || back);
  $('otherAccount').textContent = account ? 'Use another account' : `Back to ${back?.email || 'the connected account'}`;
  $('personalNote').hidden = busy || !!account;
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
    accountState = await accountCall('status'); accountsLoaded = true;
    if (selectedAccount === undefined || (accountState.active && accountState.active !== previousActive)) selectedAccount = accountState.active || (accountState.accounts.length === 1 ? accountState.accounts[0].id : '');
    const active = accountState.accounts.find(a => a.id === accountState.active);
    if (active?.ready && !active.welcomed) {
      preferences = await call({ type: 'settings' });
      opened = 'chatgpt'; say('Connected. Now using ChatGPT.', 'success');
      await accountCall('welcome'); active.welcomed = true;
    }
    render(); renderChatgpt();
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
// Choosing an account or model while ChatGPT is not in use only saves it; Use switches.
$('account').onchange = () => run(async () => {
  signInError = ''; selectedAccount = $('account').value;
  const account = accountState.accounts.find(a => a.id === selectedAccount);
  if (!account?.ready) { renderChatgpt(); return ''; }
  const using = preferences.provider === 'chatgpt';
  await accountCall('use', { accountId: account.id, model: account.model, activate: using });
  preferences = await call({ type: 'settings' }); await refreshAccount();
  return using ? `Now using ${account.email || 'this account'}.` : 'Account selected.';
});
$('chatgptModel').onchange = () => run(async () => {
  if (!$('chatgptModel').value) return '';
  const using = preferences.provider === 'chatgpt', name = $('chatgptModel').selectedOptions[0].text;
  await accountCall('use', { accountId: selectedAccount, model: $('chatgptModel').value, activate: using });
  preferences = await call({ type: 'settings' }); await refreshAccount();
  return `Model: ${name}.`;
});
$('signout').onclick = () => run(async () => {
  const r = await accountCall('signOut', { accountId: selectedAccount });
  if (preferences.provider === 'chatgpt') { preferences = await call({ type: 'saveSettings', settings: { provider: 'builtin' } }); await refreshAccount(); return `${r.message} Now using browser translation.`; }
  await refreshAccount(); return r.message;
}, { button: $('signout') });
$('testChatgpt').onclick = () => run(async () => `Connected: ${(await call({ type: 'testProfile', provider: 'chatgpt' })).text}`, { button: $('testChatgpt'), busy: 'Testing…' });

// Subtitles. The size follows the slider while it moves, so the video shows the change at once.
$('target').onchange = () => run(async () => {
  preferences = await call({ type: 'saveSettings', settings: { target: $('target').value } });
  return `Subtitles now in ${$('target').selectedOptions[0].text}.`;
}, { out: $('subtitlesResult') });
let sizeTimer;
const saveSize = () => call({ type: 'saveSettings', settings: { fontSize: Number($('fontSize').value) } }).then(next => { preferences = next; }, e => say(e.message, 'error', $('subtitlesResult')));
$('fontSize').oninput = () => { $('fontSizeValue').value = $('fontSize').value; clearTimeout(sizeTimer); sizeTimer = setTimeout(saveSize, 120); };
$('fontSize').onchange = () => { clearTimeout(sizeTimer); void saveSize(); };
function renderSubtitles() {
  if (document.activeElement !== $('target')) $('target').value = preferences.target;
  if (document.activeElement !== $('fontSize')) { $('fontSize').value = preferences.fontSize; $('fontSizeValue').value = preferences.fontSize; }
}

// Saved translations
async function refreshCache() {
  try {
    const stats = await call({ type: 'cacheStats' });
    $('cacheBytes').textContent = stats.count ? `${stats.count.toLocaleString('en-US')} lines · ${(stats.bytes / 1048576).toFixed(1)} MB` : 'None yet';
    $('clear').disabled = !stats.count;
  } catch { $('cacheBytes').textContent = 'Unavailable'; }
}
$('clear').onclick = () => $('clearDialog').showModal();
$('cancelClear').onclick = () => $('clearDialog').close();
$('confirmClear').onclick = () => { $('clearDialog').close(); void run(async () => { await call({ type: 'clearCache' }); await refreshCache(); return 'Saved translations cleared.'; }, { button: $('clear'), out: $('subtitlesResult'), busy: 'Clearing…' }); };

// Keep the page in step with the popup and with sign-in finishing in another tab.
setInterval(async () => {
  if (document.hidden) return;
  try { preferences = await call({ type: 'settings' }); renderSubtitles(); render(); } catch {}
  if (opened === 'chatgpt' || accountState.login || loginAction || preferences.provider === 'chatgpt') void refreshAccount();
}, 2000);
setInterval(() => { if (!document.hidden) void refreshCache(); }, 15000);
try {
  [preferences, profiles] = await Promise.all([call({ type: 'settings' }), call({ type: 'profiles' })]);
  renderSubtitles(); void refreshCache();
  if (preferences.provider === 'chatgpt') await refreshAccount(); else void refreshAccount();
  // Open what was asked for; without a request, the translator in use when it needs the viewer.
  const requested = location.hash.slice(1);
  show(PROVIDERS[requested] ? requested : attention(preferences.provider) ? preferences.provider : null);
} catch (e) { say(e.message, 'error', $('subtitlesResult')); }
