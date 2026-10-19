import './languages.js';
import { PROVIDERS, KINDS } from './translation.js';
import { playerMessage, playerState } from './popup-player.js';
const $ = id => document.getElementById(id);
const call = async message => { const r = await chrome.runtime.sendMessage(message); if (!r?.ok) throw new Error(r?.error || 'Extension unavailable'); return r.data; };
const player = message => playerMessage(chrome.tabs, message, undefined, chrome.scripting);
const openSettings = provider => chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') + (provider ? '#' + provider : '') });
for (const language of globalThis.SubtitleLanguages.list) $('target').append(new Option(language.name, language.code));
for (const { name } of Object.values(KINDS)) $('provider').append(Object.assign(document.createElement('optgroup'), { label: name }));
for (const [id, p] of Object.entries(PROVIDERS)) $('provider').children[Object.keys(KINDS).indexOf(p.kind)].append(new Option(p.name, id));
let current, providerReady = true;

// A change answers below the controls for a few seconds, in words.
let toastTimer;
function toast(text, tone = '') { $('toast').textContent = text; $('toast').dataset.tone = tone; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').textContent = ''; }, 3500); }

// The card: one status, its detail, a progress bar while translating, and the one action that helps.
function draw(state) {
  $('card').dataset.tone = state.tone || 'waiting';
  $('status').textContent = state.status;
  $('detail').textContent = state.detail || '';
  const progress = state.total && !state.complete && state.tone === 'working' ? state.translated / state.total : null;
  $('track').hidden = progress === null; if (progress !== null) $('fill').style.width = `${Math.round(progress * 100)}%`;
  const label = { retry: 'Retry', settings: current.provider === 'chatgpt' ? 'Sign in to ChatGPT' : 'Open settings' }[state.action];
  $('action').hidden = !label; if (label && !$('action').disabled) $('action').textContent = label;
  $('action').dataset.action = state.action || '';
  $('usage').hidden = state.action !== 'usage';
}
// A translator whose sign-in or key ended when Chrome closed comes first: nothing works without it.
function setupState() {
  const p = PROVIDERS[current.provider];
  return current.provider === 'chatgpt'
    ? { tone: 'error', status: 'Sign in to ChatGPT again', detail: 'Sign-in ends when Chrome closes.', action: 'settings' }
    : { tone: 'error', status: `Add your ${p.short} key`, detail: '', action: 'settings' };
}
async function refresh() {
  try {
    providerReady = await call({ type: 'providerReady', provider: current.provider }).catch(() => true);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (current.enabled && !providerReady) return draw(setupState());
    draw(playerState(tab, await player({ type: 'diagnostics' }), current.enabled));
  } catch { draw({ status: 'Open a video on Hulu or Disney+.' }); }
}
async function save(changes, done) {
  try { current = await call({ type: 'saveSettings', settings: changes }); if (done) toast(done(current), 'success'); }
  catch (e) { toast(e.message, 'error'); }
  show(); await refresh();
}
function show() {
  $('enabled').checked = current.enabled; $('target').value = current.target; $('provider').value = current.provider;
  if (document.activeElement !== $('fontSize')) { $('fontSize').value = current.fontSize; $('fontSizeValue').value = current.fontSize; }
}
try {
  current = await call({ type: 'settings' }); show();
  $('enabled').onchange = () => save({ enabled: $('enabled').checked }, s => s.enabled ? 'Bilingual subtitles on.' : 'Bilingual subtitles off.');
  $('target').onchange = () => save({ target: $('target').value }, () => `Subtitles now in ${$('target').selectedOptions[0].text}.`);
  $('provider').onchange = async () => {
    const provider = $('provider').value;
    try {
      // A translator that is not set up yet opens its setup; the choice stays as it was until then.
      if (await call({ type: 'providerReady', provider })) await save({ provider }, () => `Now translating with ${PROVIDERS[provider].name}.`);
      else { $('provider').value = current.provider; await openSettings(provider); }
    } catch (error) { $('provider').value = current.provider; toast(error.message, 'error'); }
  };
  // The size follows the slider while it moves, so the subtitles on the video change at once.
  let sizeTimer;
  const saveSize = () => call({ type: 'saveSettings', settings: { fontSize: Number($('fontSize').value) } }).then(next => { current = next; }, e => toast(e.message, 'error'));
  $('fontSize').oninput = () => { $('fontSizeValue').value = $('fontSize').value; clearTimeout(sizeTimer); sizeTimer = setTimeout(saveSize, 120); };
  $('fontSize').onchange = () => { clearTimeout(sizeTimer); void saveSize(); };
  $('action').onclick = async () => {
    if ($('action').dataset.action === 'settings') { await openSettings(current.provider); return; }
    $('action').disabled = true; $('action').textContent = 'Retrying…';
    try { await player({ type: 'retry' }); } finally { $('action').disabled = false; await refresh(); }
  };
  $('settings').onclick = () => openSettings('');
  $('copy').onclick = async e => {
    e.preventDefault();
    const snapshot = await player({ type: 'snapshot' }).catch(() => null);
    if (!snapshot || snapshot.connectionIssue) { toast('Open the video first, then copy diagnostics.', 'error'); return; }
    await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2)); toast('Diagnostics copied. Paste them into your issue report.', 'success');
  };
  await refresh(); setInterval(refresh, 1500);
} catch (e) { draw({ tone: 'error', status: e.message }); }
