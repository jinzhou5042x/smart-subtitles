import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { loadConfig, root } from '../service/config.mjs';
import { HOST_NAME } from '../service/native-host.mjs';
import { locations } from './register-host.mjs';
import { codexCommand } from '../service/codex.mjs';
const config = await loadConfig();
console.log(`Node: ${process.version}`);
for (const args of [['--version'], ['login', 'status']]) {
  try { const { command, prefix } = codexCommand(config); console.log(execFileSync(command, [...prefix, ...args], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000 }).trim()); }
  catch (e) { console.error(`Codex unavailable: ${e.message}`); process.exitCode = 1; }
}
// What the extension needs to start this program by itself: the browser must know where the
// host is, and the launcher it names must still exist (a moved folder breaks both).
try {
  const launcher = path.join(root, 'runtime/native-host', process.platform === 'win32' ? 'host.cmd' : 'host.sh');
  const known = locations().filter(place => {
    if (process.platform !== 'win32') return existsSync(place) && JSON.parse(readFileSync(place, 'utf8')).path === launcher;
    try { return execFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe'), ['query', place, '/ve'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).includes(path.join(root, 'runtime/native-host', `${HOST_NAME}.json`)); } catch { return false; }
  });
  if (!existsSync(launcher) || !known.length) { console.log('Browser connection: not set up for this folder. Run the Start Subtitles launcher once.'); process.exitCode = 1; }
  else console.log(`Browser connection: set up (${known.length} browser locations).`);
} catch (e) { console.log(`Browser connection: could not be checked (${e.message})`); }
try { const r = await fetch(`http://127.0.0.1:${config.port}/status`, { headers: { Authorization: `Bearer ${config.pairingToken}` }, signal: AbortSignal.timeout(3000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); console.log(await r.json()); }
catch { console.log('Local service is not running or needs restarting. Run the Start Subtitles launcher'); }
