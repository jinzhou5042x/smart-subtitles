// Installed production extension with synthetic OpenAI OAuth/JWKS/API responses.
// This tests browser plumbing; it is not evidence of real account eligibility.
import { chromium } from 'playwright';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { buildExtension } from './extension-build.mjs';
const extension = path.resolve('dist/checks/chatgpt-extension');
await buildExtension(extension, { store: true });
const manifestFile = path.join(extension, 'manifest.json'), manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
// Simulate the permissions already approved by the user; production requests them on click.
manifest.permissions.push('declarativeNetRequestWithHostAccess');
manifest.host_permissions.push('https://auth.openai.com/*', 'https://api.openai.com/*', 'http://127.0.0.1/*');
await writeFile(manifestFile, JSON.stringify(manifest));
const pair = await generateKeyPair('RS256'), key = { ...await exportJWK(pair.publicKey), kid: 'browser-check', alg: 'RS256', use: 'sig' };
let auth, inferenceCount = 0, limit = false, refreshCount = 0;
const errors = [];
const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
const sendJSON = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const authRoute = async route => {
  const url = new URL(route.request().url());
  if (url.pathname.endsWith('/authorize')) {
    auth = url.searchParams;
    const callback = new URL(auth.get('redirect_uri')); callback.search = new URLSearchParams({ code: 'synthetic-code', state: auth.get('state'), client_id: 'oaiapp_browser' });
    return route.fulfill({ status: 302, headers: { location: callback.href }, body: '' });
  }
  if (url.pathname.endsWith('/jwks.json')) return sendJSON(route, { keys: [key] });
  if (url.pathname.endsWith('/openid-configuration')) return sendJSON(route, { revocation_endpoint: 'https://auth.openai.com/revoke' });
  if (url.pathname.endsWith('/revoke')) return route.fulfill({ status: 200, body: '' });
  if (url.pathname.endsWith('/oauth/token')) {
    const form = new URLSearchParams(route.request().postData()); assert.equal(form.get('client_id'), 'oaiapp_browser');
    if (form.get('grant_type') === 'authorization_code') {
      assert.equal(form.get('redirect_uri'), auth.get('redirect_uri'));
      assert.equal(Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(form.get('code_verifier')))).toString('base64url'), auth.get('code_challenge'));
    } else refreshCount++;
    const idToken = await new SignJWT({ nonce: auth.get('nonce'), email: 'viewer@example.test' }).setProtectedHeader({ alg: 'RS256', kid: 'browser-check' }).setIssuer('https://auth.openai.com').setAudience('oaiapp_browser').setSubject('browser-viewer').setIssuedAt().setExpirationTime('1h').sign(pair.privateKey);
    return sendJSON(route, { access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', id_token: idToken, expires_in: refreshCount ? 3600 : 30, scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct' });
  }
  return route.abort();
};
const apiRoute = async route => {
  assert.equal(route.request().headers().authorization, 'Bearer synthetic-access');
  if (route.request().url().endsWith('/models')) return sendJSON(route, { models: [{ slug: 'gpt-6-luna', display_name: 'GPT-6 Luna', visibility: 'list' }] });
  assert.ok(route.request().url().endsWith('/responses')); inferenceCount++;
  const body = route.request().postDataJSON(); assert.equal(body.stream, true); assert.equal(body.store, false); assert.equal(body.reasoning.effort, 'low');
  const prompt = JSON.parse(body.input[0].content), text = JSON.stringify({ segments: prompt.cues.map(c => ({ id: c.id, text: '你好。' })) });
  const events = limit ? [{ type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } } }] : [{ type: 'response.output_text.delta', delta: text }, { type: 'response.completed', response: { usage: { input_tokens: 10, output_tokens: 4 } } }];
  return route.fulfill({ status: 200, contentType: 'text/event-stream', body: events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('') });
};
await context.route('https://auth.openai.com/**', authRoute);
// Playwright cannot route fetches from a worker owned by an offscreen document.
// Redirect only this test build's worker transport to a local test server.
const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const chunks = []; for await (const part of req) chunks.push(part);
  const data = Buffer.concat(chunks).toString(), url = decodeURIComponent(req.url.slice(1));
  const route = { request: () => ({ url: () => url, postData: () => data, postDataJSON: () => JSON.parse(data), headers: () => req.headers }),
    fulfill: ({ status, contentType, headers, body }) => { res.writeHead(status, { ...(contentType ? { 'Content-Type': contentType } : {}), ...headers }); res.end(body); },
    abort: () => { res.writeHead(500); res.end(); } };
  try { await (url.startsWith('https://auth.openai.com/') ? authRoute : apiRoute)(route); }
  catch (error) { errors.push(error.message); res.writeHead(500); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const workerFile = path.join(extension, 'chatgpt-worker.js');
await writeFile(workerFile, `const testFetch = self.fetch; self.fetch = (url, init) => testFetch('http://127.0.0.1:${server.address().port}/' + encodeURIComponent(url), init);\n` + await readFile(workerFile, 'utf8'));
try {
  let worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).hostname;
  context.on('page', page => page.on('pageerror', e => errors.push(e.message)));
  const settings = await context.newPage(); await settings.goto(`chrome-extension://${id}/settings.html#chatgpt`);
  const opening = context.waitForEvent('page');
  await settings.getByRole('button', { name: 'Continue with ChatGPT', exact: true }).click();
  const connected = await opening;
  await connected.waitForURL(`chrome-extension://${id}/settings.html#chatgpt`, { timeout: 30000 });
  await connected.getByRole('button', { name: 'Got it', exact: true }).click();
  await connected.getByText('Using ChatGPT plan', { exact: true }).waitFor();
  await connected.locator('#testChatgpt').click(); await connected.getByText('Connected: 你好。', { exact: true }).waitFor();
  assert.equal(refreshCount, 1); assert.equal(inferenceCount, 1);
  const local = await worker.evaluate(() => chrome.storage.local.get(null));
  assert.doesNotMatch(JSON.stringify(local), /synthetic-access|synthetic-refresh|eyJ/);
  assert.equal(local.preferences.provider, 'chatgpt');
  assert.equal((await worker.evaluate(() => chrome.declarativeNetRequest.getSessionRules())).length, 0);
  // Credentials remain in the dedicated worker while the MV3 service worker sleeps.
  const cdp = await context.newCDPSession(connected); await cdp.send('ServiceWorker.enable'); await cdp.send('ServiceWorker.stopAllWorkers');
  await connected.reload(); await connected.getByText('Using ChatGPT plan', { exact: true }).waitFor();
  worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  limit = true; await connected.locator('#testChatgpt').click(); await connected.getByText('ChatGPT usage limit reached. Open Manage usage in Translator settings.', { exact: true }).waitFor();
  assert.equal(await connected.locator('#usageLimit a').getAttribute('href'), 'https://chatgpt.com/settings/usage');
  assert.equal(await connected.locator('#usageLimit').isVisible(), true);
  assert.equal(inferenceCount, 2);
  await mkdir('dist/checks', { recursive: true }); await connected.screenshot({ path: 'dist/checks/chatgpt-settings.png', fullPage: true });
  await connected.locator('#signout').click(); await connected.getByText('Signed out of Smart Subtitles.', { exact: true }).waitFor();
  await connected.getByText('Sign in to use your ChatGPT plan.', { exact: true }).waitFor();
  // An unexpectedly closed offscreen document must recover without trapping the UI.
  await worker.evaluate(() => chrome.offscreen.closeDocument());
  await connected.waitForFunction(async () => {
    const reply = await chrome.runtime.sendMessage({ type: 'chatgptAccount', action: 'status' });
    return reply.ok && reply.data.accounts.length === 1 && !reply.data.accounts[0].connected;
  });
  assert.doesNotMatch(JSON.stringify(await worker.evaluate(() => chrome.storage.local.get(null))), /synthetic-access|synthetic-refresh|eyJ/);
  assert.deepEqual(errors, []);
  console.log('ChatGPT browser check passed: OAuth callback without a local listener, PKCE/JWT, renewal, streamed translation, sleeping service worker, quota error, sign-out, and no persisted tokens.');
} catch (error) {
  for (const page of context.pages()) if (page.url().startsWith('chrome-extension://')) console.error('Extension check state:', await page.locator('body').innerText().catch(() => 'unavailable'));
  throw error;
} finally { await context.close(); await new Promise(resolve => server.close(resolve)); }
