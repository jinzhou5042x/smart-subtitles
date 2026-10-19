// Encrypts saved API keys at rest. The AES-GCM key is created by Chrome as non-extractable and kept in
// the extension's own IndexedDB, apart from the encrypted keys in extension storage: a copied
// profile folder or a scan for "sk-…" finds only ciphertext. It cannot stop software that already
// runs as the same user and can drive this browser profile; no extension can without the OS keychain.
const encode = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const decode = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));

export function createVault(loadKey) {
  let key;
  const get = () => key ||= Promise.resolve(loadKey()).catch(error => { key = null; throw error; });
  return {
    async seal(text) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await get(), new TextEncoder().encode(text));
      return { iv: encode(iv), data: encode(data) };
    },
    // A key that cannot be decrypted (its vault was lost) reads as no key: the viewer enters it again.
    async open(sealed) {
      try { return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(sealed.iv) }, await get(), decode(sealed.data))); }
      catch { return ''; }
    },
  };
}

const request = work => new Promise((resolve, reject) => { const r = work(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
// The vault key of this browser profile, created on first use.
export async function browserKey() {
  const db = await new Promise((resolve, reject) => {
    const open = indexedDB.open('smart-subtitles-vault', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('keys');
    open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error);
  });
  try {
    const saved = await request(() => db.transaction('keys').objectStore('keys').get('api'));
    if (saved) return saved;
    const created = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    // `add` fails if another context saved one first; then that one is used.
    try { await request(() => db.transaction('keys', 'readwrite').objectStore('keys').add(created, 'api')); return created; }
    catch { return await request(() => db.transaction('keys').objectStore('keys').get('api')); }
  } finally { db.close(); }
}
