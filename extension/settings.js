import { PROVIDERS, endpoint } from './translation.js';
const $ = id => document.getElementById(id);
const call = async m => { const r = await chrome.runtime.sendMessage(m); if (!r?.ok) throw new Error(r?.error || 'Request failed'); return r.data; };
let profiles = {};
for (const [id, p] of Object.entries(PROVIDERS)) $('provider').append(new Option(p.name, id));
function show() {
  const id = $('provider').value, preset = PROVIDERS[id], p = profiles[id] || {};
  $('builtin').hidden = id !== 'builtin'; $('codex').hidden = id !== 'codex'; $('cloud').hidden = ['builtin', 'codex'].includes(id);
  $('baseUrl').value = p.baseUrl || preset.baseUrl || ''; $('baseUrl').readOnly = !!preset.baseUrl;
  $('model').value = p.model || preset.model || ''; $('model').disabled = id === 'google';
  $('key').value = ''; $('key').placeholder = p.configured ? 'Saved — leave blank to keep it' : id === 'custom' ? 'Optional for local models' : 'Paste your API key';
  $('guide').hidden = !preset.guide; $('guide').href = preset.guide || '#'; $('result').textContent = '';
  $('endpointHelp').textContent = id === 'qwen' ? 'Copy the workspace API base URL for your region from Model Studio.' : 'Use your provider’s API base URL. Local models may use http://localhost:PORT/v1.';
}
async function run(action) { try { $('result').textContent = 'Working…'; const message = await action(); $('result').textContent = message || 'Saved.'; } catch (e) { $('result').textContent = e.message; } }
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
$('connect').onclick = () => {
  const permission = chrome.permissions.request({ permissions: ['nativeMessaging'], origins: ['http://127.0.0.1/*'] });
  run(async () => { if (!await permission) throw new Error('Codex connection permission was not granted'); const s = await call({ type: 'codexAccount', action: 'status' }); await call({ type: 'saveSettings', settings: { provider: 'codex' } }); return `Connected. Codex: ${s.codex || 'ready'}.`; });
};
$('signin').onclick = () => run(async () => { await call({ type: 'codexAccount', action: 'sign-in' }); return 'Complete sign-in in the browser window that opens.'; });
$('signout').onclick = () => run(async () => { await call({ type: 'codexAccount', action: 'sign-out' }); return 'Signed out of Codex.'; });
try { profiles = await call({ type: 'profiles' }); const s = await call({ type: 'settings' }); $('provider').value = PROVIDERS[location.hash.slice(1)] ? location.hash.slice(1) : s.provider; show(); } catch (e) { $('result').textContent = e.message; }
