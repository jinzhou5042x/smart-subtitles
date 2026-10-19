import test from 'node:test';
import assert from 'node:assert/strict';
import '../extension/session.js';
const { TranslationSession, nextWindow } = globalThis.SubtitleSession;
const cues = Array.from({ length: 600 }, (_, i) => ({ id: `c${i}`, text: `Line ${i}`, start: i * 3, end: i * 3 + 2.9 }));
const segments = cues => cues.map(c => ({ sourceIds: [c.id], text: `Translated ${c.text}`, start: c.start, end: c.end }));
const where = { session: 'video-one', title: 'Test', time: 0 };
function setup(handler) { const asked = []; let serial = 0, clock = 0; const session = new TranslationSession({ id: () => String(++serial), now: () => clock, send: async m => { asked.push(m); if (['cancel', 'ping'].includes(m.type)) return {}; return handler(m); } }); session.use(cues); session.configure({ provider: 'google', target: 'zh-CN', enabled: true }); return { session, asked, advance: (ms = 1000) => { clock += ms; } }; }
test('opening a video at 15 minutes still starts translation at the first cue', async () => {
 const { session, asked } = setup(m => ({ segments: segments(m.request.cues) }));
 await session.run({ ...where, time: 900 });
 const window = asked.find(m => m.type === 'translateWindow').request;
 assert.equal(window.cues[0].id, 'c0'); assert.ok(window.cues.length <= 12);
 assert.equal(session.lines.size, window.cues.length);
});
test('seeking in either direction keeps the active request and continues the same queue', async () => {
 let finish;
 const { session, asked, advance } = setup(m => m.request.cues[0].id === 'c0' ? new Promise(resolve => { finish = () => resolve({ segments: segments(m.request.cues) }); }) : { segments: segments(m.request.cues) });
 asked.length = 0;
 const pending = session.run(where); await Promise.resolve();
 const epoch = session.epoch;
 await session.run({ ...where, time: 900 }); await session.run({ ...where, time: 5 });
 assert.equal(asked.filter(m => m.type === 'translateWindow').length, 1);
 assert.equal(session.epoch, epoch); assert.equal(session.controller.signal.aborted, false);
 finish(); await pending;
 assert.equal(session.lines.has('c0'), true); assert.equal(session.lines.has('c300'), false);
 advance(); await session.run({ ...where, time: 1500 });
 const requests = asked.filter(m => m.type === 'translateWindow').map(m => m.request);
 assert.equal(requests[1].cues[0].id, `c${requests[0].cues.length}`);
 assert.equal(requests[1].context.find(c => c.id === 'c0').translation, 'Translated Line 0');
 assert.ok(!asked.some(m => m.type === 'cancel'));
});
test('a language change discards an old response', async () => {
 let finish; const { session } = setup(m => new Promise(resolve => { finish = () => resolve({ segments: segments(m.request.cues) }); }));
 const pending = session.run(where); await Promise.resolve(); session.configure({ provider: 'google', target: 'es', enabled: true }); finish(); await pending;
 assert.equal(session.lines.size, 0); assert.equal(session.busy, false);
});
test('what only the viewer can fix pauses at once and asks for them', async () => {
 const { session, asked, advance } = setup(() => { throw Object.assign(new Error('Quota exceeded'), { needsUser: true }); });
 await session.run(where); advance(120000); await session.run({ ...where, time: 900 }); await session.run({ ...where, time: 0 });
 assert.equal(asked.filter(m => m.type === 'translateWindow').length, 1); assert.match(session.error, /Quota/); assert.equal(session.needsUser, true);
 session.retry(); await session.run(where); assert.equal(asked.filter(m => m.type === 'translateWindow').length, 2);
});
test('timeouts and dropped connections are retried a bounded number of times, then pause', async () => {
 const { session, asked, advance } = setup(() => { throw new Error('Translation timed out.'); });
 const sent = () => asked.filter(m => m.type === 'translateWindow').length;
 await session.run(where); assert.equal(sent(), 1); assert.equal(session.error, ''); assert.match(session.interrupted, /timed out/);
 await session.run(where); assert.equal(sent(), 1, 'waits before trying again');
 for (const pause of [3000, 15000, 60000]) { advance(pause); await session.run(where); }
 assert.equal(sent(), 4); assert.match(session.error, /timed out/); assert.equal(session.needsUser, false);
 advance(600000); await session.run(where); assert.equal(sent(), 4, 'never retried without end');
});
test('a recovered connection carries on and resets the retry count', async () => {
 let fail = true; const { session, asked, advance } = setup(m => { if (fail) { fail = false; throw new Error('Network error'); } return { segments: segments(m.request.cues) }; });
 await session.run(where); advance(3000); await session.run(where);
 assert.equal(session.interrupted, ''); assert.equal(session.attempts, 0); assert.ok(session.lines.size > 0);
 assert.equal(asked.filter(m => m.type === 'translateWindow').length, 2);
});
test('batches are bounded and resume at the earliest untranslated cue, including cache gaps', () => {
 const held = new Map([...cues.slice(0, 10), ...cues.slice(20, 40)].map(c => [c.id, {}]));
 assert.equal(nextWindow(cues, held)[0].id, 'c10');
 const window = nextWindow(cues, new Map());
 assert.ok(window.length <= 12); assert.ok(window.every(c => c.start < 30));
 assert.deepEqual(nextWindow(cues, new Map(cues.map(c => [c.id, {}]))), []);
});

test('a paused video can finish the entire track in order without translating any cue twice', async () => {
 const { session, asked, advance } = setup(m => ({ segments: segments(m.request.cues) }));
 for (let i = 0; i < cues.length && !session.complete; i++) {
   await session.run({ ...where, time: 900, paused: true }); advance();
 }
 assert.equal(session.complete, true);
 assert.deepEqual(asked.filter(m => m.type === 'translateWindow').flatMap(m => m.request.cues.map(c => c.id)), cues.map(c => c.id));
 const count = asked.length; await session.run({ ...where, time: 0 }); assert.equal(asked.length, count);
});
test('built-in results are cached through the extension', async () => {
 const messages = [];
 const session = new TranslationSession({ now: () => 0, builtin: { close() {}, translate: async list => segments(list) }, send: async m => { messages.push(m); return m.type === 'translateWindow' ? { segments: [], missing: m.request.cues } : {}; } });
 session.use(cues); await session.run(where);
 assert.ok(session.lines.size > 0); assert.ok(messages.some(m => m.type === 'saveBuiltin'));
});
test('later windows include accepted translations as context without translating them again', async () => {
 const { session, asked, advance } = setup(m => ({ segments: segments(m.request.cues) }));
 await session.run(where); advance(); await session.run(where);
 const requests = asked.filter(m => m.type === 'translateWindow').map(m => m.request);
 assert.equal(requests.length, 2);
 assert.equal(requests[1].context.find(c => c.id === 'c0').translation, 'Translated Line 0');
 assert.ok(!requests[1].cues.some(c => c.id === 'c0'));
 assert.ok(requests[1].context.some(c => !c.translation));
});
