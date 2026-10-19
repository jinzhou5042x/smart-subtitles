import test from 'node:test';
import assert from 'node:assert/strict';
import { endpoint, validateWindow, validateSegments, cacheKeys, translateRemote } from '../extension/translation.js';
const cues = [{ id: 'a', text: 'Hello\nthere & you.', start: 1, end: 3 }, { id: 'b', text: 'Fine.', start: 3, end: 4 }];
const request = { cues, session: 'video1', epoch: 'one', context: [], title: 'Test' };
test('custom endpoints require HTTPS except explicit loopback; presets cannot leak keys to another host', () => {
  assert.equal(endpoint('custom', { baseUrl: 'http://127.0.0.1:11434/v1' }), 'http://127.0.0.1:11434/v1');
  assert.equal(endpoint('custom', { baseUrl: 'http://localhost:11434/v1' }), 'http://localhost:11434/v1');
  assert.throws(() => endpoint('custom', { baseUrl: 'http://[::1]:11434/v1' }), /Use http:\/\/localhost with the same port and path/);
  for (const baseUrl of ['http://evil.example/v1', 'https://key@evil.example', 'https://api.example?key=secret']) assert.throws(() => endpoint('custom', { baseUrl }));
  assert.throws(() => endpoint('google', { baseUrl: 'https://evil.example' }));
});
test('cache identity includes source, timestamps, language, provider, model and endpoint, never keys', async () => {
  const s = { target: 'es', provider: 'custom' }, p = { model: 'one', baseUrl: 'http://localhost:11434/v1', key: 'secret' };
  const keys = await cacheKeys(request, s, p);
  assert.deepEqual(keys, await cacheKeys(request, s, { ...p, key: 'replacement' }));
  for (const changed of [{ ...p, model: 'two' }, { ...p, baseUrl: 'http://localhost:1234/v1' }]) assert.notDeepEqual(keys, await cacheKeys(request, s, changed));
  assert.notDeepEqual(keys, await cacheKeys(request, { ...s, target: 'zh-CN' }, p));
});
test('Google uses direct API, counts Unicode characters and preserves cue timing', async () => {
  let sent;
  const result = await translateRemote({ provider: 'google', target: 'es' }, { key: 'test' }, request, undefined, async (url, options) => {
    sent = { url, ...options }; return Response.json({ data: { translations: [{ translatedText: 'Hola &amp; tú' }, { translatedText: 'Bien.' }] } });
  });
  assert.equal(sent.headers['X-Goog-Api-Key'], 'test'); assert.equal(sent.redirect, 'error');
  assert.equal(sent.credentials, 'omit'); assert.equal(sent.cache, 'no-store'); assert.equal(sent.referrerPolicy, 'no-referrer');
  assert.equal(JSON.parse(sent.body).q[0], 'Hello there & you.'); assert.equal(result.segments[0].text, 'Hola & tú'); assert.equal(result.segments[0].start, 1);
});
test('cloud adapters parse provider output with exact IDs and reject missing or shuffled cues', async () => {
  for (const provider of ['custom', 'openai', 'claude']) {
    const text = JSON.stringify({ segments: cues.map(c => ({ id: c.id, text: 'translated' })) });
    const body = provider === 'claude' ? { content: [{ type: 'text', text }] } : provider === 'openai' ? { output: [{ content: [{ type: 'output_text', text }] }] } : { choices: [{ message: { content: text } }] };
    const result = await translateRemote({ provider, target: 'es' }, { key: 'test', model: 'model', ...(provider === 'custom' ? { baseUrl: 'http://localhost:1234/v1' } : {}) }, request, undefined, async () => Response.json(body));
    assert.deepEqual(result.segments.map(s => s.sourceIds[0]), ['a', 'b']);
  }
  assert.throws(() => validateSegments([{ sourceIds: ['b'], text: 'B' }, { sourceIds: ['a'], text: 'A' }], cues));
  assert.throws(() => validateWindow({ ...request, cues: Array(17).fill(cues[0]) }));
});
test('API error messages do not expose provider responses or credentials', async () => {
  await assert.rejects(translateRemote({ provider: 'google', target: 'es' }, { key: 'secret-key' }, request, undefined, async () => new Response('secret-key', { status: 401 })), error => !error.message.includes('secret-key') && error.needsUser);
});
test('validated context retains bounded accepted translations and drops unrelated fields', () => {
 const r = validateWindow({ ...request, context: [{ ...cues[0], translation: '译文', credential: 'never-send' }, { ...cues[1], translation: 'x'.repeat(7000) }] });
 assert.equal(r.context[0].translation, '译文'); assert.equal(r.context[1].translation.length, 6000);
 assert.equal(r.context[0].credential, undefined);
});
const reply = { segments: cues.map(c => ({ id: c.id, text: 'translated' })) };
const ok = provider => provider === 'claude' ? { content: [{ type: 'text', text: JSON.stringify(reply) }], stop_reason: 'end_turn' }
  : provider === 'openai' ? { status: 'completed', output: [{ type: 'reasoning', summary: [] }, { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(reply) }] }] }
  : { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(reply) } }] };
