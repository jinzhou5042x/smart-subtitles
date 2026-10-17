import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { HOST_NAME, STORE_EXTENSION_ID, allowedOrigins, answer, frame, hostManifest, readMessage } from '../service/native-host.mjs';

const store = `chrome-extension://${STORE_EXTENSION_ID}/`, token = 'a'.repeat(48);
const config = { port: 43127, pairingToken: token };

test('messages are framed as Chrome frames them, also when they arrive in pieces', async () => {
  const bytes = frame({ type: 'connect', text: 'é字' });
  assert.equal(bytes.readUInt32LE(0), bytes.length - 4);
  assert.deepEqual(await readMessage(Readable.from([bytes])), { type: 'connect', text: 'é字' });
  assert.deepEqual(await readMessage(Readable.from([bytes.subarray(0, 2), bytes.subarray(2, 9), bytes.subarray(9)])), { type: 'connect', text: 'é字' });
  await assert.rejects(readMessage(Readable.from([bytes.subarray(0, 6)])), /No message/);
  const huge = Buffer.alloc(4); huge.writeUInt32LE(10_000_000);
  await assert.rejects(readMessage(Readable.from([huge])), /too large/);
});

test('only the store extension and the IDs the user listed may start the companion', () => {
  const development = 'abcdefghijklmnopabcdefghijklmnop';
  assert.deepEqual(allowedOrigins({}), [store]);
  assert.deepEqual(allowedOrigins({ extensionIds: [development, 'not-an-id', 'ABCDEFGHIJKLMNOPABCDEFGHIJKLMNOP', 7, STORE_EXTENSION_ID] }), [store, `chrome-extension://${development}/`]);
  assert.deepEqual(allowedOrigins({ extensionIds: '*' }), [store]);
  const manifest = hostManifest('C:\\app\\host.cmd', {});
  assert.equal(manifest.name, HOST_NAME); assert.match(manifest.name, /^[a-z0-9_]+(\.[a-z0-9_]+)*$/);
  assert.equal(manifest.type, 'stdio'); assert.equal(manifest.path, 'C:\\app\\host.cmd'); assert.deepEqual(manifest.allowed_origins, [store]);
});

test('the host starts the service only when it is not running, and only for an allowed extension', async () => {
  const calls = [], companion = running => ({ running: async () => running, launch: async () => { calls.push('launch'); } });
  assert.deepEqual(await answer({ type: 'connect' }, 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/', { config, companion: companion(false), version: '1.0.0' }), { ok: false, error: 'This extension may not use the companion' });
  assert.equal((await answer({ type: 'shutdown' }, store, { config, companion: companion(false), version: '1.0.0' })).ok, false);
  assert.deepEqual(calls, [], 'nothing was started for them');
  assert.deepEqual(await answer({ type: 'connect' }, store, { config, companion: companion(true), version: '1.0.0' }), { ok: true, port: 43127, token, version: '1.0.0' });
  assert.deepEqual(calls, []);
  assert.equal((await answer({ type: 'connect' }, store, { config, companion: companion(false), version: '1.0.0' })).ok, true);
  assert.deepEqual(calls, ['launch']);
  await assert.rejects(answer({ type: 'connect' }, store, { config, companion: { running: async () => false, launch: async () => { throw new Error('Service did not start'); } }, version: '1.0.0' }), /did not start/);
});

test('the host program answers one framed message on standard output and refuses a foreign extension', async () => {
  const child = spawn(process.execPath, [fileURLToPath(new URL('../scripts/native-host.mjs', import.meta.url)), 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/', '--parent-window=0'], { stdio: ['pipe', 'pipe', 'pipe'] });
  const output = []; child.stdout.on('data', chunk => output.push(chunk));
  child.stdin.end(frame({ type: 'connect' }));
  const code = await new Promise(resolve => child.once('exit', resolve));
  assert.equal(code, 0);
  const bytes = Buffer.concat(output);
  assert.equal(bytes.readUInt32LE(0), bytes.length - 4, 'nothing but the answer was printed');
  assert.deepEqual(JSON.parse(bytes.subarray(4).toString('utf8')), { ok: false, error: 'This extension may not use the companion' });
});
