import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { ChatGPTClient, AUTH_ORIGIN, API_ORIGIN, CALLBACK, PLAN_SCOPE, readResponsesStream } from '../extension/chatgpt-auth.js';

const pair = await generateKeyPair('RS256'), publicKey = { ...await exportJWK(pair.publicKey), kid: 'fixture', alg: 'RS256', use: 'sig' };
const request = { session: 'test', epoch: 'one', title: 'Test episode', context: [], cues: [{ id: 'c0', text: 'Hello.', start: 0, end: 2 }] };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const stream = events => new Response(events.map(e => `data: ${JSON.stringify(e)}\n\n`).join(''));
const output = JSON.stringify({ segments: [{ id: 'c0', text: '你好。' }] });
function fixture({ scope = PLAN_SCOPE, claims = {}, models = ['gpt-6-luna'] } = {}) {
  const calls = []; let clock = Date.now(), nonce, tokenNumber = 0, refreshGate, refreshError, revokeError;
  const client = new ChatGPTClient({ now: () => clock, fetcher: async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith('/jwks.json')) return json({ keys: [publicKey] });
    if (url.endsWith('/openid-configuration')) return json({ revocation_endpoint: `${AUTH_ORIGIN}/revoke` });
    if (url.endsWith('/revoke')) return revokeError ? json({}, 503) : new Response(null, { status: 200 });
    if (url.endsWith('/oauth/token')) {
      const form = new URLSearchParams(init.body);
      if (form.get('grant_type') === 'refresh_token') {
        if (refreshGate) await refreshGate;
        if (refreshError) return json({ error: refreshError }, 400);
      }
      const idToken = await new SignJWT({ nonce, email: 'viewer@example.test', ...claims }).setProtectedHeader({ alg: 'RS256', kid: 'fixture' }).setIssuer(claims.iss || AUTH_ORIGIN).setAudience(claims.aud || form.get('client_id')).setSubject(claims.sub || 'viewer-one').setIssuedAt(Math.floor(clock / 1000)).setExpirationTime(Math.floor(clock / 1000) + 3600).sign(pair.privateKey);
      return json({ access_token: `secret-access-${++tokenNumber}`, refresh_token: `secret-refresh-${tokenNumber}`, id_token: idToken, expires_in: 3600, scope });
    }
    if (url === `${API_ORIGIN}/v1/models`) return json({ models: models.map(slug => ({ slug, display_name: slug, visibility: 'list' })) });
    if (url === `${API_ORIGIN}/v1/responses`) return stream([{ type: 'response.output_text.delta', delta: output }, { type: 'response.completed', response: { usage: { input_tokens: 12, output_tokens: 4 } } }]);
    assert.fail(`Unexpected request: ${url}`);
  } });
  const begin = async (options = {}) => { const result = await client.begin({ tabId: 7, ...options }); const query = new URL(result.url).searchParams; nonce = query.get('nonce'); return query; };
  const finish = query => client.finish({ tabId: 7, code: 'fixture-code', state: query.get('state'), clientId: 'oaiapp_fixture' });
  const login = async () => { const query = await begin(); await finish(query); return query; };
  return { client, calls, begin, finish, login, advance: ms => { clock += ms; }, blockRefresh: promise => { refreshGate = promise; }, refreshError: code => { refreshError = code; }, revokeError: () => { revokeError = true; } };
}

test('ChatGPT requests use the global fetch receiver required by Chrome workers', async () => {
  const receivers = [];
  const client = new ChatGPTClient({ fetcher: async function () {
    receivers.push(this);
    if (this !== globalThis) throw new TypeError('Illegal invocation');
    return json({ keys: [publicKey] });
  } });
  assert.deepEqual(await client.checkConnection(), { reachable: true });
  assert.equal(receivers.length, 1);
  assert.equal(receivers[0], globalThis);
});

