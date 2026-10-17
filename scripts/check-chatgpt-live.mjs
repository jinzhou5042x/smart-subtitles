// Interactive check against OpenAI, using an isolated browser profile.
// Login is completed by the user; this script never reads credentials or the auth page.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildExtension } from './extension-build.mjs';
import { withDeadline } from '../extension/async.js';
const extension = path.resolve('dist/checks/chatgpt-live-extension');
await buildExtension(extension, { store: true });
const context = await chromium.launchPersistentContext(path.resolve('data/browser-chatgpt-live'), {
  channel: 'chromium', headless: false,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
const settings = await context.newPage();
const url = `chrome-extension://${new URL(worker.url()).hostname}/settings.html#chatgpt`;
await settings.goto(url);
console.log('Independent Chrome window ready. Use Continue with ChatGPT and complete OpenAI sign-in.');
let last = '', tested = false;
while (context.pages().length) {
  try {
    const state = await withDeadline(settings.evaluate(() => chrome.runtime.sendMessage({ type: 'chatgptAccount', action: 'status' })), 15000, 'Extension status did not respond.');
    const account = state.data?.accounts.find(a => a.id === state.data.active);
    const status = state.data?.login?.phase || (state.data?.loginError ? 'sign-in-error' : account?.ready ? 'ready' : account?.sharing ? 'choose-model' : account?.connected ? 'plan-permission-needed' : 'signed-out');
    if (last !== status) { console.log(`ChatGPT connection: ${status}`); last = status; }
    if (account?.ready && !tested) {
      tested = true;
      const result = await settings.evaluate(() => chrome.runtime.sendMessage({ type: 'testProfile', provider: 'chatgpt' }));
      const check = { timestamp: new Date().toISOString(), mode: 'real OpenAI account; production extension', model: account.model, ok: result.ok, text: result.data?.text, usage: result.data?.usage, error: result.error };
      await mkdir('dist/checks', { recursive: true });
      await writeFile('dist/checks/chatgpt-live-result.json', JSON.stringify(check, null, 2));
      console.log(JSON.stringify(check));
      console.log('Live check complete. Chrome remains open for manual testing.');
    }
  } catch { break; }
  await new Promise(resolve => setTimeout(resolve, 2000));
}
await context.close();
