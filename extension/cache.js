// Only the extension origin stores translations. No SQLite or local daemon.
let database;
function open() {
  return database ||= new Promise((resolve, reject) => {
    const request = indexedDB.open('smart-subtitles', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('lines', { keyPath: 'key' }).createIndex('saved', 'saved');
    request.onsuccess = () => resolve(request.result); request.onerror = () => { database = null; reject(request.error); };
  });
}
async function transaction(mode, work) {
  const db = await open();
  return new Promise((resolve, reject) => { const tx = db.transaction('lines', mode); const result = work(tx.objectStore('lines')); tx.oncomplete = () => resolve(result); tx.onerror = tx.onabort = () => reject(tx.error || new Error('Cache transaction failed')); });
}
export async function readCache(keys) {
  const values = new Array(keys.length);
  await transaction('readonly', store => keys.forEach((key, i) => { const r = store.get(key); r.onsuccess = () => { values[i] = r.result?.segment; }; }));
  return values;
}
export async function writeCache(keys, segments) {
  await transaction('readwrite', store => keys.forEach((key, i) => store.put({ key, segment: segments[i], saved: Date.now() })));
  await transaction('readwrite', store => {
    const count = store.count(); count.onsuccess = () => {
      let remove = count.result - 30000; if (remove <= 0) return;
      const cursor = store.index('saved').openCursor(); cursor.onsuccess = () => { if (cursor.result && remove-- > 0) { cursor.result.delete(); cursor.result.continue(); } };
    };
  });
}
export const clearCache = () => transaction('readwrite', store => store.clear());
