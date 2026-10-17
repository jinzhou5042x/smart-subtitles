// Explicit live benchmark: uses Google API quota and your optional Codex login; never run by CI.
// GOOGLE_TRANSLATE_API_KEY is required. Outputs contain only this synthetic fixture and results.
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { loadConfig } from '../service/config.mjs';
import { CodexTranslator } from '../service/codex.mjs';
import { translateRemote } from '../extension/translation.js';
const key = process.env.GOOGLE_TRANSLATE_API_KEY;
if (!key) throw new Error('Set GOOGLE_TRANSLATE_API_KEY before running this paid, opt-in benchmark.');
const fixture = JSON.parse(await readFile(new URL('../tests/fixtures/translation-review.json', import.meta.url), 'utf8'));
const source = await readFile(new URL('../extension/builtin.js', import.meta.url), 'utf8');
const config = await loadConfig(), codex = new CodexTranslator({ ...config, translationTimeoutMs: 90000 });
const report = { at: new Date().toISOString(), target: fixture.target, model: config.model, effort: config.effort, rounds: 3, windowSize: 10, environment: { platform: process.platform, arch: process.arch, node: process.version }, fixture, runs: [] };
const server = http.createServer((q, r) => { r.setHeader('Content-Type', 'text/html'); r.end('<body><h1>Translation benchmark</h1></body>'); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launchPersistentContext('', { channel: 'chrome', headless: true, ignoreDefaultArgs: ['--disable-component-update', '--disable-background-networking'], args: ['--enable-features=Translate,OptimizationHints', '--component-updater=fast-update'] });
  report.environment.browser = browser.browser()?.version() || 'installed Chrome';
  const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}`);
  const cdp = await browser.newCDPSession(page), { frameTree } = await cdp.send('Page.getFrameTree');
  const { executionContextId } = await cdp.send('Page.createIsolatedWorld', { frameId: frameTree.frame.id, worldName: 'benchmark' });
  const evaluate = async expression => { const r = await cdp.send('Runtime.evaluate', { contextId: executionContextId, expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; };
  await evaluate(source + `;globalThis.client = new SubtitleBuiltin.BuiltinTranslator(); globalThis.prepared = false; addEventListener('smart-subtitles-builtin-ready', () => globalThis.prepared = true); client.translate([{id:'setup',text:'Hello',start:0,end:1}], 'zh-CN').then(() => globalThis.prepared = true).catch(() => {});`);
  const host = page.locator('body > div[style*="2147483647"]'); await host.waitFor(); const prepare = performance.now(); await host.click();
  for (let n = 0; !await evaluate('globalThis.prepared'); n++) { if (n > 120) throw new Error('Browser language pack preparation timed out'); await page.waitForTimeout(1000); }
  report.browserPreparationMs = Math.round(performance.now() - prepare);
  const providers = ['builtin', 'google', 'codex'];
  for (let round = 0; round < report.rounds; round++) for (let start = 0; start < fixture.cues.length; start += report.windowSize) {
    const cues = fixture.cues.slice(start, start + report.windowSize).map(({ category, ...c }) => c);
    const context = fixture.cues.slice(Math.max(0, start - 12), Math.min(fixture.cues.length, start + cues.length + 12)).filter(c => !cues.some(x => x.id === c.id)).slice(0, 24);
    const request = { session: 'translation-review', client: 'benchmark', epoch: `${round}-${start}`, target: fixture.target, title: 'Friends at home and work', cues, context };
    for (const provider of [...providers.slice(round), ...providers.slice(0, round)]) {
      const started = performance.now(); let result, usage, durationMs;
      if (provider === 'builtin') {
        const r = await evaluate(`(async()=>{const t=performance.now(); const segments=await client.translate(${JSON.stringify(cues)}, ${JSON.stringify(fixture.target)});return {segments,ms:performance.now()-t};})()`); result = r.segments; durationMs = r.ms;
      } else if (provider === 'google') {
        const r = await translateRemote({ provider, target: fixture.target }, { key }, request, AbortSignal.timeout(25000)); result = r.segments; usage = r.usage;
      } else {
        result = await codex.translate(request, AbortSignal.timeout(95000), p => { if (p.usage) usage = p.usage; });
      }
      durationMs = Math.round(durationMs ?? performance.now() - started);
      report.runs.push({ provider, round: round + 1, window: start / report.windowSize + 1, cues: cues.length, durationMs, usage, segments: result });
      console.log(`${provider}: round ${round + 1}, window ${start / report.windowSize + 1}, ${durationMs} ms`);
    }
  }
  const directory = path.resolve('data/evaluation'); await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'translation-review.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Results: ${path.join(directory, 'translation-review.json')}`);
} finally { codex.close(); await browser?.close(); await new Promise(resolve => server.close(resolve)); }
