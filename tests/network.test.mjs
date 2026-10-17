import test from 'node:test';
import assert from 'node:assert/strict';
import { readJSON } from '../extension/network.js';

test('oversized and endless JSON responses are stopped and cancelled before buffering the full body', async () => {
  let reads = 0, cancelled = false;
  const response = new Response(new ReadableStream({ pull(controller) { reads++; controller.enqueue(new Uint8Array(600_000)); }, cancel() { cancelled = true; } }));
  await assert.rejects(readJSON(response), /too much data/);
  assert.ok(cancelled); assert.ok(reads < 5);
  let declaredCancelled = false;
  await assert.rejects(readJSON(new Response(new ReadableStream({ cancel() { declaredCancelled = true; } }), { headers: { 'content-length': '9000000' } })), /too much data/);
  assert.ok(declaredCancelled);
});

test('JSON streaming preserves split UTF-8, and parse errors never echo private response bodies', async () => {
  const bytes = new TextEncoder().encode('{"text":"你好"}');
  const body = new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); } });
  assert.deepEqual(await readJSON(new Response(body)), { text: '你好' });
  await assert.rejects(readJSON(new Response('private-api-token')), error => /unreadable JSON/.test(error.message) && !error.message.includes('private-api-token'));
});
