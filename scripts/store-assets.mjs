// Renders the Chrome Web Store images into dist/store/assets with headless Chrome:
// two 1280x800 screenshots and the 440x280 small promo tile. The video picture is an
// illustration (no content or logos of any streaming service); the popup is the real popup with sample data.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { root } from '../service/config.mjs';
import '../extension/sites.js';
// The services named on the promo tile: the ones the registry says work, most recent first.
const sites = [...globalThis.SubtitleSites.names].reverse();

const chrome = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(p => p && existsSync(p));
if (!chrome) throw new Error('Chrome not found; set CHROME_PATH');
const out = path.join(root, 'dist/store/assets'), work = path.join(out, 'work');
await mkdir(work, { recursive: true });
// Uses the built extension (npm run build), which includes the shared language list.
const ext = file => pathToFileURL(path.join(root, 'dist/extension', file)).href;
const shot = (page, file, width, height, scale = 1) => execFileSync(chrome, ['--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--hide-scrollbars', `--force-device-scale-factor=${scale}`, `--window-size=${width},${height}`, '--virtual-time-budget=3000', `--screenshot=${path.join(out, file)}`, pathToFileURL(page).href], { stdio: 'ignore' });

// The real popup, rendered with sample settings and status.
// height: the popup's rendered height for this state, so the image ends where the popup does.
async function popup(target, info, height) {
  const stub = `globalThis.chrome = { runtime: { sendMessage: async m => m.type === 'settings' ? { ok: true, data: { enabled: true, target: '${target}', provider: 'builtin', fontSize: 60 } } : { ok: true, data: {} } },
    tabs: { query: async () => [{ id: 1, url: 'https://www.hulu.com/watch/sample' }], sendMessage: async () => (${JSON.stringify({ video: true, ...info })}), create() {} } };`;
  const html = (await readFile(path.join(root, 'extension/popup.html'), 'utf8'))
    .replace('href="popup.css"', `href="${ext('popup.css')}"`).replace('src="icon.svg"', `src="${ext('icon.svg')}"`)
    .replace('<script src="popup.js" type="module"></script>', `<style>*,*:before,*:after{transition:none!important}</style><script>${stub}</script><script src="${ext('popup.js')}" type="module"></script>`);
  const file = path.join(work, `popup-${target}.html`); await writeFile(file, html);
  shot(file, `work/popup-${target}.png`, 360, height, 2);
  return pathToFileURL(path.join(out, `work/popup-${target}.png`)).href;
}
const scene = (title, translation, original, popupImage, caption) => `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;width:1280px;height:800px;overflow:hidden;font-family:system-ui,"Segoe UI","Microsoft YaHei","Yu Gothic",sans-serif;background:#0d1117;color:#fff}
.video{position:absolute;left:40px;top:96px;width:860px;height:484px;border-radius:14px;overflow:hidden;
 background:radial-gradient(ellipse at 72% 30%,#f2b36655,transparent 45%),radial-gradient(ellipse at 20% 80%,#2b6cb055,transparent 50%),linear-gradient(160deg,#1d2b44,#0b1220 60%,#24170f)}
.video:before{content:"";position:absolute;inset:auto 0 0;height:45%;background:linear-gradient(transparent,#000a)}
.skyline{position:absolute;left:0;right:0;bottom:120px;height:140px;background:linear-gradient(90deg,#0a0f1a 0 6%,transparent 6% 9%,#0a0f1a 9% 17%,transparent 17% 20%,#0a0f1a 20% 31%,transparent 31% 33%,#0a0f1a 33% 46%,transparent 46% 49%,#0a0f1a 49% 63%,transparent 63% 66%,#0a0f1a 66% 80%,transparent 80% 83%,#0a0f1a 83%);clip-path:polygon(0 40%,6% 40%,6% 10%,17% 10%,17% 55%,31% 55%,31% 0,46% 0,46% 35%,63% 35%,63% 20%,80% 20%,80% 50%,100% 50%,100% 100%,0 100%)}
.subs{position:absolute;left:0;right:0;bottom:34px;display:flex;flex-direction:column;align-items:center;gap:8px}
.subs div{background:rgba(10,12,16,.58);backdrop-filter:blur(8px) saturate(1.2);border-radius:.22em;padding:.1em .5em .14em;box-shadow:0 .08em .5em rgba(0,0,0,.22),inset 0 0 0 1px rgba(255,255,255,.06);text-shadow:0 1px 2px rgba(0,0,0,.6);line-height:1.22}
.t{font-size:38px;font-weight:600}.o{font-size:26px;font-weight:450;color:rgba(255,255,255,.88);background:rgba(10,12,16,.42)!important}
.popup{position:absolute;right:40px;top:96px;width:360px;border-radius:14px;box-shadow:0 18px 50px #0008;overflow:hidden}
.popup img{display:block;width:360px}
h1{position:absolute;left:40px;top:28px;margin:0;font-size:30px;font-weight:650}
p{position:absolute;left:40px;top:612px;width:860px;margin:0;font-size:22px;line-height:1.5;color:#c9d1d9}
.mark{color:#3fd18b}
</style></head><body><h1>${title}</h1>
<div class="video"><div class="skyline"></div><div class="subs"><div class="t">${translation}</div><div class="o">${original}</div></div></div>
<div class="popup"><img src="${popupImage}"></div><p>${caption}</p></body></html>`;

const screens = [
  ['screenshot-1.png', 'Understand every line, <span class="mark">in your language</span>', 'Il m’a fait porter le chapeau.', 'He threw me under the bus.', await popup('fr', { tone: 'done', status: 'Subtitles ready', detail: '', total: 2310, translated: 2310, elapsedMs: 452000, usage: { input: 61840, cachedInput: 38200, output: 70510, reasoning: 3120 } }, 295),
    'The original English subtitles stay on screen, with a natural translation right above them. Use browser translation or connect your own cloud translator.'],
  ['screenshot-2.png', 'Choose <span class="mark">your translator</span>', 'Genial. Justo lo que me faltaba.', 'Oh, great. Just what I needed.', await popup('es', { tone: 'working', status: 'Translating subtitles…', total: 2310, translated: 412, elapsedMs: 92000, usage: { input: 30920, cachedInput: 0, output: 12580, reasoning: 640 } }, 341),
    'Pick a language and a translator. Subtitles translate in order from the beginning; drag them up or down, and set the size you like.']
];
for (const [file, title, translation, original, popupImage, caption] of screens) {
  const page = path.join(work, file.replace('.png', '.html'));
  await writeFile(page, scene(title, translation, original, popupImage, caption));
  shot(page, file, 1280, 800);
}
// Keep the approved promo artwork in the repository; do not regenerate its UI.
for (const name of ['promo-440x280.png', 'promo-1280x800.png']) {
  await copyFile(path.join(root, 'docs/store/assets', name), path.join(out, name));
}
const tile = path.join(work, 'promo.html');
await writeFile(tile, '<!doctype html><html><head><meta charset="utf-8"><title>Smart Subtitles promo</title><style>body{margin:0}img{display:block;width:440px;height:280px}</style></head><body><img src="../promo-440x280.png" alt="Smart Subtitles"></body></html>');
console.log(`Store images written to ${out}`);
