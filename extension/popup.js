import './languages.js';
import { PROVIDERS, KINDS } from './translation.js';
import { playerMessage, playerState } from './popup-player.js';
const $ = id => document.getElementById(id);
const call = async message => { const r = await chrome.runtime.sendMessage(message); if (!r?.ok) throw new Error(r?.error || 'Extension unavailable'); return r.data; };
const player = message => playerMessage(chrome.tabs, message, undefined, chrome.scripting);
for (const language of globalThis.SubtitleLanguages.list) $('target').append(new Option(language.name, language.code));
for (const { name } of Object.values(KINDS)) $('provider').append(Object.assign(document.createElement('optgroup'), { label: name }));
for (const [id, p] of Object.entries(PROVIDERS)) $('provider').children[Object.keys(KINDS).indexOf(p.kind)].append(new Option(p.name, id));
let current;
function note() {
  $('planUsage').hidden = current.provider !== 'chatgpt';
  $('providerNote').textContent = current.provider === 'builtin' ? 'Fast and local; slang may translate literally. Click Start subtitles on the video if prompted.' : current.provider === 'chatgpt' ? 'Using your ChatGPT plan. Manage your account and usage in Translator settings.' : 'Connect your own API account in Translator settings.';
}
async function refresh() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const info = await player({ type: 'diagnostics' }); const state = playerState(tab, info, current.enabled);
    $('status').textContent = state.status || 'Open a video with English subtitles.';
    $('detail').textContent = state.detail || ''; $('retry').hidden = !state.retry;
    $('planUsage').firstElementChild.classList.toggle('primary-action', !!state.detail?.startsWith('ChatGPT usage limit reached'));
  } catch { $('status').textContent = 'Open a video on Hulu or Disney+.'; }
}
async function save(changes) { current = await call({ type: 'saveSettings', settings: changes }); note(); await refresh(); }
try {
  current = await call({ type: 'settings' });
  $('enabled').checked = current.enabled; $('target').value = current.target; $('provider').value = current.provider;
  $('fontSize').value = current.fontSize; $('fontSizeValue').value = current.fontSize; note();
  $('enabled').onchange = () => save({ enabled: $('enabled').checked });
  $('target').onchange = () => save({ target: $('target').value });
  $('provider').onchange = async () => {
    const provider = $('provider').value;
    try {
      if (await call({ type: 'providerReady', provider })) await save({ provider });
      else { $('provider').value = current.provider; await chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') + '#' + provider }); }
    } catch (error) { $('provider').value = current.provider; $('status').textContent = error.message; }
  };
  $('fontSize').oninput = () => { $('fontSizeValue').value = $('fontSize').value; };
  $('fontSize').onchange = () => save({ fontSize: Number($('fontSize').value) });
  $('configure').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') + '#' + current.provider });
  $('retry').onclick = async () => { await player({ type: 'retry' }); await refresh(); };
  $('copy').onclick = async e => { e.preventDefault(); await navigator.clipboard.writeText(JSON.stringify(await player({ type: 'snapshot' }), null, 2)); $('copy').textContent = 'Copied'; };
  await refresh(); setInterval(refresh, 1500);
} catch (e) { $('status').textContent = e.message; }
