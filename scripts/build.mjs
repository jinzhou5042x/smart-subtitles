import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.join(root, 'dist/extension');
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(path.join(root, 'extension'), destination, { recursive: true });
// Shared with the service; the extension loads it as languages.js.
await cp(path.join(root, 'shared/languages.js'), path.join(destination, 'languages.js'));
console.log(`Chrome -> chrome://extensions -> Load unpacked: ${destination}`);
