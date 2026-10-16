// Chrome Native Messaging: lets the extension start the companion and learn its port and pairing
// code by itself, so the viewer neither starts the service nor pastes a code.
//
// Chrome starts the host (scripts/native-host.mjs) only for the extensions named in the host
// manifest's allowed_origins, passes the calling extension's origin as an argument, and exchanges
// messages over stdin/stdout: a 4-byte little-endian length, then that many bytes of JSON.
// The host answers one message and exits; the service it started keeps running.
export const HOST_NAME = 'com.smart_subtitles.companion';
// The Chrome Web Store item. An unpacked development copy has another ID (shown in
// chrome://extensions); list it in config/local.json as "extensionIds": ["..."].
export const STORE_EXTENSION_ID = 'bpfhbkkdmommobklkndkfagejfpbnjno';

export const allowedOrigins = config => [...new Set([STORE_EXTENSION_ID, ...(Array.isArray(config?.extensionIds) ? config.extensionIds : [])])]
  .filter(id => typeof id === 'string' && /^[a-p]{32}$/.test(id)).map(id => `chrome-extension://${id}/`);
export const hostManifest = (launcher, config) => ({ name: HOST_NAME, description: 'Smart Subtitles companion', path: launcher, type: 'stdio', allowed_origins: allowedOrigins(config) });

export function frame(message) {
  const body = Buffer.from(JSON.stringify(message)), head = Buffer.alloc(4);
  head.writeUInt32LE(body.length);
  return Buffer.concat([head, body]);
}
// Reads one framed message. The extension only ever sends a few bytes; anything larger is refused.
export async function readMessage(stream, limit = 65536) {
  let buffer = Buffer.alloc(0);
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length < 4) continue;
    const length = buffer.readUInt32LE(0);
    if (length > limit) throw new Error('Message too large');
    if (buffer.length >= 4 + length) return JSON.parse(buffer.subarray(4, 4 + length).toString('utf8'));
  }
  throw new Error('No message');
}
// companion: { running(), launch() } for this config (service/launch.mjs).
export async function answer(message, origin, { config, companion, version }) {
  // Chrome already enforces allowed_origins; a host started by anything else must not answer.
  if (!allowedOrigins(config).includes(origin)) return { ok: false, error: 'This extension may not use the companion' };
  if (message?.type !== 'connect') return { ok: false, error: 'Unknown message' };
  if (!await companion.running()) await companion.launch();
  return { ok: true, port: config.port, token: config.pairingToken, version };
}
