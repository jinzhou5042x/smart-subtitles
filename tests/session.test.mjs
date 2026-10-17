import test from 'node:test';
import assert from 'node:assert/strict';
import '../extension/session.js';
const { TranslationSession, nextWindow } = globalThis.SubtitleSession;
const cues = Array.from({ length: 600 }, (_, i) => ({ id: `c${i}`, text: `Line ${i}`, start: i * 3, end: i * 3 + 2.9 }));
const segments = cues => cues.map(c => ({ sourceIds: [c.id], text: `Translated ${c.text}`, start: c.start, end: c.end }));
const where = { session: 'video-one', title: 'Test', time: 0 };
function setup(handler) { const asked = []; let serial = 0; const session = new TranslationSession({ id: () => String(++serial), now: () => 0, send: async m => { asked.push(m); if (['cancel', 'ping'].includes(m.type)) return {}; return handler(m); } }); session.use(cues); session.configure({ provider: 'google', target: 'zh-CN', enabled: true }); return { session, asked }; }
test('seeking to 15 minutes requests nearby dialogue, never the earlier backlog', async () => {
 const { session, asked } = setup(m => ({ segments: segments(m.request.cues) }));
 await session.run({ ...where, time: 900 });
 const window = asked.find(m => m.type === 'translateWindow').request;
 assert.ok(window.cues[0].start >= 897); assert.ok(window.cues.length <= 12);
 assert.ok(window.context.some(c => c.start < 900)); assert.equal(session.lines.size, window.cues.length);
});
test('a seek cancels a running window and discards its late result', async () => {
 let finish;
 const { session, asked } = setup(m => m.request.cues[0].id === 'c0' ? new Promise(resolve => { finish = () => resolve({ segments: segments(m.request.cues) }); }) : { segments: segments(m.request.cues) });
 const pending = session.run(where); await Promise.resolve();
 await session.run({ ...where, time: 900 }); finish(); await pending;
 assert.equal(session.lines.has('c0'), false); assert.equal(session.lines.has('c300'), true);
 assert.ok(asked.some(m => m.type === 'cancel'));
});
test('a language change discards an old response', async () => {
 let finish; const { session } = setup(m => new Promise(resolve => { finish = () => resolve({ segments: segments(m.request.cues) }); }));
 const pending = session.run(where); await Promise.resolve(); session.configure({ provider: 'google', target: 'es', enabled: true }); finish(); await pending;
 assert.equal(session.lines.size, 0); assert.equal(session.busy, false);
});
test('quota errors and timeouts pause instead of making unbounded paid retries', async () => {
 const { session, asked } = setup(() => { throw new Error('Quota exceeded'); });
 await session.run(where); await session.run(where);
 assert.equal(asked.filter(m => m.type === 'translateWindow').length, 1); assert.match(session.error, /Quota/);
 session.retry(); await session.run(where); assert.equal(asked.filter(m => m.type === 'translateWindow').length, 2);
});
test('prefetch is bounded; pause fetches less; cached lines are skipped', () => {
 const held = new Map(cues.slice(0, 10).map(c => [c.id, {}]));
 assert.equal(nextWindow(cues, held, 0, true).length, 0);
 assert.equal(nextWindow(cues, held, 0)[0].id, 'c10');
 assert.ok(nextWindow(cues, new Map(), 0).every(c => c.start < 30));
});
test('built-in results are cached through the extension', async () => {
 const messages = [];
 const session = new TranslationSession({ now: () => 0, builtin: { close() {}, translate: async list => segments(list) }, send: async m => { messages.push(m); return m.type === 'translateWindow' ? { segments: [], missing: m.request.cues } : {}; } });
 session.use(cues); await session.run(where);
 assert.ok(session.lines.size > 0); assert.ok(messages.some(m => m.type === 'saveBuiltin'));
});
test('later windows include accepted translations as context without translating them again', async () => {
 const { session, asked } = setup(m => ({ segments: segments(m.request.cues) }));
 await session.run(where); session.retry(); await session.run(where);
 const requests = asked.filter(m => m.type === 'translateWindow').map(m => m.request);
 assert.equal(requests.length, 2);
 assert.equal(requests[1].context.find(c => c.id === 'c0').translation, 'Translated Line 0');
 assert.ok(!requests[1].cues.some(c => c.id === 'c0'));
 assert.ok(requests[1].context.some(c => !c.translation));
});
