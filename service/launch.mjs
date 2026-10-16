// Starting the companion service in the background and telling whether it is running, for the
// launchers (scripts/companion.mjs) and the native messaging host (scripts/native-host.mjs).
import { spawn } from 'node:child_process';
import { open } from 'node:fs/promises';
import path from 'node:path';
import { root } from './config.mjs';

export function companion(config) {
  const base = `http://127.0.0.1:${config.port}`, headers = { Authorization: `Bearer ${config.pairingToken}` };
  // Running, and paired with this folder's code (another copy on the same port is not ours).
  async function running() {
    try { return (await fetch(`${base}/status`, { headers, signal: AbortSignal.timeout(1500) })).ok; }
    catch { return false; }
  }
  async function launch() {
    const stdout = await open(path.join(root, 'logs/stdout.log'), 'a', 0o600);
    const stderr = await open(path.join(root, 'logs/stderr.log'), 'a', 0o600);
    const child = spawn(process.execPath, [path.join(root, 'service/server.mjs')], { cwd: root, detached: true, windowsHide: true, stdio: ['ignore', stdout.fd, stderr.fd] });
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    child.unref(); await stdout.close(); await stderr.close();
    for (let attempt = 0; attempt < 40; attempt++) {
      if (await running()) return;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error('Service did not start. Check logs/stderr.log and the Check Environment launcher.');
  }
  return { base, headers, running, launch };
}
