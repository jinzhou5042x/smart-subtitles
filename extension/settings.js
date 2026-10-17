import { PROVIDERS, endpoint } from './translation.js';
import { CHATGPT_PERMISSIONS } from './chatgpt-permissions.js';
const $ = id => document.getElementById(id);
const call = async m => { const r = await chrome.runtime.sendMessage(m); if (!r?.ok) throw Object.assign(new Error(r?.error || 'Request failed'), { code: r?.code }); return r.data; };
let profiles = {};
for (const [id, p] of Object.entries(PROVIDERS)) $('provider').append(new Option(p.name, id));
function show() {
  const id = $('provider').value, preset = PROVIDERS[id], p = profiles[id] || {};
  $('builtin').hidden = id !== 'builtin'; $('chatgpt').hidden = id !== 'chatgpt'; $('cloud').hidden = ['builtin', 'chatgpt'].includes(id);
  $('baseUrl').value = p.baseUrl || preset.baseUrl || ''; $('baseUrl').readOnly = !!preset.baseUrl;
  $('model').value = p.model || preset.model || ''; $('model').disabled = id === 'google';
  $('key').value = ''; $('key').placeholder = p.configured ? 'Saved — leave blank to keep it' : id === 'custom' ? 'Optional for local models' : 'Paste your API key';
  $('guide').hidden = !preset.guide; $('guide').href = preset.guide || '#'; $('result').textContent = '';
  if (id === 'chatgpt') void refreshAccount();
  $('endpointHelp').textContent = id === 'qwen' ? 'Copy the workspace API base URL for your region from Model Studio.' : 'Use your provider’s API base URL. Local models may use http://localhost:PORT/v1.';
}
async function run(action) { $('usageLimit').hidden = true; try { $('result').textContent = 'Working…'; const message = await action(); $('result').textContent = message || 'Saved.'; } catch (e) { $('result').textContent = e.message; $('usageLimit').hidden = e.code !== 'subscription_sharing_usage_limit_exceeded'; } }
$('provider').onchange = show;
$('useBuiltin').onclick = () => run(async () => { await call({ type: 'saveSettings', settings: { provider: 'builtin' } }); return 'Ready. Open your video and choose a language in the extension.'; });
$('cloud').onsubmit = e => {
  e.preventDefault(); const provider = $('provider').value;
  let baseUrl; try { baseUrl = endpoint(provider, { baseUrl: $('baseUrl').value }); } catch (e) { $('result').textContent = e.message; return; }
  // Called directly from the click, while user activation is present.
  const permission = chrome.permissions.request({ origins: [new URL(baseUrl).origin + '/*'] });
  run(async () => {
    if (!await permission) throw new Error('API server permission was not granted');
    await call({ type: 'saveProfile', provider, profile: { baseUrl, model: $('model').value, key: $('key').value } });
    await call({ type: 'saveSettings', settings: { provider } }); profiles = await call({ type: 'profiles' }); show();
    return 'Saved. Translation uses this provider when you play a video.';
  });
};
$('test').onclick = () => run(async () => { const r = await call({ type: 'testProfile', provider: $('provider').value }); return `Connected: ${r.text}`; });
$('remove').onclick = () => run(async () => { await call({ type: 'saveProfile', provider: $('provider').value, clear: true }); profiles = await call({ type: 'profiles' }); show(); return 'Key removed.'; });
$('clear').onclick = () => run(async () => { await call({ type: 'clearCache' }); return 'Saved translations cleared.'; });
let accountState = { accounts: [] }, refreshingAccount = false, selectedAccount, modelAccount;
const accountCall = (action, extra = {}) => call({ type: 'chatgptAccount', action, ...extra });
async function refreshAccount() {
  if (refreshingAccount) return;
  refreshingAccount = true;
  try {
    accountState = await accountCall('status');
    if (selectedAccount === undefined) selectedAccount = accountState.active || '';
    const entries = accountState.accounts;
    $('account').replaceChildren(new Option('Add an account', ''), ...entries.map(a => new Option(`${a.email || 'Previous sign-in'} · ${a.id.slice(-6)}`, a.id)));
    $('account').value = selectedAccount;
    const account = entries.find(a => a.id === selectedAccount);
    $('accountStatus').textContent = account?.sharing ? 'Using ChatGPT plan' : account?.connected ? 'Signed in. Continue with ChatGPT to allow plan usage.' : 'Sign in to use your ChatGPT plan.';
    $('signout').hidden = !account?.connected;
    $('cancelLogin').hidden = !accountState.pending;
    $('signin').disabled = accountState.pending;
    $('chatgptModelSettings').hidden = !account?.sharing;
    const model = modelAccount === selectedAccount ? $('chatgptModel').value || account?.model : account?.model;
    $('chatgptModel').replaceChildren(...(account?.models || []).map(m => new Option(m.name, m.slug)));
    if (account?.sharing && !account.models.some(m => m.slug === model)) {
      const unavailable = new Option(`${model || 'gpt-6-luna'} — unavailable; choose another model`, ''); unavailable.disabled = true; $('chatgptModel').prepend(unavailable);
      $('chatgptModel').value = '';
    } else $('chatgptModel').value = model || '';
    modelAccount = selectedAccount;
    $('useChatgpt').disabled = !$('chatgptModel').value;
    $('testChatgpt').disabled = !account?.ready || account.id !== accountState.active;
    const active = entries.find(a => a.id === accountState.active);
    if (active?.sharing && !active.welcomed && !$('planWelcome').open) $('planWelcome').showModal();
  } catch (e) { $('accountStatus').textContent = e.message; }
  finally { refreshingAccount = false; }
}
$('account').onchange = () => { selectedAccount = $('account').value; void refreshAccount(); };
$('chatgptModel').onchange = () => { $('useChatgpt').disabled = !$('chatgptModel').value; };
$('signin').onclick = () => {
  const permission = chrome.permissions.request(CHATGPT_PERMISSIONS);
  run(async () => {
    if (!await permission) throw new Error('ChatGPT connection permission was not granted.');
    const account = accountState.accounts.find(a => a.id === selectedAccount);
    await accountCall('begin', { accountId: selectedAccount || '', enablePlan: !!account?.connected && !account.sharing });
    await refreshAccount(); return 'Complete sign-in on the OpenAI page that opened.';
  });
};
$('cancelLogin').onclick = () => run(async () => { await accountCall('cancel'); await refreshAccount(); return 'Sign-in cancelled.'; });
$('signout').onclick = () => run(async () => { const r = await accountCall('signOut', { accountId: selectedAccount }); await refreshAccount(); return r.message; });
$('useChatgpt').onclick = () => run(async () => { await accountCall('use', { accountId: selectedAccount, model: $('chatgptModel').value }); await refreshAccount(); return 'Saved. Subtitles use this ChatGPT account and model.'; });
$('refreshModels').onclick = () => run(async () => { await accountCall('models', { accountId: selectedAccount }); await refreshAccount(); return 'Model list updated.'; });
$('testChatgpt').onclick = () => run(async () => { const r = await call({ type: 'testProfile', provider: 'chatgpt' }); return `Connected: ${r.text}`; });
$('welcomeDone').onclick = () => run(async () => { await accountCall('welcome'); $('planWelcome').close(); return 'Ready. Open your video to start subtitles.'; });
$('planWelcome').addEventListener('cancel', e => { e.preventDefault(); $('welcomeDone').click(); });
setInterval(() => { if ($('provider').value === 'chatgpt') void refreshAccount(); }, 2000);
try { profiles = await call({ type: 'profiles' }); const s = await call({ type: 'settings' }); $('provider').value = PROVIDERS[location.hash.slice(1)] ? location.hash.slice(1) : s.provider; show(); } catch (e) { $('result').textContent = e.message; }
