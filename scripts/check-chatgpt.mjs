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
// Host consent is simulated in this disposable profile. Keep the production DNR declaration:
// changing that API to an optional permission caused the first real login to hang.
assert.ok(manifest.permissions.includes('declarativeNetRequestWithHostAccess'));
assert.ok(!manifest.optional_permissions?.includes('declarativeNetRequestWithHostAccess'));
manifest.host_permissions.push('https://auth.openai.com/*', 'https://api.openai.com/*', 'http://127.0.0.1/*');
await writeFile(manifestFile, JSON.stringify(manifest));
const pair = await generateKeyPair('RS256'), key = { ...await exportJWK(pair.publicKey), kid: 'browser-check', alg: 'RS256', use: 'sig' };
let auth, inferenceCount = 0, limit = false, refreshCount = 0, authorizations = 0;
const errors = [];
const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
context.on('console', message => {
  if (/Content Security Policy.*(?:invalid|unrecognized|ignored)/i.test(message.text())) errors.push(message.text());
});
const sendJSON = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const authRoute = async route => {
  const url = new URL(route.request().url());
  if (url.pathname.endsWith('/authorize')) {
    auth = url.searchParams; authorizations++;
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Synthetic sign-in</title><p>Waiting for the test account.</p>' });
  }
  if (url.pathname === '/test/complete') {
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
  assert.deepEqual(errors, [], 'The browser must accept every CSP directive and source');
  // The shipped CSP must block injected scripts, including remote code on a permitted host.
  let remoteScripts = 0;
  await context.route('https://api.openai.com/security-check.js', route => { remoteScripts++; return route.fulfill({ contentType: 'text/javascript', body: 'globalThis.injectedRemote = true;' }); });
  await settings.evaluate(() => {
    globalThis.scriptViolations = 0;
    document.addEventListener('securitypolicyviolation', event => { if (event.effectiveDirective.startsWith('script-src')) scriptViolations++; });
    const inline = document.createElement('script'); inline.textContent = 'globalThis.injectedInline = true;'; document.body.append(inline);
    const remote = document.createElement('script'); remote.src = 'https://api.openai.com/security-check.js'; document.body.append(remote);
  });
  await settings.waitForFunction(() => scriptViolations >= 2);
  assert.equal(await settings.evaluate(() => !!(globalThis.injectedInline || globalThis.injectedRemote)), false);
  assert.equal(remoteScripts, 0);
  // Exercise an unanswered native prompt and rejection without clicking a real OS dialog.
  await settings.evaluate(() => {
    globalThis.realPermissionRequest = chrome.permissions.request.bind(chrome.permissions);
    globalThis.permissionRequests = 0;
    chrome.permissions.request = () => { permissionRequests++; return new Promise(resolve => { globalThis.resolvePermission = resolve; }); };
  });
  await settings.locator('#signin').click();
  await settings.getByText('Allow the connection in Chrome', { exact: true }).waitFor();
  assert.equal(await settings.locator('#signin').isDisabled(), true);
  await settings.locator('#signin').evaluate(button => button.click());
  await settings.waitForTimeout(2200); // A status poll must not re-enable the button.
  assert.equal(await settings.locator('#signin').isDisabled(), true);
  assert.equal(await settings.evaluate(() => permissionRequests), 1);
  await settings.evaluate(() => resolvePermission(false));
  await settings.getByText('Could not connect', { exact: true }).waitFor();
  assert.equal(await settings.locator('#signin').isEnabled(), true);
  assert.equal(authorizations, 0);
  await settings.evaluate(() => { chrome.permissions.request = realPermissionRequest; });
  // Reproduce the original never-settling browser API. It must become a retryable error.
  await worker.evaluate(() => {
    globalThis.realUpdateRules = chrome.declarativeNetRequest.updateSessionRules.bind(chrome.declarativeNetRequest);
    chrome.declarativeNetRequest.updateSessionRules = rules => rules.addRules ? new Promise(() => {}) : realUpdateRules(rules);
  });
  await settings.locator('#signin').click();
  await settings.getByText('Opening ChatGPT…', { exact: true }).first().waitFor();
  await settings.getByText('Could not connect', { exact: true }).waitFor({ timeout: 30000 });
  assert.match(await settings.locator('#loginDetail').innerText(), /Could not open ChatGPT/);
  assert.equal(await settings.locator('#signin').isEnabled(), true);
  assert.equal(authorizations, 0);
  assert.equal((await settings.evaluate(() => chrome.runtime.sendMessage({ type: 'chatgptAccount', action: 'status' }))).data.pending, false);
  assert.equal((await worker.evaluate(() => chrome.declarativeNetRequest.getSessionRules())).length, 0);
  await worker.evaluate(() => { chrome.declarativeNetRequest.updateSessionRules = realUpdateRules; });
  let opening = context.waitForEvent('page');
  await settings.getByRole('button', { name: 'Continue with ChatGPT', exact: true }).click();
  let connected = await opening;
  await connected.waitForURL('https://auth.openai.com/api/accounts/authorize?**');
  await settings.getByText('Finish signing in on OpenAI', { exact: true }).waitFor();
  assert.equal(await settings.locator('#signin').isVisible(), false);
  assert.equal(await settings.locator('#account').isDisabled(), true);
  await settings.locator('#signin').evaluate(button => button.click());
  assert.equal(authorizations, 1, 'repeat clicks cannot start another authorization');
  // A loopback callback in any other tab must not be captured by this login's rule.
  await context.route('http://127.0.0.1:1455/auth/callback?**', route => route.fulfill({ contentType: 'text/plain', body: 'Unrelated tab' }));
  const unrelated = await context.newPage();
  await unrelated.goto('http://127.0.0.1:1455/auth/callback?code=unrelated&state=unrelated');
  assert.ok(unrelated.url().startsWith('http://127.0.0.1:1455/'));
  await unrelated.close();
  await mkdir('dist/checks', { recursive: true }); await settings.screenshot({ path: 'dist/checks/chatgpt-waiting.png', fullPage: true });
  await settings.locator('#cancelLogin').click();
  await settings.getByText('Sign-in cancelled.', { exact: true }).waitFor();
  assert.equal(await settings.locator('#signin').isEnabled(), true);
  assert.equal((await worker.evaluate(() => chrome.declarativeNetRequest.getSessionRules())).length, 0);
  opening = context.waitForEvent('page');
  await settings.locator('#signin').click(); connected = await opening;
  await connected.waitForURL('https://auth.openai.com/api/accounts/authorize?**');
  await connected.close();
  await settings.getByText('The sign-in page was closed. Please try again.', { exact: true }).waitFor();
  assert.equal(await settings.locator('#signin').isEnabled(), true);
  opening = context.waitForEvent('page');
  await settings.locator('#signin').click(); connected = await opening;
  await connected.waitForURL('https://auth.openai.com/api/accounts/authorize?**');
  await connected.goto('https://auth.openai.com/test/complete');
  await connected.waitForURL(`chrome-extension://${id}/settings.html#chatgpt`, { timeout: 30000 });
  await connected.getByRole('button', { name: 'Got it', exact: true }).click();
  await connected.getByText('Using ChatGPT plan', { exact: true }).waitFor();
  await settings.getByText('Using ChatGPT plan', { exact: true }).waitFor();
  assert.equal(await settings.locator('#signin').isVisible(), false, 'the original settings tab also reflects completed sign-in');
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
  await connected.getByText('Connect your ChatGPT account', { exact: true }).waitFor();
  // An unexpectedly closed offscreen document must recover without trapping the UI.
  await worker.evaluate(() => chrome.offscreen.closeDocument());
  await connected.waitForFunction(async () => {
    const reply = await chrome.runtime.sendMessage({ type: 'chatgptAccount', action: 'status' });
    return reply.ok && reply.data.accounts.length === 1 && !reply.data.accounts[0].connected;
  });
  assert.doesNotMatch(JSON.stringify(await worker.evaluate(() => chrome.storage.local.get(null))), /synthetic-access|synthetic-refresh|eyJ/);
  assert.deepEqual(errors, []);
  console.log('ChatGPT browser check passed: CSP, tab-specific callback rules, pending/denied permission UI, stalled startup recovery, duplicate-click prevention, cancellation/retry, closed-tab recovery, OAuth callback, PKCE/JWT, renewal, translation, sleeping service worker, quota error, sign-out, and no persisted tokens. Host consent and OpenAI responses are simulated.');
} catch (error) {
  for (const page of context.pages()) if (page.url().startsWith('chrome-extension://')) console.error('Extension check state:', await page.locator('body').innerText().catch(() => 'unavailable'));
  throw error;
} finally { await context.close(); await new Promise(resolve => server.close(resolve)); }
