import './languages.js';
import { PROVIDERS } from './translation.js';
import { playerMessage, playerState } from './popup-player.js';
const $ = id => document.getElementById(id);
const call = async message => { const r = await chrome.runtime.sendMessage(message); if (!r?.ok) throw new Error(r?.error || 'Extension unavailable'); return r.data; };
const player = message => playerMessage(chrome.tabs, message, undefined, chrome.scripting);
for (const language of globalThis.SubtitleLanguages.list) $('target').append(new Option(language.name, language.code));
for (const [id, p] of Object.entries(PROVIDERS)) $('provider').append(new Option(p.name, id));
let current;
function note() {
  $('providerNote').textContent = current.provider === 'builtin' ? 'Runs in your browser. A Start subtitles button appears on the video if a language pack is needed.' : current.provider === 'codex' ? 'Optional companion required for Codex subscription login.' : 'Connect your own API account in Translator settings. No companion app.';
}
async function refresh() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const info = await player({ type: 'diagnostics' }); const state = playerState(tab, info, current.enabled);
    $('status').textContent = state.status || 'Open a video with English subtitles.';
    $('detail').textContent = state.detail || ''; $('retry').hidden = !state.retry;
  } catch { $('status').textContent = 'Open a video on Hulu or Disney+.'; }
}
async function save(changes) { current = await call({ type: 'saveSettings', settings: changes }); note(); await refresh(); }
try {
  current = await call({ type: 'settings' });
  $('enabled').checked = current.enabled; $('target').value = current.target; $('provider').value = current.provider;
  $('fontSize').value = current.fontSize; $('fontSizeValue').value = current.fontSize; note();
  $('enabled').onchange = () => save({ enabled: $('enabled').checked });
  $('target').onchange = () => save({ target: $('target').value });
  $('provider').onchange = async () => { await save({ provider: $('provider').value }); if (current.provider !== 'builtin') chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') + '#' + current.provider }); };
  $('fontSize').oninput = () => { $('fontSizeValue').value = $('fontSize').value; };
  $('fontSize').onchange = () => save({ fontSize: Number($('fontSize').value) });
  $('configure').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') + '#' + current.provider });
  $('retry').onclick = async () => { await player({ type: 'retry' }); await refresh(); };
  $('copy').onclick = async e => { e.preventDefault(); await navigator.clipboard.writeText(JSON.stringify(await player({ type: 'snapshot' }), null, 2)); $('copy').textContent = 'Copied'; };
  await refresh(); setInterval(refresh, 1500);
} catch (e) { $('status').textContent = e.message; }
