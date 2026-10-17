import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { root } from './paths.mjs';

export async function buildExtension(destination, { store = false } = {}) {
  const target = path.resolve(destination), dist = path.resolve(root, 'dist');
  if (!target.startsWith(dist + path.sep)) throw new Error('Extension builds must stay inside dist/');
  await rm(target, { recursive: true, force: true }); await mkdir(target, { recursive: true });
  await cp(path.join(root, 'extension'), target, { recursive: true });
  await cp(path.join(root, 'shared/languages.js'), path.join(target, 'languages.js'));
  await build({ entryPoints: [path.join(root, 'extension/chatgpt-worker.js')], outfile: path.join(target, 'chatgpt-worker.js'), bundle: true, format: 'esm', platform: 'browser', target: 'chrome127', minify: true, legalComments: 'eof' });
  await rm(path.join(target, 'chatgpt-auth.js'));
  await cp(path.join(root, 'node_modules/jose/LICENSE.md'), path.join(target, 'THIRD_PARTY_LICENSE.txt'));
  if (store) {
    const file = path.join(target, 'manifest.json'), manifest = JSON.parse(await readFile(file, 'utf8'));
    for (const script of manifest.content_scripts) script.matches = script.matches.filter(match => !match.startsWith('http://127.0.0.1'));
    manifest.host_permissions = manifest.host_permissions.filter(match => !match.startsWith('http://127.0.0.1'));
    await writeFile(file, JSON.stringify(manifest, null, 2) + '\n');
  }
}
