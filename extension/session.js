// Playback-driven windows. Completed lines survive seeks; old requests never reach a new epoch.
(function (scope) {
  function nextWindow(cues, lines, time, paused = false) {
    const end = time + (paused ? 20 : 90);
    const candidates = cues.filter(c => c.end >= Math.max(0, time - 1) && c.start <= end && !lines.has(c.id));
    if (!candidates.length) return [];
    const start = candidates[0].start;
    return candidates.filter(c => c.start < start + 30).slice(0, 12);
  }
  class TranslationSession {
    constructor({ send, now = Date.now, id = () => crypto.randomUUID(), builtin } = {}) {
      Object.assign(this, { send, now, id });
      this.builtin = builtin || (scope.SubtitleBuiltin ? new scope.SubtitleBuiltin.BuiltinTranslator() : null);
      this.cues = []; this.lines = new Map(); this.epoch = id(); this.selection = { provider: 'builtin', target: 'zh-CN' }; this.clear();
    }
    clear() { this.lines.clear(); this.episode = null; this.busy = false; this.complete = false; this.retryAt = 0; this.error = ''; this.awaiting = ''; this.redo = ''; this.stopped = ''; this.interrupted = ''; this.attempts = 0; this.lastTime = null; }
    configure(settings) {
      const changed = settings.provider !== this.selection.provider || settings.target !== this.selection.target;
      if (changed || !settings.enabled) this.reset();
      this.selection = { provider: settings.provider, target: settings.target };
    }
    cancel() { const old = this.epoch; this.epoch = this.id(); this.busy = false; this.controller?.abort(); Promise.resolve(this.send({ type: 'cancel', epoch: old })).catch(() => {}); }
    reset() { this.cancel(); this.clear(); this.builtin?.close(); }
    use(cues) { this.reset(); this.cues = cues; }
    retry() { this.error = ''; this.interrupted = ''; this.awaiting = ''; this.attempts = 0; this.retryAt = 0; }
    again() { this.reset(); return !!this.cues.length; }
    get working() { return this.busy; }
    get translated() { return this.lines.size; }
    apply(segments) { for (const segment of segments || []) for (const id of segment.sourceIds) this.lines.set(id, segment); this.complete = this.lines.size === this.cues.length; }
    async run({ session, title, time = 0, paused = false }) {
      if (!Number.isFinite(time) || time < 0) return;
      if (this.lastTime !== null && Math.abs(time - this.lastTime) > 4) { this.cancel(); this.retry(); }
      this.lastTime = time;
      if (!this.cues.length || this.busy || this.error || this.now() < this.retryAt) return;
      const window = nextWindow(this.cues, this.lines, time, paused);
      if (!window.length) { this.episode = { ...this.episode, status: 'ready' }; return; }
      const first = this.cues.indexOf(window[0]), last = this.cues.indexOf(window.at(-1));
      const context = this.cues.slice(Math.max(0, first - 12), Math.min(this.cues.length, last + 13)).filter(c => !window.includes(c)).slice(0, 24).map(c => ({ ...c, ...(this.lines.has(c.id) ? { translation: this.lines.get(c.id).text } : {}) }));
      const epoch = this.epoch, selection = { ...this.selection }, stale = () => epoch !== this.epoch;
      const request = { session, title, epoch, cues: window, context };
      const controller = new AbortController(); this.controller = controller; this.busy = true; this.episode = { status: 'running' };
      // Bounded to this active request, never a permanent background keep-alive.
      const heartbeat = setInterval(() => { this.send({ type: 'ping' }).catch(() => {}); }, 10000);
      try {
        const result = await this.send({ type: 'translateWindow', request, ...selection });
        if (stale()) return;
        this.apply(result.segments);
        if (selection.provider === 'builtin' && result.missing?.length) {
          const segments = await this.builtin.translate(result.missing, selection.target, controller.signal);
          if (stale()) return;
          await this.send({ type: 'saveBuiltin', request: { ...request, cues: result.missing }, segments, ...selection });
          if (stale()) return; this.apply(segments);
        }
        this.error = ''; this.awaiting = ''; this.interrupted = ''; this.attempts = 0;
        this.episode = { status: this.complete ? 'done' : 'ready', cached: result.cached, usage: result.usage };
        this.retryAt = this.now() + 250;
      } catch (e) {
        if (stale() || controller.signal.aborted) return;
        this.awaiting = e.awaiting || ''; this.episode = { status: 'error' };
        // Do not repeatedly spend quota on timeouts, malformed output or invalid credentials.
        this.error = e.message; this.attempts++;
      } finally { clearInterval(heartbeat); if (!stale()) this.busy = false; }
    }
  }
  scope.SubtitleSession = { TranslationSession, nextWindow };
})(globalThis);
