import './languages.js';
import './sites.js';
import { readSubtitleResource } from './subtitle-resource.js';
import { DEFAULTS, PROVIDERS, endpoint, validateWindow, validateSegments, cacheKeys, translateRemote } from './translation.js';
import { readCache, writeCache, clearCache } from './cache.js';
import { chatgpt, beginLogin, finishLogin, clearLoginRule, loginStatus, cancelLogin, focusLogin } from './chatgpt-connection.js';
import { ProfileStore } from './profiles.js';

const profileStore = new ProfileStore(chrome.storage), storageReady = profileStore.ready;
const active = new Map();
const isPage = sender => !!sender.tab && !!globalThis.SubtitleSites.identify(sender.url);
const isUI = sender => ['popup.html', 'settings.html'].some(file => sender.url?.split(/[?#]/)[0] === chrome.runtime.getURL(file));
const clientOf = sender => `tab-${sender.tab.id}-${sender.frameId || 0}`;
async function settings() {
  const { preferences = {} } = await chrome.storage.local.get('preferences');
  return { ...DEFAULTS, ...preferences };
}
async function profile(provider) {
  if (provider === 'chatgpt') {
    const { chatgptMetadata = {} } = await chrome.storage.local.get('chatgptMetadata');
    return { model: chatgptMetadata.accounts?.find(a => a.id === chatgptMetadata.active)?.model || PROVIDERS.chatgpt.model };
  }
  return (await profileStore.all())[provider] || {};
}
function cancelAll() { for (const controller of active.values()) controller.abort(); active.clear(); }
async function broadcast(resetTranslations = false) {
  if (resetTranslations) cancelAll();
  const next = await settings();
  const tabs = await chrome.tabs.query({ url: globalThis.SubtitleSites.matches });
  await Promise.allSettled(tabs.map(tab => chrome.tabs.sendMessage(tab.id, { type: 'settingsChanged', settings: next, resetTranslations })));
  return next;
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!message || typeof message !== 'object' || sender.id !== chrome.runtime.id) return;
  if (message.target === 'chatgpt-runtime') return;
  const callback = message.type === 'chatgptCallback' && sender.url?.split(/[?#]/)[0] === chrome.runtime.getURL('auth-callback.html');
  if (!isPage(sender) && !isUI(sender) && !callback) return;
  (async () => {
    await storageReady;
    const ui = isUI(sender);
    switch (message.type) {
      case 'ping': return {};
      case 'settings': return settings();
      case 'saveSettings': {
        if (!ui) throw new Error('Settings page only');
        const old = await settings(), next = { ...old };
        const changes = message.settings || {};
        if (typeof changes.enabled === 'boolean') next.enabled = changes.enabled;
        if (changes.target !== undefined) { if (!globalThis.SubtitleLanguages.get(changes.target)) throw new Error('Unsupported language'); next.target = changes.target; }
        if (changes.provider !== undefined) { if (!PROVIDERS[changes.provider]) throw new Error('Unknown translator'); next.provider = changes.provider; }
        if (Number.isFinite(changes.fontSize)) next.fontSize = Math.max(18, Math.min(100, changes.fontSize));
        await chrome.storage.local.set({ preferences: next }); return broadcast(next.provider !== old.provider || next.target !== old.target || !next.enabled);
      }
      case 'savePosition': {
        if (!isPage(sender) || !Number.isFinite(message.subtitleOffset)) throw new Error('Invalid position');
        const next = { ...await settings(), subtitleOffset: Math.max(0, Math.min(.85, message.subtitleOffset)) };
        await chrome.storage.local.set({ preferences: next }); return next;
      }
      case 'profiles': {
        if (!ui) throw new Error('Settings page only');
        const profiles = await profileStore.all();
        return Object.fromEntries(Object.entries(profiles).map(([id, { key, ...rest }]) => [id, { ...rest, configured: !!key || id === 'custom' }]));
      }
      case 'saveProfile': {
        if (!ui || !PROVIDERS[message.provider] || ['builtin', 'chatgpt'].includes(message.provider)) throw new Error('Invalid translator');
        const profiles = await profileStore.all();
        if (message.clear) delete profiles[message.provider];
        else {
          const previous = profiles[message.provider] || {};
          const p = { baseUrl: endpoint(message.provider, message.profile), model: String(message.profile.model || PROVIDERS[message.provider].model || '').trim().slice(0, 120) };
          // Never silently send an existing key to a newly selected host.
          p.key = String(message.profile.key || (previous.baseUrl === p.baseUrl ? previous.key || '' : '')).trim();
          if (p.key.length > 1000 || /[\r\n]/.test(p.key)) throw new Error('Invalid API key');
          if (!p.key && message.provider !== 'custom') throw new Error('Enter your API key');
          if (message.provider !== 'google' && !p.model) throw new Error('Enter the model name from your provider');
          if (!await chrome.permissions.contains({ origins: [new URL(p.baseUrl).origin + '/*'] })) throw new Error('Allow access to this API server first');
          profiles[message.provider] = p;
        }
        await profileStore.set(message.provider, profiles[message.provider]); await broadcast(true); return { saved: true };
      }
      case 'clearCache': if (!ui) throw new Error('Settings page only'); cancelAll(); await clearCache(); await broadcast(true); return {};
      case 'testProfile': {
        if (!ui) throw new Error('Settings page only');
        const s = { ...await settings(), provider: message.provider }, p = await profile(s.provider);
        const request = { title: '', session: 'connection-test', epoch: 'test', context: [], cues: [{ id: 'test', start: 0, end: 1, text: 'Hello.' }] };
        const result = s.provider === 'chatgpt' ? await chatgpt('translate', { request, target: s.target }, AbortSignal.timeout(90000)) : await translateRemote(s, p, request, AbortSignal.timeout(25000));
        return { text: result.segments[0].text, usage: result.usage };
      }
      case 'providerReady': {
        if (!ui || !PROVIDERS[message.provider]) throw new Error('Settings page only');
        if (message.provider === 'builtin') return true;
        if (message.provider === 'chatgpt') { const state = await chatgpt('status'); return !!state.accounts.find(a => a.id === state.active)?.ready; }
        const p = await profile(message.provider); return !!(p.key || (message.provider === 'custom' && p.baseUrl && p.model));
      }
      case 'chatgptCallback': {
        const state = await finishLogin(sender, message.params);
        if (state.accounts.find(a => a.id === state.active)?.ready) {
          await chrome.storage.local.set({ preferences: { ...await settings(), provider: 'chatgpt' } });
          await broadcast(true);
        }
        return { connected: true };
      }
      case 'chatgptAccount': {
        if (!ui) throw new Error('Settings page only');
        const { action, accountId, model, enablePlan } = message;
        if (action === 'begin') return beginLogin({ accountId, enablePlan });
        if (action === 'status') return loginStatus();
        if (action === 'models') return chatgpt('models', { accountId });
        if (action === 'welcome') return chatgpt('welcome');
        if (action === 'cancel') return cancelLogin();
        if (action === 'focus') return focusLogin();
        if (action === 'signOut') { cancelAll(); const result = await chatgpt('signOut', { accountId }); await clearLoginRule(); await broadcast(true); return result; }
        if (action === 'use') {
          cancelAll(); await chatgpt('use', { accountId, model });
          await chrome.storage.local.set({ preferences: { ...await settings(), provider: 'chatgpt' } });
          await broadcast(true); return {};
        }
        throw new Error('Unknown account action');
      }
      case 'subtitleResource': {
        if (!isPage(sender) || !globalThis.SubtitleSites.subtitleResource(message.url, sender.url)) throw new Error('This player may not request that file');
        return readSubtitleResource(message.url);
      }
      case 'cancel': {
        if (!isPage(sender)) throw new Error('Player only');
        const client = clientOf(sender), controller = active.get(client);
        if (controller?.epoch === message.epoch) { controller.abort(); active.delete(client); }
        return {};
      }
      case 'translateWindow':
      case 'saveBuiltin': {
        if (!isPage(sender)) throw new Error('Player only');
        const request = validateWindow(message.request), client = clientOf(sender);
        // Register before the first await so a reset can cancel cache lookups as well as fetches.
        active.get(client)?.abort();
        const controller = new AbortController(); controller.epoch = request.epoch; active.set(client, controller);
        try {
          const s = await settings();
          controller.signal.throwIfAborted();
          if (!s.enabled || s.provider !== message.provider || s.target !== message.target) throw new Error('Translation settings changed');
          const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(s.provider === 'chatgpt' ? 100000 : 25000)]);
          const p = await profile(s.provider), keys = await cacheKeys(request, s, p);
          signal.throwIfAborted();
          if (message.type === 'saveBuiltin') {
            if (s.provider !== 'builtin') throw new Error('Browser translator only');
            const segments = validateSegments(message.segments, request.cues);
            await writeCache(keys, segments); return {};
          }
          const cached = await readCache(keys), missing = request.cues.filter((_, i) => !cached[i]);
          signal.throwIfAborted();
          if (!missing.length || s.provider === 'builtin') return { segments: cached.filter(Boolean), missing, cached: !missing.length };
          if (s.provider !== 'chatgpt' && !p.key && s.provider !== 'custom') throw Object.assign(new Error('Add your API key in Translator settings'), { needsUser: true });
          const part = { ...request, cues: missing };
          const result = s.provider === 'chatgpt' ? await chatgpt('translate', { request: part, target: s.target }, signal) : await translateRemote(s, p, part, signal);
          signal.throwIfAborted();
          const segments = validateSegments(result.segments, missing);
          await writeCache(keys.filter((_, i) => !cached[i]), segments);
          return { segments: [...cached.filter(Boolean), ...segments], usage: result.usage, missing: [] };
        } finally { if (active.get(client) === controller) active.delete(client); }
      }
      default: throw new Error('Unknown message');
    }
  })().then(data => respond({ ok: true, data }), error => respond({ ok: false, error: error.name === 'TimeoutError' ? 'Translation timed out. Retry or choose a faster model.' : error.message, code: error.code || '', needsUser: !!error.needsUser }));
  return true;
});
chrome.tabs.onRemoved.addListener(tabId => { for (const [client, controller] of active) if (client.startsWith(`tab-${tabId}-`)) { controller.abort(); active.delete(client); } });
