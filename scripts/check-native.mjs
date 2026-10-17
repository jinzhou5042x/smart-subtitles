// Optional live check: use branded desktop Chrome because testing builds may not download models.
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import assert from 'node:assert/strict';
const source = await readFile(new URL('../extension/builtin.js', import.meta.url), 'utf8');
const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<body><h1>Browser translation check</h1></body>'); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const context = await chromium.launchPersistentContext('', {
  channel: 'chrome', headless: true,
  // Playwright normally disables component downloads and translation for reproducibility.
  ignoreDefaultArgs: ['--disable-component-update', '--disable-background-networking'],
  args: ['--enable-features=Translate,OptimizationHints', '--component-updater=fast-update'],
});
try {
  const page = await context.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}`);
  const cdp = await context.newCDPSession(page);
  const { frameTree } = await cdp.send('Page.getFrameTree');
  const { executionContextId } = await cdp.send('Page.createIsolatedWorld', { frameId: frameTree.frame.id, worldName: 'subtitle-native-check' });
  await cdp.send('Runtime.evaluate', { contextId: executionContextId, expression: source + `
    const client = new SubtitleBuiltin.BuiltinTranslator();
    const run = () => client.translate([{id:'one',text:'Hello, how are you?',start:0,end:2}], 'zh-CN').then(segments => { document.body.dataset.result = segments[0].text; client.close(); }, e => { document.body.dataset.error = e.message; });
    addEventListener('smart-subtitles-builtin-ready', run, {once:true}); run();
  ` });
  // The production button is in a closed shadow root; click its visible host.
  const host = page.locator('body > div[style*="2147483647"]');
  await host.waitFor({ timeout: 15000 }); await host.click();
  await page.waitForFunction(() => !!document.body.dataset.result, null, { timeout: 120000 });
  const result = await page.evaluate(() => document.body.dataset.result);
  assert.match(result, /[\u3400-\u9fff]/); console.log(`Native Chrome translation passed in an isolated document world: ${result}`);
} finally { await context.close(); await new Promise(resolve => server.close(resolve)); }