const profileFor = provider => ({ key: 'k', ...(provider === 'qwen' ? { baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1' } : {}) });
async function sent(provider) { let body; await translateRemote({ provider, target: 'es' }, profileFor(provider), request, undefined, async (url, o) => { body = { url, ...JSON.parse(o.body), headers: o.headers }; return Response.json(ok(provider)); }); return body; }
test('each provider gets its documented request: JSON output, no default thinking, current models', async () => {
  const openai = await sent('openai');
  assert.equal(openai.url, 'https://api.openai.com/v1/responses'); assert.equal(openai.text.format.type, 'json_schema'); assert.equal(openai.text.format.strict, true); assert.equal(openai.reasoning.effort, 'low'); assert.equal(openai.store, false);
  const claude = await sent('claude');
  assert.equal(claude.model, 'claude-haiku-5-5'); assert.equal(claude.output_config.effort, 'low'); assert.equal(claude.output_config.format.type, 'json_schema');
  assert.equal(claude.headers['anthropic-version'], '2023-06-01'); assert.ok(claude.max_tokens >= 16000);
  const deepseek = await sent('deepseek');
  assert.equal(deepseek.url, 'https://api.deepseek.com/chat/completions'); assert.deepEqual(deepseek.thinking, { type: 'disabled' }); assert.equal(deepseek.response_format.type, 'json_object');
  const qwen = await sent('qwen');
  assert.equal(qwen.model, 'qwen3.8-flash'); assert.equal(qwen.enable_thinking, false); assert.equal(qwen.response_format.type, 'json_object');
  assert.match(JSON.stringify(qwen.messages), /JSON/, 'JSON mode requires the word JSON in the prompt');
  assert.throws(() => endpoint('qwen', { baseUrl: 'https://evil.example/compatible-mode/v1' }));
});
async function failed(provider, status, body, headers = {}) {
  return translateRemote({ provider, target: 'es' }, profileFor(provider), request, undefined, async () => Response.json(body, { status, headers })).then(() => null, e => e);
}
test('errors say whether the viewer must act (key, billing, quota) or a retry will do (rate limit, overload)', async () => {
  for (const [provider, status, body, headers, needsUser, words] of [
    ['openai', 429, { error: { type: 'insufficient_quota', code: 'credit_balance_exhausted' } }, {}, true, /credit/],
    ['openai', 429, { error: { code: 'slow_down' } }, {}, false, /rate limit/],
    ['claude', 402, { type: 'error', error: { type: 'billing_error' } }, {}, true, /balance|billing/],
    ['claude', 429, { error: { type: 'rate_limit_error' } }, { 'retry-after': '5' }, false, /rate limit/],
    ['claude', 429, { error: { type: 'rate_limit_error' } }, {}, true, /spending limit/],
    ['claude', 529, { error: { type: 'overloaded_error' } }, {}, false, /busy/],
    ['deepseek', 402, { error: { message: 'Insufficient Balance' } }, {}, true, /balance/],
    ['qwen', 400, { code: 'Arrearage' }, {}, true, /overdue/],
    ['qwen', 401, { code: 'InvalidApiKey' }, {}, true, /region/],
    ['google', 403, { error: { errors: [{ reason: 'userRateLimitExceeded' }] } }, {}, false, /rate limit/],
    ['google', 403, { error: { errors: [{ reason: 'dailyLimitExceeded' }] } }, {}, true, /daily quota/],
    ['google', 403, { error: { details: [{ reason: 'SERVICE_DISABLED' }] } }, {}, true, /not enabled/],
    ['google', 400, { error: { details: [{ reason: 'API_KEY_INVALID' }] } }, {}, true, /key/],
  ]) {
    const error = await failed(provider, status, body, headers);
    assert.equal(error.needsUser, needsUser, `${provider} ${status} ${JSON.stringify(body)}`); assert.match(error.message, words);
  }
});
test('cut-off, refused and empty replies are retried rather than shown', async () => {
  for (const [provider, body] of [['openai', { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }], ['openai', { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] }],
    ['claude', { content: [], stop_reason: 'max_tokens' }], ['deepseek', { choices: [{ finish_reason: 'stop', message: { content: '' } }] }], ['qwen', { choices: [{ finish_reason: 'length', message: { content: '{"seg' } }] }]]) {
    const error = await translateRemote({ provider, target: 'es' }, profileFor(provider), request, undefined, async () => Response.json(body)).then(() => null, e => e);
    assert.ok(error && error.needsUser === false, `${provider} ${JSON.stringify(body)}`);
  }
});
