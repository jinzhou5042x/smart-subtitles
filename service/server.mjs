import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, root } from './config.mjs';
import { JobQueue } from './jobs.mjs';
import { validateRequest } from './translation.mjs';

// The version comes from package.json (scripts/version.mjs keeps it in step with the extension).
export const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
export const isExtensionOrigin = origin => /^chrome-extension:\/\/[a-p]{32}$/.test(origin || '');
export const enabledProviders = () => ['codex'];
export function tokenMatches(actual, expected) {
  const a = Buffer.from(actual || ''), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
async function readJson(req, limit = 65536) {
  let bytes = 0, parts = [];
  for await (const chunk of req) { bytes += chunk.length; if (bytes > limit) throw new Error('Request too large'); parts.push(chunk); }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
export function createServer(config, queue, codexAccount) {
  return http.createServer(async (req, res) => {
    const origin = req.headers.origin, ids = config.allowedExtensionIds || [];
    const json = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY');
    if (!['127.0.0.1', `127.0.0.1:${config.port}`].includes(req.headers.host)) return json(403, { error: 'Invalid host' });
    if (origin && (!isExtensionOrigin(origin) || (ids.length && !ids.includes(origin.slice(19))))) return json(403, { error: 'Origin not allowed' });
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type'); res.setHeader('Access-Control-Allow-Private-Network', 'true'); res.writeHead(204); return res.end(); }
    const url = new URL(req.url, `http://127.0.0.1:${config.port}`);
    if (req.method === 'GET' && url.pathname === '/health') return json(200, { app: 'smart-subtitles', version, ready: true });
    if (!tokenMatches(req.headers.authorization, `Bearer ${config.pairingToken}`)) return json(401, { error: 'Pairing token required' });
    try {
      if (req.method === 'GET' && url.pathname === '/status') return json(200, { app: 'smart-subtitles', version, providers: ['codex'], codex: codexAccount?.get() || 'unknown', codexSignIn: codexAccount?.describe(), running: queue.running, model: config.model });
      if (req.method === 'POST' && url.pathname.startsWith('/settings/codex/') && codexAccount) {
        const action = { 'sign-in': () => codexAccount.startSignIn(), 'sign-out': () => codexAccount.signOut(), cancel: () => codexAccount.cancelSignIn() }[url.pathname.slice(16)];
        if (action) { await action(); return json(202, codexAccount.describe()); }
      }
      if (req.method === 'POST' && url.pathname === '/jobs') {
        const request = validateRequest(await readJson(req, 100000), 16);
        if (request.provider !== 'codex') throw new Error('Only Codex is enabled in the optional companion');
        return json(202, queue.submit(request));
      }
      if (req.method === 'GET' && /^\/jobs\/[a-f0-9-]{36}$/.test(url.pathname)) {
        const job = queue.get(url.pathname.split('/')[2]); return json(job ? 200 : 404, job || { error: 'Task expired; retry the window' });
      }
      if (req.method === 'POST' && url.pathname === '/cancel') {
        const { client, epoch } = await readJson(req); if (typeof client !== 'string' || typeof epoch !== 'string') throw new Error('Invalid cancellation');
        queue.cancel(client, epoch); return json(200, { ok: true });
      }
      if (req.method === 'POST' && url.pathname === '/shutdown') { json(200, { ok: true }); process.emit('SIGTERM'); return; }
      return json(404, { error: 'Not found' });
    } catch (error) { json(400, { error: error.message }); }
  });
}
async function main() {
  const config = await loadConfig(); config.requireBinding = true;
  const { CodexTranslator } = await import('./codex.mjs'); const { CodexAccount } = await import('./codex-account.mjs');
  const translator = new CodexTranslator(config), account = new CodexAccount(config);
  account.onAccountChange = () => translator.close(); void account.refresh();
  const queue = new JobQueue(translator, { ...config, maxAgents: 2 });
  const server = createServer(config, queue, account); server.requestTimeout = 15000;
  server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? 'Companion port is already in use.' : e.message); translator.close(); process.exitCode = 1; });
  server.listen(config.port, '127.0.0.1', () => { console.log(`Optional Codex companion: http://127.0.0.1:${config.port}`); void appendFile(path.join(root, 'logs/service.log'), `${new Date().toISOString()} started pid=${process.pid}\n`); });
  const stop = () => { account.cancelSignIn(); for (const job of queue.jobs.values()) job.controller.abort(); translator.close(); server.close(); setTimeout(() => process.exit(0), 500).unref(); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exitCode = 1; });
