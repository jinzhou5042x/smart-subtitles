// Builds the Windows companion service for users: dist/release/SmartSubtitles-Service-<version>-win-x64.zip
// - Only an allowlist of files is copied: the Codex backend, the shared language list and the
//   launch/setup scripts. config/local.json (pairing code, API keys), data, logs, models and the
//   development tools are never included; each user's first start creates their own pairing code.
// - Official portable Node.js is bundled after checking its SHA-256 against nodejs.org.
// - The result is scanned for the developer's secrets and anything that looks like a key.
import { cp, mkdir, readFile, rm, writeFile, readdir, stat, rename, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { root } from '../service/config.mjs';

const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
pkg.version = process.env.RELEASE_VERSION || pkg.version;
if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error('Invalid release version');
const target = process.argv[2] || (process.platform === 'darwin' ? `darwin-${process.arch}` : 'win-x64');
if (!['win-x64', 'darwin-arm64', 'darwin-x64'].includes(target)) throw new Error('Unsupported release target');
const mac = target.startsWith('darwin-');
if (mac && process.platform !== 'darwin') throw new Error('Build macOS releases on macOS');
const name = `SmartSubtitles-Service-${pkg.version}-${target}`;
const releaseDir = path.join(root, 'dist/release'), out = path.join(releaseDir, name), cache = path.join(releaseDir, 'cache');
// Windows' own bsdtar (zip support); a GNU tar earlier on PATH would read 'C:' as a remote host.
const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : '/usr/bin/tar';
const sha256 = data => createHash('sha256').update(data).digest('hex');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true }); await mkdir(cache, { recursive: true });

