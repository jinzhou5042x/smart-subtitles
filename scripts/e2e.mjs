import { loadConfig, root } from '../service/config.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import '../extension/core.js';
const config = await loadConfig(), base = `http://127.0.0.1:${config.port}`;
const headers = { Authorization: `Bearer ${config.pairingToken}`, 'Content-Type': 'application/json' };
async function call(route, body) { const r = await fetch(base + route, { headers, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) }); const data = await r.json(); if (!r.ok) throw new Error(data.error); return data; }
const cues = globalThis.SubtitleCore.parseSubtitles(await readFile(path.join(root, 'tests/fixtures/demo.vtt'), 'utf8'));
const request = { client: 'e2e-test', epoch: 'test-1', session: 'local-test-fixture', target: 'zh-CN', title: 'Misunderstanding at work', cues: cues.slice(0, 12), context: [] };
const started = Date.now(); let job = await call('/jobs', request);
while (['queued', 'running'].includes(job.status)) { await new Promise(r => setTimeout(r, 500)); job = await call('/jobs/' + job.id); }
if (job.status !== 'done') throw new Error(job.error || job.status);
const result = { testedAt: new Date().toISOString(), elapsedMs: Date.now() - started, segments: job.segments };
await writeFile(path.join(root, 'data/evaluation/service-e2e.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
