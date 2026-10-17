import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../extension/builtin.js', import.meta.url), 'utf8');
const cues = [{ id: 'a', text: 'Hello\nthere', start: 1, end: 2 }];
function harness(Translator) {
  const nodes = [], events = [];
  const element = tag => { const node = { tag, style: {}, append() {}, remove() { this.removed = true; }, attachShadow() { return { append() {} }; } }; nodes.push(node); return node; };
  const scope = { Translator, AbortController, AbortSignal, DOMException, Event, navigator: { userActivation: { isActive: false } }, document: { createElement: element, body: { append() {} } }, dispatchEvent: e => events.push(e.type) };
  vm.runInNewContext(source, scope);
  return { client: new scope.SubtitleBuiltin.BuiltinTranslator(), nodes, events, scope };
}
test('download waits for an actual button; closing invalidates a late language-pack result', async () => {
  let resolve, created = 0, destroyed = 0, signal;
  const h = harness({ availability: async () => 'downloadable', create: options => { created++; signal = options.signal; return new Promise(r => { resolve = r; }); } });
  await assert.rejects(h.client.translate(cues, 'es'), /Click Start subtitles/);
  assert.equal(created, 0);
  h.nodes.find(n => n.tag === 'button').onclick(); assert.equal(created, 1);
  h.client.close(); assert.equal(signal.aborted, true);
  resolve({ destroy() { destroyed++; } }); await new Promise(r => setImmediate(r));
  assert.equal(h.client.instance, null); assert.equal(destroyed, 1); assert.deepEqual(h.events, []);
});
test('changing language during availability cannot create an obsolete translator', async () => {
  let resolve, created = 0;
  const h = harness({ availability: () => new Promise(r => { resolve = r; }), create: () => { created++; } });
  const pending = h.client.translate(cues, 'es'); h.client.close(); resolve('available');
  await assert.rejects(pending, { name: 'AbortError' }); assert.equal(created, 0);
});
test('a prepared translator keeps cue timing and aborts stale output', async () => {
  let translated, destroyed = 0;
  const h = harness({ availability: async () => 'available', create: async () => ({ destroy() { destroyed++; }, translate: async text => { translated = text; return 'Hola'; } }) });
  const result = await h.client.translate(cues, 'es');
  assert.equal(translated, 'Hello there'); assert.equal(result[0].text, 'Hola'); assert.equal(result[0].start, 1);
  const stop = new AbortController(); stop.abort();
  await assert.rejects(h.client.translate(cues, 'es', stop.signal), { name: 'AbortError' });
  h.client.close(); assert.equal(destroyed, 1);
});
test('missing browser support and unsupported languages give an actionable error', async () => {
  for (const api of [undefined, { availability: async () => 'unavailable' }]) {
    await assert.rejects(harness(api).client.translate(cues, 'es'), error => error.needsUser && /cloud translator/.test(error.message));
  }
});
