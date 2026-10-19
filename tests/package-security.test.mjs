import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { buildExtension } from '../scripts/extension-build.mjs';
import { checkExtensionSecurity } from '../scripts/extension-security.mjs';

test('release validation rejects private files, remote code, invalid connection policies and broadened permissions', async () => {
  const directory = path.resolve('dist/checks/security-extension');
  await buildExtension(directory, { store: true });
  await checkExtensionSecurity(directory);
  const unexpected = path.join(directory, 'credentials.json');
  await writeFile(unexpected, '{}');
  await assert.rejects(checkExtensionSecurity(directory), /Unreviewed release file/);
  await rm(unexpected);
  const script = path.join(directory, 'settings.js'), source = await readFile(script, 'utf8');
  await writeFile(script, source + '\nimport("https://remote.invalid/code.js");');
  await assert.rejects(checkExtensionSecurity(directory), /Remote or dynamically evaluated code/);
  await writeFile(script, source);
  const file = path.join(directory, 'manifest.json'), manifest = JSON.parse(await readFile(file, 'utf8'));
  const originalPolicy = manifest.content_security_policy.extension_pages;
  for (const source of ['http://[::1]:*', 'http:']) {
    manifest.content_security_policy.extension_pages = originalPolicy.replace('connect-src https:', `connect-src https: ${source}`);
    await writeFile(file, JSON.stringify(manifest));
    await assert.rejects(checkExtensionSecurity(directory), /Connection policy/);
  }
  manifest.content_security_policy.extension_pages = originalPolicy;
  manifest.permissions.push('debugger'); await writeFile(file, JSON.stringify(manifest));
  await assert.rejects(checkExtensionSecurity(directory), /release permissions/);
});

test('the public privacy page is the same as the one in the extension', async () => {
  const { readFile } = await import('node:fs/promises');
  const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8').then(text => text.replace(/\r\n/g, '\n'));
  assert.equal(await read('index.html'), await read('extension/legal.html'), 'copy extension/legal.html to index.html');
});