test('ChatGPT uses its issued client ID, PKCE, verified identity and direct Responses inference', async () => {
  const f = fixture(), query = await f.login();
  assert.equal(query.get('client_id'), 'dynamic_agent_client'); assert.equal(query.get('redirect_uri'), CALLBACK);
  assert.equal(query.get('agent_name_hint'), 'Smart Subtitles'); assert.ok(query.get('scope').includes(PLAN_SCOPE));
  const exchange = new URLSearchParams(f.calls.find(c => c.url.endsWith('/oauth/token')).init.body);
  assert.equal(exchange.get('client_id'), 'oaiapp_fixture'); assert.equal(exchange.get('redirect_uri'), CALLBACK);
  assert.equal(exchange.get('client_secret'), null);
  const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(exchange.get('code_verifier')))).toString('base64url');
  assert.equal(query.get('code_challenge'), challenge);
  const result = await f.client.translate({ request, target: 'zh-CN' }, new AbortController().signal);
  assert.equal(result.segments[0].text, '你好。'); assert.equal(result.usage.input_tokens, 12);
  const inference = f.calls.find(c => c.url.endsWith('/responses')), body = JSON.parse(inference.init.body);
  assert.equal(body.model, 'gpt-6-luna'); assert.equal(body.reasoning.effort, 'low');
  assert.equal(body.store, false); assert.equal(body.stream, true); assert.ok(Array.isArray(body.input));
  assert.equal(inference.init.redirect, 'error');
  for (const { init } of f.calls) { assert.equal(init.credentials, 'omit'); assert.equal(init.cache, 'no-store'); assert.equal(init.referrerPolicy, 'no-referrer'); }
  assert.doesNotMatch(JSON.stringify(f.client.status()) + JSON.stringify(f.client.metadata()), /secret-access|secret-refresh|eyJ/);
  await assert.rejects(f.finish(query), /expired|match/);
});

test('wrong tab, wrong state, changed client and expired authorization never exchange a code', async () => {
  const f = fixture(), query = await f.begin();
  for (const changes of [{ tabId: 9 }, { state: 'wrong' }]) await assert.rejects(f.client.finish({ tabId: 7, state: query.get('state'), code: 'code', clientId: 'oaiapp_fixture', ...changes }), /match/);
  assert.equal(f.calls.length, 0);
  await f.finish(query);
  const returning = await f.begin({ accountId: 'oaiapp_fixture' });
  assert.equal(returning.get('client_id'), 'oaiapp_fixture'); assert.equal(returning.get('agent_name_hint'), null);
  assert.equal(returning.get('id_token_hint'), null); // No identity token in browser history.
  const count = f.calls.length;
  await assert.rejects(f.client.finish({ tabId: 7, state: returning.get('state'), code: 'code', clientId: 'oaiapp_other' }), /registration/);
  f.advance(11 * 60000); await assert.rejects(f.finish(returning), /expired/); assert.equal(f.calls.length, count);
});

test('a valid identity without plan consent cannot spend subscription quota', async () => {
  const f = fixture({ scope: 'openid email profile' }); await f.login();
  assert.equal(f.client.status().accounts[0].connected, true); assert.equal(f.client.status().accounts[0].sharing, false);
  await assert.rejects(f.client.translate({ request, target: 'zh-CN' }), /Allow ChatGPT plan/);
  assert.ok(!f.calls.some(c => c.url.endsWith('/responses') || c.url.endsWith('/models')));
});

test('a saved registration without a known plan grant asks for consent again on every sign-in', async () => {
  // A Business member who connected before the workspace admin allowed plan usage: a silent
  // returning sign-in would reuse the old grant forever.
  const f = fixture({ scope: 'openid email profile offline_access' }); await f.login();
  assert.equal(f.client.status().accounts[0].plan, 'denied');
  assert.equal(f.client.metadata().accounts[0].plan, 'denied');
  const restarted = new ChatGPTClient({ metadata: f.client.metadata() }); // Chrome restarted: no tokens.
  assert.equal(new URL((await restarted.begin({ tabId: 7, accountId: 'oaiapp_fixture' })).url).searchParams.get('prompt'), 'consent');
  const legacy = new ChatGPTClient({ metadata: { accounts: [{ id: 'oaiapp_old', email: 'viewer@example.test' }] } });
  assert.equal(new URL((await legacy.begin({ tabId: 7, accountId: 'oaiapp_old' })).url).searchParams.get('prompt'), 'consent');
  const granted = fixture(); await granted.login();
  assert.equal(granted.client.status().accounts[0].plan, 'granted');
  assert.equal((await granted.begin({ accountId: 'oaiapp_fixture' })).get('prompt'), null);
});

