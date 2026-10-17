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
