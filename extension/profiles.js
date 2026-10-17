// API credentials live in Chrome's in-memory session area, not its disk-backed storage.
export class ProfileStore {
  #storage; #writes = Promise.resolve();
  constructor(storage) { this.#storage = storage; this.ready = this.#initialize(); }
  async #initialize() {
    await Promise.all(['local', 'session'].map(area => this.#storage[area].setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })));
    const [{ profiles = {} }, { apiKeys = {} }] = await Promise.all([this.#storage.local.get('profiles'), this.#storage.session.get('apiKeys')]);
    let migrated = false;
    const metadata = {};
    for (const [provider, profile] of Object.entries(profiles)) {
      metadata[provider] = { baseUrl: profile.baseUrl || '', model: profile.model || '' };
      if (Object.hasOwn(profile, 'key')) {
        migrated = true;
        if (profile.key && !apiKeys[provider]) apiKeys[provider] = { baseUrl: profile.baseUrl, key: profile.key };
      }
    }
    if (migrated) {
      await this.#storage.session.set({ apiKeys });
      await this.#storage.local.set({ profiles: metadata });
    }
  }
  async all() {
    await this.ready;
    const [{ profiles = {} }, { apiKeys = {} }] = await Promise.all([this.#storage.local.get('profiles'), this.#storage.session.get('apiKeys')]);
    return Object.fromEntries(Object.entries(profiles).map(([provider, p]) => [provider, { baseUrl: p.baseUrl, model: p.model, key: apiKeys[provider]?.baseUrl === p.baseUrl ? apiKeys[provider].key : '' }]));
  }
  set(provider, profile) {
    const write = this.#writes.then(async () => {
      await this.ready;
      const [{ profiles = {} }, { apiKeys = {} }] = await Promise.all([this.#storage.local.get('profiles'), this.#storage.session.get('apiKeys')]);
      if (profile) {
        profiles[provider] = { baseUrl: profile.baseUrl, model: profile.model };
        if (profile.key) apiKeys[provider] = { baseUrl: profile.baseUrl, key: profile.key };
        else delete apiKeys[provider];
      } else { delete profiles[provider]; delete apiKeys[provider]; }
      await this.#storage.session.set({ apiKeys });
      await this.#storage.local.set({ profiles });
    });
    this.#writes = write.catch(() => {});
    return write;
  }
}