test('OpenAI refusing the plan grant is shown and forces consent next time', async () => {
  const f = fixture(); await f.login();
  const original = f.client.fetcher;
  f.client.fetcher = async (url, init) => url.endsWith('/responses') ? json({ error: { code: 'chatpass_v2_scope_not_authorized' } }, 403) : original(url, init);
  await assert.rejects(f.client.translate({ request, target: 'zh-CN' }), e => e.code === 'chatpass_v2_scope_not_authorized' && e.needsUser);
  assert.equal(f.client.status().accounts[0].plan, 'denied');
  assert.equal((await f.begin({ accountId: 'oaiapp_fixture' })).get('prompt'), 'consent');
});

test('the reason OpenAI gives for a refused sign-in reaches the viewer, without markup', async () => {
  const f = fixture(), query = await f.begin();
  await assert.rejects(f.client.finish({ tabId: 7, state: query.get('state'), error: 'access_denied', errorDescription: 'Ask your <b>workspace admin</b>\nto allow this app.' }),
    e => /^OpenAI did not complete sign-in: Ask your .*workspace admin.* to allow this app\.$/.test(e.message) && !/[<>\n]/.test(e.message) && e.code === 'access_denied');
  const g = fixture(), next = await g.begin();
  await assert.rejects(g.client.finish({ tabId: 7, state: next.get('state'), error: 'access_denied' }), /cancelled/);
});

test('nonce, issuer and audience are checked before activating a registration', async () => {
  for (const claims of [{ nonce: 'wrong' }, { iss: 'https://example.test' }, { aud: 'oaiapp_other' }]) {
    const f = fixture({ claims }); await assert.rejects(f.login(), /verify/);
    assert.equal(f.client.status().active, ''); assert.equal(f.client.status().accounts[0].connected, false);
  }
});

test('refresh is serialized and uses the rotated token without changing the host or account', async () => {
  const f = fixture(); await f.login(); const before = f.client.metadata(); f.advance(3550000);
  await Promise.all([f.client.access('oaiapp_fixture'), f.client.access('oaiapp_fixture'), f.client.access('oaiapp_fixture')]);
  const refreshes = () => f.calls.filter(c => c.url.endsWith('/oauth/token') && new URLSearchParams(c.init.body).get('grant_type') === 'refresh_token');
  assert.equal(refreshes().length, 1); assert.equal(new URLSearchParams(refreshes()[0].init.body).get('refresh_token'), 'secret-refresh-1');
  f.advance(3550000); await f.client.access('oaiapp_fixture');
  assert.equal(new URLSearchParams(refreshes()[1].init.body).get('refresh_token'), 'secret-refresh-2');
  assert.deepEqual(f.client.metadata(), before);
});

test('terminal refresh errors require sign-in; transient refresh failures preserve the session', async () => {
  for (const code of ['invalid_grant', 'temporarily_unavailable']) {
    const f = fixture(); await f.login(); f.advance(3550000); f.refreshError(code);
    await assert.rejects(f.client.access('oaiapp_fixture'));
    assert.equal(f.client.status().accounts[0].connected, code !== 'invalid_grant');
  }
});

test('signing out during renewal cannot restore credentials when the old refresh completes', async () => {
  const f = fixture(); await f.login(); f.advance(3550000);
  let release; f.blockRefresh(new Promise(resolve => { release = resolve; }));
  const renewal = f.client.access('oaiapp_fixture'); await Promise.resolve();
  await f.client.signOut(); release(); await assert.rejects(renewal, /connection changed/);
  assert.equal(f.client.status().accounts[0].connected, false);
  assert.equal(f.client.metadata().accounts[0].id, 'oaiapp_fixture');
});

test('sign-out clears in-memory credentials even when remote revocation cannot be confirmed', async () => {
  const f = fixture(); await f.login(); f.revokeError();
  assert.equal((await f.client.signOut()).revoked, false);
  assert.equal(f.client.status().accounts[0].connected, false);
  const restarted = new ChatGPTClient({ metadata: f.client.metadata() });
  assert.equal(restarted.status().accounts[0].connected, false);
  assert.equal(restarted.metadata().hostId, f.client.metadata().hostId);
});

test('an unavailable default model requires an explicit selection', async () => {
  const f = fixture({ models: ['another-model'] }); await f.login();
  assert.equal(f.client.status().accounts[0].ready, false);
  await assert.rejects(f.client.translate({ request, target: 'zh-CN' }), /default model/);
  f.client.use({ model: 'another-model' });
  assert.equal(f.client.status().accounts[0].ready, true);
});