const FILES = [
  'service/codex.mjs', 'service/codex-account.mjs', 'service/config.mjs', 'service/database.mjs', 'service/episodes.mjs', 'service/jobs.mjs', 'service/server.mjs', 'service/translation.mjs',
  'service/checkpoints.mjs', 'service/keyed.mjs', 'service/google.mjs', 'service/google-settings.mjs', 'service/google-picker.mjs', 'service/key-picker.cs', 'service/native-key-picker.mjs',
  'shared/languages.js', 'config/default.json',
  'service/key-picker.swift', 'service/launch.mjs', 'service/native-host.mjs', 'scripts/native-host.mjs', 'scripts/register-host.mjs',
  'scripts/companion.mjs', 'scripts/macos.sh',
  'scripts/start.ps1', 'scripts/stop.ps1', 'scripts/setup-codex.ps1', 'scripts/configure-codex.mjs', 'scripts/doctor.mjs'
];
for (const file of FILES) { await mkdir(path.dirname(path.join(out, file)), { recursive: true }); await cp(path.join(root, file), path.join(out, file)); }
const defaults = JSON.parse(await readFile(path.join(out, 'config/default.json'), 'utf8'));
if (JSON.stringify(defaults.providers) !== '["codex"]') throw new Error('The release must enable Codex only');
await writeFile(path.join(out, 'package.json'), JSON.stringify({ name: 'smart-subtitles-service', version: pkg.version, private: true, type: 'module' }, null, 2) + '\n');
await cp(path.join(root, 'extension/legal.html'), path.join(out, 'TERMS-AND-PRIVACY.html'));
const launcher = command => `@echo off\r\ncd /d "%~dp0"\r\n${command}\r\npause\r\n`;
if (!mac) {
await writeFile(path.join(out, 'Start Subtitles.cmd'), launcher('powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\\start.ps1"'));
await writeFile(path.join(out, 'Stop Subtitles.cmd'), launcher('powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\\stop.ps1"'));
await writeFile(path.join(out, 'Set Up Codex.cmd'), launcher('powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\\setup-codex.ps1"'));
await writeFile(path.join(out, 'Check Environment.cmd'), launcher('"%~dp0node\\node.exe" scripts\\doctor.mjs'));
await writeFile(path.join(out, 'README.txt'), `Smart Subtitles - companion service ${pkg.version} (Windows)
=====================================================================

The Chrome extension shows bilingual subtitles on streaming video sites (Hulu and Disney+ at this
version). There is no Smart Subtitles server: this program runs on your own computer,
translates the subtitles with Codex using your own ChatGPT sign-in, and keeps finished
translations in a local database. It only listens on 127.0.0.1 and answers only your own copy of the extension.

Install
  1. Unzip this folder somewhere permanent, for example Documents.
  2. Double-click "Set Up Codex.cmd" (once). It uses Codex if it is already installed, otherwise
     installs the official Codex CLI into this folder (about 430 MB download), and opens the ChatGPT
     sign-in in your browser. You need a ChatGPT account with Codex access.
  3. Install the Smart Subtitles extension in Chrome. It finds this program and starts it by
     itself from now on. (If you skipped step 2, double-click "Start Subtitles.cmd" once first.)
  4. Open a video that has English subtitles and choose your language in the extension.

Every day
  Just watch: Chrome starts the service when it is needed.
  Stop: "Stop Subtitles.cmd"   Start by hand: "Start Subtitles.cmd"   Problems: "Check Environment.cmd"

Notes
  - Translation uses your ChatGPT/Codex quota. Subtitles are sent to OpenAI through your Codex
    account and to no one else; finished translations stay in the "data" folder.
  - config\\local.json holds this computer's private access code, readable only by your Windows
    user. Do not share it. If you move this folder, run "Start Subtitles.cmd" once again.
  - To uninstall, run "Stop Subtitles.cmd" and delete this folder.
  - Unofficial tool, not affiliated with any streaming service. See TERMS-AND-PRIVACY.html.
`.replace(/\n/g, '\r\n'));

}
if (mac) {
  for (const file of ['Start Subtitles.command', 'Stop Subtitles.command', 'Set Up Codex.command', 'Check Environment.command', 'scripts/macos.sh']) {
    await writeFile(path.join(out, file), (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n'));
    await chmod(path.join(out, file), 0o755);
  }
  await mkdir(path.join(out, 'runtime/key-picker'), { recursive: true });
  execFileSync('/usr/bin/swiftc', [path.join(root, 'service/key-picker.swift'), '-target', target.endsWith('arm64') ? 'arm64-apple-macosx13.0' : 'x86_64-apple-macosx13.0', '-o', path.join(out, 'runtime/key-picker/picker')]);
  await writeFile(path.join(out, 'README.txt'), `macOS Chrome companion ${pkg.version}\nUnzip into a permanent folder. Double-click Set Up Codex.command once (or Start Subtitles.command if you only use Google), then install the Chrome extension: it finds this program and starts it by itself from now on. Google users can skip Codex setup and link their key file from the extension. Stop with Stop Subtitles.command. macOS 13 or later. If macOS blocks a launcher, use Finder's Open action or Privacy & Security to allow this downloaded tool after reviewing its source.\n`);
}

// Official portable Node.js, the same version the service is developed and tested with.
const nodeVersion = process.version, nodeZip = `node-${nodeVersion}-${target}.${mac ? 'tar.gz' : 'zip'}`, base = `https://nodejs.org/dist/${nodeVersion}/`;
const cached = path.join(cache, nodeZip);
if (!existsSync(cached)) {
  const response = await fetch(base + nodeZip); if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  await writeFile(cached, Buffer.from(await response.arrayBuffer()));
}
const sums = await (await fetch(base + 'SHASUMS256.txt')).text();
const expected = sums.split('\n').find(line => line.endsWith('  ' + nodeZip))?.split(' ')[0];
if (!expected || expected !== sha256(await readFile(cached))) throw new Error(`${nodeZip} does not match the official SHA-256`);
execFileSync(tar, ['-xf', cached, '-C', out]);
await rename(path.join(out, `node-${nodeVersion}-${target}`), path.join(out, 'node'));

// Secret scan: the developer's own values, and anything shaped like an API key or pairing code.
const own = JSON.parse(await readFile(path.join(root, 'config/local.json'), 'utf8').catch(error => { if (error.code === 'ENOENT') return '{}'; throw error; }));
const secrets = [own.pairingToken, own.googleApiKey].filter(Boolean);
const patterns = [/AIza[0-9A-Za-z_-]{35}/, /\b[a-f0-9]{48}\b/, /sk-[A-Za-z0-9]{20,}/];
for (const file of await readdir(out, { recursive: true })) {
  if (file === 'runtime/key-picker/picker' || file.startsWith('node' + path.sep)) continue; // official, checksum-verified Node.js files
  if (/local\.json$|\.sqlite$|local-connection\.json$/.test(file)) throw new Error(`Private file in the release: ${file}`);
  const full = path.join(out, file); if ((await stat(full)).isDirectory()) continue;
  const text = await readFile(full, 'utf8');
  if (secrets.some(s => text.includes(s)) || patterns.some(p => p.test(text))) throw new Error(`Possible secret in ${file}`);
}

const zip = path.join(releaseDir, `${name}.zip`);
await rm(zip, { force: true });
if (process.platform === 'win32') execFileSync(tar, ['-a', '-c', '-f', zip, '-C', releaseDir, name]);
else execFileSync('/usr/bin/zip', ['-q', '-r', zip, name], { cwd: releaseDir });
const digest = sha256(await readFile(zip));
await writeFile(zip + '.sha256.txt', `${digest}  ${name}.zip\n`);
console.log(`${zip}\n${Math.round((await stat(zip)).size / 1048576)} MB, SHA-256 ${digest}`);
