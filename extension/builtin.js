// The Translator API is a document API, so it runs beside the player, never in a worker.
// A real button supplies user activation if Chrome needs to download a language pack.
(function (scope) {
  const targetCode = code => ({ 'zh-CN': 'zh', 'zh-TW': 'zh-Hant' }[code] || code);
  class BuiltinTranslator {
    constructor() { this.target = ''; this.instance = null; this.button = null; this.pending = null; this.generation = 0; }
    async translate(cues, target, signal) {
      if (typeof scope.Translator === 'undefined') throw Object.assign(new Error('Browser translation is unavailable here. Use an up-to-date desktop Chrome, or choose a cloud translator.'), { needsUser: true });
      if (this.target !== target) { this.close(); this.target = target; }
      const generation = this.generation;
      const check = () => { signal?.throwIfAborted(); if (generation !== this.generation) throw new DOMException('Translation changed', 'AbortError'); };
      const options = { sourceLanguage: 'en', targetLanguage: targetCode(target) };
      if (!this.instance) {
        const availability = await scope.Translator.availability(options);
        check();
        if (availability === 'unavailable') throw Object.assign(new Error('This browser cannot translate this language. Choose a cloud translator in the extension.'), { needsUser: true });
        if (this.pending || (availability !== 'available' && !navigator.userActivation?.isActive)) {
          this.offer(options);
          throw Object.assign(new Error('Click Start subtitles on the video to prepare the browser language pack.'), { needsUser: true, awaiting: 'download' });
        }
        const instance = await scope.Translator.create({ ...options, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000) });
        try { check(); } catch (e) { instance.destroy(); throw e; }
        this.instance = instance;
      }
      const segments = [];
      for (const cue of cues) {
        check();
        const text = await this.instance.translate(cue.text.replace(/\s*\n\s*/g, ' '), { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000) });
        check();
        if (!text?.trim()) throw new Error('Browser returned an empty translation. Retry or choose another translator.');
        segments.push({ sourceIds: [cue.id], text, start: cue.start, end: cue.end });
      }
      return segments;
    }
    offer(options) {
      if (this.button || this.pending) return;
      const host = document.createElement('div'); host.style.cssText = 'position:fixed;z-index:2147483647;bottom:80px;left:50%;transform:translateX(-50%);';
      const shadow = host.attachShadow({ mode: 'closed' }), button = document.createElement('button');
      button.textContent = 'Start subtitles'; button.style.cssText = 'font:15px system-ui;padding:12px 20px;border:0;border-radius:8px;background:#0f8a54;color:white;cursor:pointer;box-shadow:0 2px 12px #0008'; shadow.append(button);
      // Full screen shows only the full-screen element: follow it in and out, as the subtitles do.
      const place = () => { const parent = document.fullscreenElement || document.body; if (host.parentNode !== parent) parent.append(host); };
      place(); document.addEventListener('fullscreenchange', place); this.button = host; this.unplace = () => document.removeEventListener('fullscreenchange', place);
      button.onclick = () => {
        button.disabled = true; button.textContent = 'Preparing translation…';
        const generation = this.generation, controller = new AbortController(); this.download = controller;
        // Call create inside the click handler: this is the browser's user-activation boundary.
        this.pending = scope.Translator.create({ ...options, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(300000)]), monitor: m => m.addEventListener('downloadprogress', e => { button.textContent = `Preparing translation… ${Math.round(e.loaded * 100)}%`; }) });
        this.pending.then(instance => {
          if (generation !== this.generation) { instance.destroy(); return; }
          this.instance?.destroy(); this.instance = instance; host.remove(); this.button = null; this.unplace?.();
          scope.dispatchEvent(new Event('smart-subtitles-builtin-ready'));
        }, () => { if (generation === this.generation) { button.textContent = 'Download failed — retry'; button.disabled = false; } }).finally(() => { if (generation === this.generation) { this.pending = null; this.download = null; } });
      };
    }
    close() { this.generation++; this.download?.abort(); this.download = null; this.pending = null; this.instance?.destroy(); this.instance = null; this.button?.remove(); this.button = null; this.unplace?.(); }
  }
  scope.SubtitleBuiltin = { BuiltinTranslator };
})(globalThis);