test('registrations stay separate even for the same email and verified subject', async () => {
  const f = fixture(); await f.login();
  const next = await f.begin();
  await f.client.finish({ tabId: 7, code: 'another-code', state: next.get('state'), clientId: 'oaiapp_workspace_two' });
  assert.equal(f.client.status().accounts.length, 2);
  assert.equal(f.client.status().active, 'oaiapp_workspace_two');
  f.client.use({ accountId: 'oaiapp_fixture', model: 'gpt-6-luna' });
  await f.client.signOut('oaiapp_workspace_two');
  assert.equal(f.client.status().accounts.find(a => a.id === 'oaiapp_fixture').ready, true);
  assert.equal(f.client.status().accounts.find(a => a.id === 'oaiapp_workspace_two').connected, false);
});

test('a cancelled or mismatched new sign-in cannot replace the working account', async () => {
  const claims = {}, f = fixture({ claims }); await f.login();
  claims.sub = 'another-person';
  const next = await f.begin({ accountId: 'oaiapp_fixture' });
  await assert.rejects(f.finish(next), /different ChatGPT account/);
  assert.equal(f.client.status().accounts[0].subject, 'viewer-one');
  assert.equal(f.client.status().accounts[0].ready, true);
  const cancelled = await f.begin(); f.client.cancel(7);
  await assert.rejects(f.finish(cancelled), /expired|match/);
  assert.equal(f.client.status().active, 'oaiapp_fixture');
});

test('SSE survives UTF-8 and CRLF splits and requires a completed response', async () => {
  const bytes = new TextEncoder().encode(`data: ${JSON.stringify({ type: 'response.output_text.delta', delta: output })}\r\n\r\ndata: ${JSON.stringify({ type: 'response.completed', response: { usage: {} } })}\r\n\r\n`);
  const response = new Response(new ReadableStream({ start(c) { for (const byte of bytes) c.enqueue(new Uint8Array([byte])); c.close(); } }));
  assert.equal((await readResponsesStream(response, request.cues)).segments[0].text, '你好。');
  await assert.rejects(readResponsesStream(stream([{ type: 'response.output_text.delta', delta: output }]), request.cues), /interrupted/);
  await assert.rejects(readResponsesStream(stream([{ type: 'response.output_text.delta', delta: output }, { type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } } }]), request.cues), /usage limit/);
});

test('connection errors identify the failing step without disclosing request secrets', async () => {
  const client = new ChatGPTClient({ fetcher: async () => { throw new TypeError('private-code-and-token'); } });
  await assert.rejects(client.checkConnection(), error => error.code === 'openai_network_error' && /Verify OpenAI identity/.test(error.message) && !error.message.includes('private-code'));
  await assert.rejects(client.json(`${AUTH_ORIGIN}/api/accounts/oauth/token`), /Exchange sign-in credentials.*auth.openai.com/);
  await assert.rejects(client.json(`${API_ORIGIN}/v1/models`), /Load ChatGPT models.*api.openai.com/);
  const controller = new AbortController(); controller.abort(new DOMException('expired', 'TimeoutError'));
  await assert.rejects(client.json(`${AUTH_ORIGIN}/.well-known/jwks.json`, { signal: controller.signal }), error => error.code === 'openai_timeout' && /timed out/.test(error.message));
});

test('the chosen reasoning effort is saved per account, sent with translations and kept valid for the model', async () => {
  const f = fixture(); await f.login();
  const account = () => f.client.status().accounts[0];
  assert.equal(account().effort, 'low'); assert.deepEqual(account().models.find(m => m.slug === 'gpt-6-luna').efforts, ['low', 'medium', 'high']);
  f.client.use({ model: 'gpt-6-luna', effort: 'high' });
  assert.equal(account().effort, 'high'); assert.equal(f.client.metadata().accounts[0].effort, 'high');
  await f.client.translate({ request, target: 'zh-CN' }, new AbortController().signal);
  assert.equal(JSON.parse(f.calls.filter(c => c.url.endsWith('/responses')).at(-1).init.body).reasoning.effort, 'high');
  f.client.use({ model: 'gpt-6-luna', effort: 'unsupported' });
  assert.equal(account().effort, 'high', 'an effort the model does not list is not taken');
});
