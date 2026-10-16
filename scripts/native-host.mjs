// The native messaging host Chrome starts for the extension (see service/native-host.mjs).
// Standard output carries only the framed answer: nothing here may print.
import { readFileSync } from 'node:fs';
import { loadConfig } from '../service/config.mjs';
import { companion } from '../service/launch.mjs';
import { answer, frame, readMessage } from '../service/native-host.mjs';

const origin = process.argv.slice(2).find(argument => argument.startsWith('chrome-extension://')) || '';
let reply;
try {
  const message = await readMessage(process.stdin), config = await loadConfig();
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  reply = await answer(message, origin, { config, companion: companion(config), version });
} catch (error) { reply = { ok: false, error: error.message }; }
process.stdout.write(frame(reply), () => process.exit(0));
