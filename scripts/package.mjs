// Package the browser extension for store upload or developer-mode installation.
import { mkdir, readFile, rm, readdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { root } from './paths.mjs';
import { buildExtension } from './extension-build.mjs';

const out = path.join(root, 'dist/store'), staging = path.join(out, 'extension');
// Keep dist/store/assets (store images); replace only the staged extension and old zips.
await mkdir(out, { recursive: true });
for (const file of await readdir(out)) if (file.endsWith('.zip')) await rm(path.join(out, file));
await buildExtension(staging, { store: true });
const manifest = JSON.parse(await readFile(path.join(staging, 'manifest.json'), 'utf8'));

const zip = path.join(out, `smart-subtitles-${manifest.version}.zip`);
// Windows' bsdtar writes standard zip entries (forward slashes). PowerShell 5.1 Compress-Archive writes
// "icons\icon-16.png", which the Chrome Web Store rejects ("No manifest found in package").
// Elsewhere (macOS, Linux) the zip/unzip commands do the same.
let entries;
if (process.platform === 'win32') {
  const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  execFileSync(tar, ['-a', '-c', '-f', zip, '-C', staging, ...(await readdir(staging))], { stdio: 'inherit' });
  entries = execFileSync(tar, ['-t', '-f', zip], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
} else {
  execFileSync('zip', ['-r', '-X', '-q', zip, '.'], { cwd: staging, stdio: 'inherit' });
  entries = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
}
if (!entries.includes('manifest.json') || entries.some(e => e.includes('\\'))) throw new Error('The zip must have manifest.json at its root and forward-slash paths');

const files = await readdir(staging, { recursive: true });
if (files.some(file => /local-connection\.json$|browser-test|node_modules|config[\\/]/.test(file))) throw new Error('Development or local files must not be packaged');
if (manifest.permissions.includes('nativeMessaging') || manifest.optional_permissions?.includes('nativeMessaging')) throw new Error('Native programs are not part of this extension');
if ((await readFile(path.join(staging, 'chatgpt-worker.js'), 'utf8')).includes('testFetch')) throw new Error('The authentication test transport must not be packaged');
console.log(`${zip} (${Math.round((await stat(zip)).size / 1024)} KB, ${files.length} entries): ${files.sort().join(', ')}`);
