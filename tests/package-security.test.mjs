import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { buildExtension } from '../scripts/extension-build.mjs';
import { checkExtensionSecurity } from '../scripts/extension-security.mjs';

test('release validation rejects private files, remote code and broadened permissions', async () => {
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
  manifest.permissions.push('debugger'); await writeFile(file, JSON.stringify(manifest));
  await assert.rejects(checkExtensionSecurity(directory), /release permissions/);
});
