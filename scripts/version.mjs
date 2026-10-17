// Sets the version everywhere it is written: node scripts/version.mjs 0.9.2 (or: npm run bump -- 0.9.2).
// package.json identifies the build, manifest.json identifies the Chrome extension.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const next = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(next || '')) { console.error('Usage: node scripts/version.mjs <major.minor.patch>'); process.exit(1); }
for (const file of ['package.json', 'extension/manifest.json']) {
  const full = path.join(root, file), data = JSON.parse(await readFile(full, 'utf8'));
  console.log(`${file}: ${data.version} -> ${next}`); data.version = next;
  await writeFile(full, JSON.stringify(data, null, 2) + '\n');
}
const lock = path.join(root, 'package-lock.json');
try {
  const data = JSON.parse(await readFile(lock, 'utf8')); data.version = next;
  if (data.packages?.['']) data.packages[''].version = next;
  await writeFile(lock, JSON.stringify(data, null, 2) + '\n');
} catch (e) { if (e.code !== 'ENOENT') throw e; }
