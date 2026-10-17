// Credentialed API responses must be bounded before buffering or parsing them.
export const PRIVATE_REQUEST = { credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer' };

export async function readJSON(response, limit = 1_000_000) {
  const tooLarge = () => new Error('The server returned too much data for this request.');
  if (Number(response.headers.get('content-length')) > limit) { await response.body?.cancel(); throw tooLarge(); }
  if (!response.body) return {};
  const reader = response.body.getReader(), decoder = new TextDecoder(), parts = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw tooLarge();
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  try { return JSON.parse(parts.join('') || '{}'); }
  catch { throw new Error(`The server returned unreadable JSON (HTTP ${response.status}).`); }
}
