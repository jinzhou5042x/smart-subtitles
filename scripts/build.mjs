import path from 'node:path';
import { root } from './paths.mjs';
import { buildExtension } from './extension-build.mjs';
const destination = path.join(root, 'dist/extension');
await buildExtension(destination);
console.log(`Chrome -> chrome://extensions -> Load unpacked: ${destination}`);
