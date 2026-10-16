// Test the ZIP users download, in a fresh folder with spaces and no developer config.
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const zip = path.resolve(process.argv[2]);
const temp = await mkdtemp(path.join(os.tmpdir(), 'Smart Subtitles release '));
const windows = process.platform === 'win32';
let base, headers;
try {
  if (windows) execFileSync(path.join(process.env.SystemRoot, 'System32/tar.exe'), ['-xf', zip, '-C', temp]);
  else execFileSync('/usr/bin/unzip', ['-q', zip, '-d', temp]);
  const folder = path.join(temp, (await readdir(temp))[0]);
  const node = path.join(folder, windows ? 'node/node.exe' : 'node/bin/node');
  execFileSync(node, ['--version']);
  for (const entry of await readdir(path.join(folder, 'service'))) {
    if (!entry.endsWith('.mjs')) continue;
    const file = path.join(folder, 'service', entry), source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/(?:from\s*|import\s*\(?\s*)['"](\.[^'"]+)['"]/g)) {
      await stat(path.resolve(path.dirname(file), match[1]));
    }
  }
  if (!windows) for (const file of ['Start Subtitles.command', 'Set Up Codex.command', 'scripts/macos.sh']) {
    assert.ok((await stat(path.join(folder, file))).mode & 0o111, `${file} must be executable`);
    assert.ok(!(await readFile(path.join(folder, file), 'utf8')).includes('\r'), `${file} needs Unix line endings`);
  }
  const probe = net.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const token = randomBytes(24).toString('hex');
  await writeFile(path.join(folder, 'config/local.json'), JSON.stringify({ port, pairingToken: token, codexPath: path.join(temp, 'no-codex-installed') }));
  base = `http://127.0.0.1:${port}`; headers = { Authorization: `Bearer ${token}` };
  if (process.env.CI) execFileSync(node, ['scripts/register-host.mjs'], { cwd: folder, stdio: 'pipe' });
  const child = spawn(node, ['scripts/native-host.mjs', 'chrome-extension://bpfhbkkdmommobklkndkfagejfpbnjno/'], { cwd: folder, windowsHide: true });
  const chunks = [], errors = []; child.stdout.on('data', chunk => chunks.push(chunk)); child.stderr.on('data', chunk => errors.push(chunk));
  const body = Buffer.from(JSON.stringify({ type: 'connect' })), head = Buffer.alloc(4); head.writeUInt32LE(body.length);
  child.stdin.end(Buffer.concat([head, body]));
  const timeout = setTimeout(() => child.kill(), 25000);
  const [code] = await once(child, 'exit'); clearTimeout(timeout);
  assert.equal(code, 0, Buffer.concat(errors).toString());
  const output = Buffer.concat(chunks); assert.ok(output.length > 4);
  const answer = JSON.parse(output.subarray(4, 4 + output.readUInt32LE(0)));
  assert.equal(answer.ok, true, answer.error); assert.equal(answer.token, token); assert.equal(answer.port, port);
  assert.equal((await fetch(`${base}/status`, { headers })).status, 200);
  assert.equal((await fetch(`${base}/status`)).status, 401);
  assert.equal((await fetch(`${base}/shutdown`, { method: 'POST', headers })).status, 200);
  await new Promise(resolve => setTimeout(resolve, 1500));
  console.log('ZIP verified: bundled Node, dependencies, native connection, auto-start, authentication and shutdown.');
} finally {
  if (base) await fetch(`${base}/shutdown`, { method: 'POST', headers, signal: AbortSignal.timeout(2000) }).catch(() => {});
  await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}
