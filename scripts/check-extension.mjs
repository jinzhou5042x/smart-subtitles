// Real installed extension in a fresh Chrome profile; the model server is a local test double.
import { chromium } from 'playwright';
import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
const calls = [], errors = [];
let releaseFirst, firstAborted = false;
async function waitForCall(count) {
  const deadline = Date.now() + 15000;
  while (calls.length < count && Date.now() < deadline) await delay(50);
  assert.ok(calls.length >= count, `Expected at least ${count} model requests`);
}
const vtt = 'WEBVTT\n\n' + Array.from({ length: 600 }, (_, i) => {
  const timestamp = s => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.000`;
  return `${timestamp(i * 3)} --> ${timestamp(i * 3 + 3)}\nDialogue ${i}\n`;
}).join('\n');
const server = http.createServer(async (req, res) => {
  if (req.url === '/v1/chat/completions') {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks)), prompt = JSON.parse(body.messages.at(-1).content); calls.push(prompt);
    if (calls.length === 1) {
      res.on('close', () => { if (!res.writableEnded) firstAborted = true; });
      await new Promise(resolve => { releaseFirst = resolve; });
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ segments: prompt.cues.map(c => ({ id: c.id, text: `Translated ${c.text}` })) }) } }], usage: { prompt_tokens: 30, completion_tokens: 20 } }));
  }
  if (req.url === '/demo') { res.setHeader('Content-Type', 'text/html'); return res.end(`<html><title>Test episode</title><video id="demo-video" width="960" height="540" src="/demo.mp4"><track kind="subtitles" srclang="en" src="/demo.vtt" default></video></html>`); }
  if (req.url === '/demo.vtt') { res.setHeader('Content-Type', 'text/vtt'); return res.end(vtt); }
  if (req.url === '/demo.mp4') { res.setHeader('Content-Type', 'video/mp4'); return res.end(await readFile(new URL('../tests/fixtures/demo.mp4', import.meta.url))); }
  res.writeHead(404); res.end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`, extension = path.resolve('dist/extension');
await writeFile(path.join(extension, 'browser-test-clock.js'), `globalThis.__testPlayback = { time: 900, paused: false, seeking: false }; Object.defineProperties(HTMLMediaElement.prototype, { duration: { configurable: true, get: () => 1800 }, currentTime: { configurable: true, get: () => globalThis.__testPlayback.time }, paused: { configurable: true, get: () => globalThis.__testPlayback.paused }, seeking: { configurable: true, get: () => globalThis.__testPlayback.seeking } });`);
const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
try {
  let worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).hostname;
  await worker.evaluate(() => chrome.scripting.registerContentScripts([{ id: 'test-clock', matches: ['http://127.0.0.1/*'], js: ['browser-test-clock.js'], runAt: 'document_start', world: 'ISOLATED', persistAcrossSessions: false }]));
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  const settings = await context.newPage(); await settings.goto(`chrome-extension://${id}/settings.html#custom`);
  await settings.locator('#baseUrl').fill(base + '/v1'); await settings.locator('#model').fill('fixture-model');
  await settings.getByRole('button', { name: 'Save and use', exact: true }).click();
  await settings.getByText('Saved. Translation uses this provider when you play a video.').waitFor();
  const page = await context.newPage(); await page.goto(base + '/demo');
  const setPlayback = (time, paused = false, seeking = false) => worker.evaluate(async playback => { const [tab] = await chrome.tabs.query({ url: 'http://127.0.0.1/*' }); await chrome.scripting.executeScript({ target: { tabId: tab.id }, args: [playback], func: playback => { globalThis.__testPlayback = playback; } }); }, { time, paused, seeking });
  const snapshot = () => settings.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: 'http://127.0.0.1/*' });
    return chrome.tabs.sendMessage(tabs[0].id, { type: 'snapshot' });
  });
  await waitForCall(1);
  assert.equal(calls[0].cues[0].text, 'Dialogue 0', 'start at the beginning even when the video opens halfway through');
  await setPlayback(1500); await page.waitForTimeout(500);
  await setPlayback(5, true, true); await page.waitForTimeout(500);
  assert.equal(calls.length, 1, 'forward and backward seeks must keep the in-flight batch');
  assert.equal(firstAborted, false, 'a seek must not abort the current API request');
  assert.equal((await snapshot()).translation.working, true);
  releaseFirst(); await setPlayback(5, true);
  await page.waitForFunction(() => Number(document.querySelector('#smart-subtitles')?.dataset.translated) === 600, null, { timeout: 60000 });
  assert.deepEqual(calls.flatMap(p => p.cues.map(c => c.text)), Array.from({ length: 600 }, (_, i) => `Dialogue ${i}`), 'translate every cue exactly once in order, even while paused');
  assert.ok(calls.every(p => p.cues.length <= 12), 'requests stay bounded');
  assert.equal(calls[1].contextOnly.find(c => c.text === 'Dialogue 0').translation, 'Translated Dialogue 0', 'carry accepted earlier translations into the next batch');
  const before = calls.length; await page.reload(); await setPlayback(900);
  await page.waitForFunction(() => Number(document.querySelector('#smart-subtitles')?.dataset.translated) === 600, null, { timeout: 60000 });
  assert.equal(calls.length, before, 'reloading reuses IndexedDB translations');
  await setPlayback(1500);
  await page.waitForFunction(() => document.querySelector('#smart-subtitles')?.dataset.subtitleTime === '1500');
  assert.equal(calls.length, before, 'seeking does not restart completed translation');
  const info = await snapshot(); assert.equal(info.translation.error, '');
  // Stop the real worker. Completed windows must remain available after it wakes again.
  const cdp = await context.newCDPSession(settings); await cdp.send('ServiceWorker.enable'); await cdp.send('ServiceWorker.stopAllWorkers');
  await page.reload(); worker = context.serviceWorkers().find(w => !w.isClosed?.()) || await context.waitForEvent('serviceworker'); await setPlayback(900); await page.waitForFunction(() => Number(document.querySelector('#smart-subtitles')?.dataset.translated) === 600, null, { timeout: 60000 });
  assert.equal(calls.length, before, 'a worker restart reuses the entire saved track');
  const builtin = await settings.evaluate(async () => ({ exposed: typeof Translator === 'function', availability: typeof Translator === 'function' ? await Translator.availability({ sourceLanguage: 'en', targetLanguage: 'es' }) : 'unavailable' }));
  console.log('Native browser Translator:', builtin);
  const popup = await context.newPage(); await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.locator('#provider').waitFor(); await mkdir('dist/checks', { recursive: true });
  await popup.locator('body').screenshot({ path: 'dist/checks/popup.png' });
  await settings.screenshot({ path: 'dist/checks/settings.png', fullPage: true });
  // Content scripts cannot read provider credentials from extension storage.
  const isolated = await worker.evaluate(async () => { const [tab] = await chrome.tabs.query({ url: 'http://127.0.0.1/*' }); return chrome.scripting.executeScript({ target: { tabId: tab.id }, func: async () => { try { await chrome.storage.local.get('profiles'); return false; } catch { return true; } } }); });
  assert.equal(isolated[0].result, true, 'API profiles are restricted to trusted extension contexts');
  const restricted = await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'http://127.0.0.1/*' });
    return chrome.scripting.executeScript({ target: { tabId: tab.id }, func: async () => {
      const results = [];
      for (const message of [{ type: 'profiles' }, { type: 'chatgptAccount', action: 'status' }, { type: 'saveSettings', settings: { provider: 'chatgpt' } }, { type: 'clearCache' }]) results.push(await chrome.runtime.sendMessage(message));
      return results;
    } });
  });
  assert.ok(restricted[0].result.every(reply => !reply.ok && /Settings page only/.test(reply.error)), 'video content scripts cannot access accounts, keys, or privileged settings');
  await settings.locator('#clear').click(); await settings.getByText('Saved translations cleared.', { exact: true }).waitFor();
  await waitForCall(before + 1); assert.equal(calls[before].cues[0].text, 'Dialogue 0', 'clearing the cache starts fresh at the beginning');
  await settings.locator('#provider').selectOption('builtin'); await settings.locator('#useBuiltin').click();
  await settings.getByText('Ready. Open your video and choose a language in the extension.').waitFor();
  await popup.reload(); await popup.locator('#provider').waitFor();
  assert.equal(await popup.locator('#provider').inputValue(), 'builtin');
  await popup.locator('body').screenshot({ path: 'dist/checks/popup.png' });
  await settings.screenshot({ path: 'dist/checks/settings.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log(`Extension passed: direct API, sequential 30-minute track, seeks during an active request, paused playback, cache after reload and worker restart, popup and settings (${calls.length} bounded model requests).`);
} finally { releaseFirst?.(); await context.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
