// Tells the browser where the native messaging host is, for the current user only (no
// administrator rights): node scripts/register-host.mjs, or with `remove` to undo it. The
// launchers run it on every start, so a folder that was moved is registered again.
// The extension is installed from the Chrome Web Store, which Edge, Brave and Chromium also use,
// and each of them looks in its own place; all are written, so the extension connects in
// whichever one it was added to.
//   Windows  HKCU\Software\<browser>\NativeMessagingHosts\<name> -> the manifest file
//   macOS    ~/Library/Application Support/<browser>/NativeMessagingHosts/<name>.json
//   Linux    ~/.config/<browser>/NativeMessagingHosts/<name>.json
import { execFileSync } from 'node:child_process';
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, root } from '../service/config.mjs';
import { HOST_NAME, hostManifest } from '../service/native-host.mjs';

export const BROWSERS = {
  win32: ['Google\\Chrome', 'Microsoft\\Edge', 'BraveSoftware\\Brave-Browser', 'Chromium'],
  darwin: ['Google/Chrome', 'Microsoft Edge', 'BraveSoftware/Brave-Browser', 'Chromium'],
  linux: ['google-chrome', 'microsoft-edge', 'BraveSoftware/Brave-Browser', 'chromium'],
};
// Where each browser looks: registry keys on Windows, manifest files elsewhere.
export function locations(platform = process.platform, home = os.homedir()) {
  const browsers = BROWSERS[platform] || BROWSERS.linux;
  if (platform === 'win32') return browsers.map(browser => `HKCU\\Software\\${browser}\\NativeMessagingHosts\\${HOST_NAME}`);
  const base = platform === 'darwin' ? path.join(home, 'Library/Application Support') : path.join(home, '.config');
  return browsers.map(browser => path.join(base, browser, 'NativeMessagingHosts', `${HOST_NAME}.json`));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const windows = process.platform === 'win32', remove = process.argv[2] === 'remove';
  const reg = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe');
  const folder = path.join(root, 'runtime/native-host'), places = locations();
  if (remove) {
    for (const place of places) {
      if (windows) { try { execFileSync(reg, ['delete', place, '/f'], { stdio: 'ignore' }); } catch { /* was not registered */ } }
      else await rm(place, { force: true });
    }
    await rm(folder, { recursive: true, force: true });
    console.log('The browser no longer starts Smart Subtitles by itself.');
  } else {
    const config = await loadConfig(), host = path.join(root, 'scripts/native-host.mjs');
    await mkdir(folder, { recursive: true });
    // The launcher names this Node by its full path: the browser starts it without the user's shell.
    const launcher = path.join(folder, windows ? 'host.cmd' : 'host.sh');
    await writeFile(launcher, windows ? `@echo off\r\n"${process.execPath}" "${host}" %*\r\n` : `#!/bin/sh\nexec "${process.execPath}" "${host}" "$@"\n`);
    if (!windows) await chmod(launcher, 0o755);
    const manifest = JSON.stringify(hostManifest(launcher, config), null, 2) + '\n';
    if (windows) {
      const file = path.join(folder, `${HOST_NAME}.json`); await writeFile(file, manifest);
      for (const place of places) execFileSync(reg, ['add', place, '/ve', '/t', 'REG_SZ', '/d', file, '/f'], { stdio: 'ignore' });
    } else for (const place of places) { await mkdir(path.dirname(place), { recursive: true }); await writeFile(place, manifest); }
    console.log('Smart Subtitles is set up for your browser: the extension starts it by itself.');
  }
}
