// API credentials are saved in this browser profile's local extension storage, encrypted (vault.js)
// and readable only by the extension's own pages and worker, never by content scripts or the video
// site. Each key is kept with the server it was entered for and is never sent to another one.
export class ProfileStore {
  #storage; #vault; #writes = Promise.resolve();
  constructor(storage, vault) { this.#storage = storage; this.#vault = vault; this.ready = this.#initialize(); }
  async #initialize() {
    await Promise.all(['local', 'session'].map(area => this.#storage[area].setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })));
    const [{ profiles = {}, apiKeys = {} }, { apiKeys: sessionKeys = {} }] = await Promise.all([this.#storage.local.get(['profiles', 'apiKeys']), this.#storage.session.get('apiKeys')]);
    // Earlier versions kept keys in plain text: inside the profiles (before 1.0), or only for the
    // Chrome session (to 1.2.5). Both are encrypted into the saved keys once.
    let migrated = Object.keys(sessionKeys).length > 0;
    const metadata = {}, keys = { ...apiKeys };
    for (const [provider, entry] of Object.entries(sessionKeys)) if (!keys[provider] && entry?.key) keys[provider] = entry;
    for (const [provider, profile] of Object.entries(profiles)) {
      metadata[provider] = { baseUrl: profile.baseUrl || '', model: profile.model || '' };
      if (Object.hasOwn(profile, 'key')) {
        migrated = true;
        if (profile.key && !keys[provider]) keys[provider] = { baseUrl: profile.baseUrl, key: profile.key };
      }
    }
    for (const [provider, entry] of Object.entries(keys)) if (typeof entry?.key === 'string') { migrated = true; keys[provider] = { baseUrl: entry.baseUrl, sealed: await this.#vault.seal(entry.key) }; }
    if (migrated) {
      await this.#storage.local.set({ profiles: metadata, apiKeys: keys });
      await this.#storage.session.set({ apiKeys: {} });
    }
  }
  async all() {
    await this.ready;
    const { profiles = {}, apiKeys = {} } = await this.#storage.local.get(['profiles', 'apiKeys']);
    const entries = await Promise.all(Object.entries(profiles).map(async ([provider, p]) => {
      const saved = apiKeys[provider];
      return [provider, { baseUrl: p.baseUrl, model: p.model, key: saved?.baseUrl === p.baseUrl && saved.sealed ? await this.#vault.open(saved.sealed) : '' }];
    }));
    return Object.fromEntries(entries);
  }
  set(provider, profile) {
    const write = this.#writes.then(async () => {
      await this.ready;
      const sealed = profile?.key ? await this.#vault.seal(profile.key) : null;
      const { profiles = {}, apiKeys = {} } = await this.#storage.local.get(['profiles', 'apiKeys']);
      if (profile) {
        profiles[provider] = { baseUrl: profile.baseUrl, model: profile.model };
        if (sealed) apiKeys[provider] = { baseUrl: profile.baseUrl, sealed };
        else delete apiKeys[provider];
      } else { delete profiles[provider]; delete apiKeys[provider]; }
      await this.#storage.local.set({ profiles, apiKeys });
    });
    this.#writes = write.catch(() => {});
    return write;
  }
}
