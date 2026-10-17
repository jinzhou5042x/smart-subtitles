// Real accounts use regular Chrome: Google can reject sign-in in automated browsers.
// https://support.google.com/accounts/answer/7675428
import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { buildExtension } from './extension-build.mjs';
import { root } from './paths.mjs';
const extension = path.join(root, 'dist/extension');
await buildExtension(extension, { store: true });
console.log(`Manual ChatGPT check — use your regular Chrome, without browser automation.
1. At chrome://extensions, reload Smart Subtitles if it already uses this folder.
   Otherwise enable Developer mode, choose Load unpacked, and select:
   ${extension}
2. Open Smart Subtitles > Translator settings > ChatGPT subscription.
3. Continue with ChatGPT, allow the requested hosts, and complete sign-in.
4. Click Test with “Hello.” (uses a small amount of your allowance).
The check succeeds when settings shows Connected and a translation.
This script does not control Chrome, read your login, or send a translation itself.`);

const launch = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: false });
  child.once('error', reject);
  child.once('spawn', () => { child.unref(); resolve(); });
});
try {
  if (process.platform === 'win32') {
    const candidates = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
      .filter(Boolean).map(folder => path.join(folder, 'Google/Chrome/Application/chrome.exe'));
    let chrome;
    for (const candidate of candidates) { try { await access(candidate); chrome = candidate; break; } catch {} }
    if (!chrome) throw new Error('Chrome was not found.');
    await launch(chrome, ['--new-window', 'chrome://extensions']);
  } else if (process.platform === 'darwin') {
    await launch('/usr/bin/open', ['-a', 'Google Chrome', 'chrome://extensions']);
  } else {
    let opened = false;
    for (const command of ['google-chrome', 'google-chrome-stable', 'chromium']) {
      try { await launch(command, ['chrome://extensions']); opened = true; break; } catch {}
    }
    if (!opened) throw new Error('Chrome was not found.');
  }
} catch (error) { console.log(`${error.message} Open your regular Chrome and follow the steps above.`); }
