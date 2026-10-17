import test from 'node:test';
import assert from 'node:assert/strict';
import { ProfileStore } from '../extension/profiles.js';
function storageWith(profiles = {}) {
  const storage = {};
  for (const area of ['local', 'session']) storage[area] = { data: area === 'local' ? { profiles } : {}, access: null,
    async get() { return structuredClone(this.data); }, async set(values) { Object.assign(this.data, structuredClone(values)); }, async setAccessLevel(value) { this.access = value.accessLevel; } };
  return storage;
}

test('API keys leave disk storage, survive a service-worker restart, and disappear with the Chrome session', async () => {
  const storage = storageWith({ google: { baseUrl: 'https://translation.googleapis.com', model: '', key: 'legacy-secret' } });
  let store = new ProfileStore(storage); await store.ready;
  assert.equal(storage.local.access, 'TRUSTED_CONTEXTS'); assert.equal(storage.session.access, 'TRUSTED_CONTEXTS');
  assert.doesNotMatch(JSON.stringify(storage.local.data), /legacy-secret|"key"/);
  assert.equal((await store.all()).google.key, 'legacy-secret');
  store = new ProfileStore(storage); assert.equal((await store.all()).google.key, 'legacy-secret');
  storage.session.data = {}; store = new ProfileStore(storage);
  assert.equal((await store.all()).google.key, ''); assert.equal((await store.all()).google.baseUrl, 'https://translation.googleapis.com');
});

test('concurrent profile saves preserve each key and endpoint changes cannot reuse another host credential', async () => {
  const storage = storageWith(), store = new ProfileStore(storage);
  await Promise.all([
    store.set('custom', { baseUrl: 'https://one.example', model: 'one', key: 'first-secret' }),
    store.set('google', { baseUrl: 'https://translation.googleapis.com', model: '', key: 'second-secret' })
  ]);
  assert.equal((await store.all()).custom.key, 'first-secret'); assert.equal((await store.all()).google.key, 'second-secret');
  assert.doesNotMatch(JSON.stringify(storage.local.data), /first-secret|second-secret|"key"/);
  storage.local.data.profiles.custom.baseUrl = 'https://other.example';
  assert.equal((await store.all()).custom.key, '');
  await store.set('google'); assert.equal((await store.all()).google, undefined);
  assert.doesNotMatch(JSON.stringify(storage.session.data), /second-secret/);
});
