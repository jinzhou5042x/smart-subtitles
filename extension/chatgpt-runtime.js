// A dedicated worker retains credentials in RAM while the MV3 service worker sleeps.
// No tokens are written to extension storage or exposed to content scripts/settings.
const worker = new Worker('chatgpt-worker.js', { type: 'module' });
const pending = new Map();
let failed = false;
const stopped = { ok: false, error: { code: 'chatgpt_worker_stopped', message: 'The ChatGPT connection stopped. Sign in again.' } };
worker.onmessage = ({ data }) => { const respond = pending.get(data.id); if (respond) { pending.delete(data.id); respond(data); } };
worker.onerror = () => { failed = true; worker.terminate(); for (const respond of pending.values()) respond(stopped); pending.clear(); };
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.target !== 'chatgpt-runtime' || sender.id !== chrome.runtime.id || sender.tab || (sender.url && sender.url !== chrome.runtime.getURL('background.js'))) return;
  if (failed) { respond(stopped); return; }
  if (message.command === 'cancelOperation') { worker.postMessage(message); respond({ ok: true }); return; }
  pending.set(message.id, respond); worker.postMessage(message); return true;
});
