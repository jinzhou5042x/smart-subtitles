import './sites.js';

// Content scripts also run in frames. The popup belongs to the main player page,
// so unrelated child-frame responses must not win the diagnostics request.
// The isolated-world scripts in the manifest's order; both come from the registry in sites.js.
export const PAGE_SCRIPTS = globalThis.SubtitleSites.pageScripts;
const reconnecting = new Map();
const attempted = new Map();
const failures = new Map();
const connectionIssue = detail => ({ connectionIssue: true, tone: 'error', status: 'Not connected to this page', detail });
export async function playerMessage(tabs, message, tab, scripting) {
  if (!tab) [tab] = await tabs.query({ active: true, currentWindow: true });
  if (!tab) return null;
  try { return await tabs.sendMessage(tab.id, message, { frameId: 0 }); }
  catch {
    if (message.type !== 'diagnostics' || tab.status === 'loading' || !globalThis.SubtitleSites.identify(tab.url)) return null;
    if (typeof scripting?.executeScript !== 'function') return connectionIssue('Reload this extension in chrome://extensions to finish applying the update.');
    // Coalesce popup polls and avoid reinjecting repeatedly when access is denied.
    const key = `${tab.id}|${tab.url}`;
    if (!reconnecting.has(key)) {
      if (Date.now() - (attempted.get(key) || 0) < 10000) return failures.get(key) || null;
      attempted.set(key, Date.now());
      reconnecting.set(key, (async () => {
        const target = { tabId: tab.id, frameIds: [0] };
        await scripting.executeScript({ target, world: 'MAIN', files: globalThis.SubtitleSites.captureScripts });
        await scripting.executeScript({ target, world: 'ISOLATED', files: [...PAGE_SCRIPTS] });
        return tabs.sendMessage(tab.id, message, { frameId: 0 });
      })());
    }
    try { const result = await reconnecting.get(key); failures.delete(key); return result; }
    catch (error) {
      // Preserve the actual failure locally; never label all failures as denied site access.
      console.warn('Subtitle connection recovery failed:', error);
      const state = connectionIssue('Reload the page to connect Smart Subtitles.');
      failures.set(key, state); return state;
    }
    finally { reconnecting.delete(key); }
  }
}

// What the popup's card shows for the active tab: the page's own report when there is one.
export function playerState(tab, info, enabled) {
  if (!enabled) return { tone: 'off', status: 'Bilingual subtitles are off', detail: 'Turn them on with the switch above.' };
  if (info) return info;
  if (!globalThis.SubtitleSites.identify(tab?.url)) return { status: `Open a video on ${new Intl.ListFormat('en', { type: 'disjunction' }).format(globalThis.SubtitleSites.names)}` };
  return { status: 'Connecting to the video…', detail: '' };
}
