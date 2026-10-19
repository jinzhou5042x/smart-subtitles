import test from 'node:test';
import assert from 'node:assert/strict';
import { ProfileStore } from '../extension/profiles.js';
import { createVault } from '../extension/vault.js';
function storageWith(profiles = {}, session = {}) {
  const storage = {};
  for (const area of ['local', 'session']) storage[area] = { data: area === 'local' ? { profiles } : session, access: null,
    async get(keys) { const all = structuredClone(this.data); return keys === undefined || keys === null ? all : Object.fromEntries([keys].flat().filter(k => k in all).map(k => [k, all[k]])); },
    async set(values) { Object.assign(this.data, structuredClone(values)); }, async setAccessLevel(value) { this.access = value.accessLevel; } };
  return storage;
}
const vaultKey = crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
const vault = () => createVault(() => vaultKey);

test('API keys are saved encrypted, survive a restart and are never stored in plain text', async () => {
  const storage = storageWith();
  let store = new ProfileStore(storage, vault());
  await store.set('openai', { baseUrl: 'https://api.openai.com/v1', model: 'm', key: 'sk-plain-secret' });
  assert.equal(storage.local.access, 'TRUSTED_CONTEXTS');
  assert.doesNotMatch(JSON.stringify(storage), /sk-plain-secret/);
  assert.ok(storage.local.data.apiKeys.openai.sealed.data);
  // A Chrome restart empties the session area; the saved key stays.
  storage.session.data = {}; store = new ProfileStore(storage, vault());
  assert.equal((await store.all()).openai.key, 'sk-plain-secret');
});

test('plain-text keys from earlier versions are encrypted once', async () => {
  const storage = storageWith({ google: { baseUrl: 'https://translation.googleapis.com', model: '', key: 'legacy-secret' }, openai: { baseUrl: 'https://api.openai.com/v1', model: 'm' } },
    { apiKeys: { openai: { baseUrl: 'https://api.openai.com/v1', key: 'session-secret' } } });
  const store = new ProfileStore(storage, vault()); await store.ready;
  assert.doesNotMatch(JSON.stringify(storage), /legacy-secret|session-secret|"key"/);
  assert.equal((await store.all()).google.key, 'legacy-secret'); assert.equal((await store.all()).openai.key, 'session-secret');
});

test('a key that cannot be decrypted reads as missing, not as an error', async () => {
  const storage = storageWith();
  await new ProfileStore(storage, vault()).set('claude', { baseUrl: 'https://api.anthropic.com/v1', model: 'm', key: 'sk-ant-secret' });
  const other = createVault(() => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']));
  const read = await new ProfileStore(storage, other).all();
  assert.equal(read.claude.key, ''); assert.equal(read.claude.baseUrl, 'https://api.anthropic.com/v1');
});

test('concurrent profile saves preserve each key and endpoint changes cannot reuse another host credential', async () => {
  const storage = storageWith(), store = new ProfileStore(storage, vault());
  await Promise.all([
    store.set('custom', { baseUrl: 'https://one.example', model: 'one', key: 'first-secret' }),
    store.set('google', { baseUrl: 'https://translation.googleapis.com', model: '', key: 'second-secret' })
  ]);
  assert.equal((await store.all()).custom.key, 'first-secret'); assert.equal((await store.all()).google.key, 'second-secret');
  assert.doesNotMatch(JSON.stringify(storage), /first-secret|second-secret/);
  storage.local.data.profiles.custom.baseUrl = 'https://other.example';
  assert.equal((await store.all()).custom.key, '');
  await store.set('google'); assert.equal((await store.all()).google, undefined);
  assert.equal(storage.local.data.apiKeys.google, undefined);
});
