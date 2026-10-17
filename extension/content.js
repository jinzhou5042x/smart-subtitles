// The page script: connects the layers and holds no logic of its own that a layer could hold.
//   site.js + players/*   where the title is and what time it is       (SubtitleSite)
//   tracks.js             which subtitle track is the title's          (SubtitleTracks)
//   session.js            the translation of that track                (SubtitleSession)
//   overlay.js            the two lines over the picture               (SubtitleOverlay)
// Subtitle files arrive from capture.js, which runs in the page's own JavaScript world.
(() => {
  if (!globalThis.SubtitleSites.identify(location.href)) return;
  if (globalThis.__smartSubtitles) return;
  const C = globalThis.SubtitleCore, T = globalThis.SubtitleTracks, site = globalThis.SubtitleSite, version = chrome.runtime.getManifest().version;
  const send = async message => { const r = await chrome.runtime.sendMessage(message); if (!r?.ok) throw Object.assign(new Error(r?.error || 'Connection lost; reload the page'), { needsUser: r?.needsUser }); return r.data; };
  const session = new globalThis.SubtitleSession.TranslationSession({ send });
  const overlay = globalThis.SubtitleOverlay.createOverlay({ onMove: subtitleOffset => { settings = { ...settings, subtitleOffset }; send({ type: 'savePosition', subtitleOffset }).catch(() => {}); } });
  const here = () => globalThis.SubtitleSites.pageKey(location.href);
  const parseXml = text => new DOMParser().parseFromString(text, 'application/xml');
  let settings, video, page = site.episodeKey(), lastScan = 0;
  let tracks = [], selected = null, imported = null, source = 'Waiting for the episode subtitles';
  // contentStarted: when the title itself (not an ad) first played on this page. Players load the
  // title's subtitles only then, so waiting is counted from it, never during pre-roll ads.
  let capture = {}, captureError = '', contentStarted = 0;
  const titleSeconds = track => site.titleSeconds(video, track);
  const durationLabel = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

  // What the popup shows: one status, one line of detail, and whether Retry can help.
  function progressInfo() {
    const seconds = contentStarted ? Math.floor((Date.now() - contentStarted) / 1000) : 0, waiting = seconds >= 20;
    const cues = session.cues, episode = session.episode;
    const checked = [capture.metadata && `${capture.metadata} playback info`, capture.manifests && `${capture.manifests} stream manifests`].filter(Boolean).join(' · ');
    if (session.complete) return { status: 'Subtitles ready', detail: 'Saved in this browser' };
    if (session.error) return { status: session.awaiting ? 'Prepare browser translation' : 'Translation paused', detail: session.error, retry: !session.awaiting };
    if (!video) return { status: `Waiting for a ${site.name} video`, detail: '' };
    if (selected) {
      return { status: session.busy ? 'Translating near the playhead…' : 'Subtitles ready near the playhead', detail: session.busy ? 'You can keep watching or jump ahead.' : 'The next section translates as you watch.' };
    }
    // Pre-roll ads: the title's subtitles are only requested once it starts.
    if (site.adBreak()) return { status: 'Waiting for the ads to finish', detail: 'Subtitles load when the episode starts' };
    if (!contentStarted && !tracks.length && !capture.pending) return { status: 'Waiting for the episode to start', detail: '' };
    if (capture.pending > 0) return { status: 'Reading subtitle files', detail: `${capture.pending} pending · ${capture.received || 0} received`, retry: waiting };
    if (tracks.length) {
      const judged = T.assess(tracks, titleSeconds);
      if (!judged.some(a => a.seconds)) return { status: site.lengthFrom === 'track' ? 'Looking for the complete English subtitles' : 'Subtitles parsed, waiting for the player timeline', detail: `${tracks.length} subtitle files so far`, retry: waiting };
      const english = judged.filter(a => a.track.detected !== 'other');
      if (!english.length) return { status: 'No English subtitles found', detail: `${tracks.length} parsed, all in other languages`, retry: true };
      return { status: 'Subtitle timing failed the completeness check', detail: `subtitles to ${durationLabel(Math.max(...english.map(a => a.track.cues.at(-1)?.end || 0)))} · video ${durationLabel(Math.max(...english.map(a => a.seconds)))}`, retry: true };
    }
    if (captureError) return { status: 'Could not read or parse the subtitles', detail: captureError, retry: true };
    if (checked) return { status: waiting ? 'No subtitle file found for this episode' : 'Looking for the episode subtitles', detail: `Checked ${checked} · ${seconds} s${waiting ? ' · turn on captions in the player, or reload the video' : ''}`, retry: waiting };
    return { status: waiting ? 'No playback information received' : 'Waiting for the episode subtitles', detail: waiting ? 'Reload the video to try again' : '', retry: waiting };
  }

  // The same reason on the picture, for ten seconds each time it changes: the viewer is watching
  // the film, not the popup. Only what stops the subtitles (a state that offers Retry).
  let noticed = { status: '', until: 0 };
  function problemNotice(info) {
    if (!info.retry || session.complete) { noticed = { status: '', until: 0 }; return ''; }
    if (info.status !== noticed.status) noticed = { status: info.status, until: Date.now() + 10000 };
    return Date.now() < noticed.until ? `${info.status} · open Smart Subtitles for details` : '';
  }

  // ---- Which track ----
  function adopt(track, label) {
    if (selected?.fingerprint === track.fingerprint) return;
    selected = track; source = label; session.use(track.cues);
  }
  function acquire() {
    if (imported) { adopt(imported, 'Imported episode subtitles'); return; }
    if (selected) return;
    const best = T.choose(tracks, titleSeconds);
    if (best) { adopt(best, 'Episode subtitle file'); return; }
    // Read only. Never change the player's track.mode, caption settings or playback.
    for (const textTrack of Array.from(video.textTracks || [])) {
      if (!['subtitles', 'captions'].includes(textTrack.kind) || !textTrack.cues?.length) continue;
      const track = T.fromTextTrack(textTrack);
      if (T.choose([track], titleSeconds)) { adopt(track, 'Episode subtitle track'); return; }
    }
  }
  function newPage() {
    window.postMessage({ type: 'smart-subtitles-stop' }, location.origin);
    window.postMessage({ type: 'smart-subtitles-resume' }, location.origin);
    capture = {}; captureError = ''; contentStarted = 0; noticed = { status: '', until: 0 }; probe = globalThis.SubtitleProbe.createProbe();
    tracks = []; selected = null; imported = null; source = 'Waiting for the episode subtitles'; session.use([]);
  }
  const samePage = () => { if (page !== site.episodeKey()) { page = site.episodeKey(); newPage(); } };

  // ---- Drawing ----
  const visible = time => C.onScreen(session.cues, time, { linger: site.captionLinger }).filter(c => session.lines.has(c.id));
  // The player's clock is read every 150 ms (`tick`); drawn only then, a subtitle appeared up to
  // 150 ms after its time. Between two readings the title's time moves with the element's own, so
  // every frame checks with the last known offset whether another subtitle is due, and draws it
  // at once. It reads nothing from the player's page and never runs while the clock is unknown.
  let clockOffset = null, drawn = '', probe = globalThis.SubtitleProbe.createProbe();
  function frame() {
    if (!chrome.runtime?.id) return;
    requestAnimationFrame(frame);
    if (clockOffset === null || !video || video.seeking || !settings?.enabled) return;
    if (visible(video.currentTime - clockOffset).map(c => c.id).join() !== drawn) render();
    // With the player's own captions on: when they change, for the diagnostics (probe.js).
    probe.sample(video.currentTime - clockOffset, session.cues);
  }
  function render() {
    const info = progressInfo(), cues = session.cues;
    overlay.describe({ version, site: site.id, source, cues: cues.length, translated: session.lines.size, status: info.status, detail: info.detail, error: session.error, captured: tracks.length, captureError,
      complete: session.complete, episode: session.episode?.id, timeOrigin: selected?.timeOrigin || 0, files: JSON.stringify(tracks.map(t => ({ name: t.name, language: t.language, count: t.cues.length, end: t.cues.at(-1)?.end, declared: t.declared }))) });
    if (!settings?.enabled || !video || site.adBreak()) { clockOffset = null; overlay.hide(); return; }
    const videoStyle = getComputedStyle(video), bounds = video.getBoundingClientRect();
    const rect = videoStyle.objectPosition === '50% 50%' ? C.pictureRect(bounds, video.videoWidth, video.videoHeight, videoStyle.objectFit) : bounds;
    const time = site.subtitleTime(video, selected?.timeOrigin || 0), known = Number.isFinite(time);
    overlay.describe({ clockPolicy: site.clockPolicy, mediaTime: video.currentTime, subtitleTime: known ? time : '', clockOffset: known ? video.currentTime - time : '' });
    const active = known ? visible(time) : [];
    // For `frame`: the same clock between two readings of it, and what is drawn now.
    clockOffset = known ? video.currentTime - time : null; drawn = active.map(c => c.id).join();
    overlay.position = settings.subtitleOffset;
    overlay.draw({ parent: site.overlayParent(), rect, fontSize: Math.max(18, Math.min(100, Number(settings.fontSize) || 60)),
      translated: [...new Set(active.map(c => session.lines.get(c.id)))].map(s => s.text).join(' '), original: active.map(c => c.text).join(' '),
      notice: cues.length && site.awaitingClock(video) ? 'Move your pointer over the video or pause once to sync subtitles' : session.redo ? `Translating again · ${session.translated.toLocaleString()} / ${cues.length.toLocaleString()}` : problemNotice(info) });
  }
  let loadingSettings = false, nextSettingsAttempt = 0;
  async function loadSettings() {
    if (loadingSettings || Date.now() < nextSettingsAttempt) return;
    loadingSettings = true;
    try {
      settings = await send({ type: 'settings' }); session.configure(settings); session.error = ''; tick();
      window.postMessage({ type: 'smart-subtitles-replay' }, location.origin);
    } catch (e) { session.error = e.message; nextSettingsAttempt = Date.now() + 2000; }
    finally { loadingSettings = false; }
  }
  function tick() {
    // The extension was reloaded or updated: this script can no longer reach it and a new one
    // takes over. Leave nothing behind that would draw stale lines beside the new overlay.
    if (!chrome.runtime?.id) { clearInterval(timer); overlay.remove(); return; }
    if (!settings) { void loadSettings(); return; }
    if (Date.now() - lastScan > 750) {
      lastScan = Date.now();
      samePage();
      const nextVideo = site.contentVideo();
      // Player elements disappear briefly during startup and ad transitions.
      // Keep this title's captures and downloads; only a route change resets them.
      if (!video && nextVideo) window.postMessage({ type: 'smart-subtitles-resume' }, location.origin);
      video = nextVideo; if (video && settings.enabled) acquire();
      if (video && !contentStarted && !site.adBreak() && !video.paused && video.currentTime > 0.5) contentStarted = Date.now();
    }
    render();
    if (settings.enabled && video && selected && !site.adBreak() && !video.seeking) void session.run({ session: location.origin + page, title: document.title, time: site.subtitleTime(video, selected?.timeOrigin || 0), paused: video.paused });
  }

  // ---- What the page and its clock currently are, for a report. No subtitle text, no addresses. ----
  function snapshot() {
    const time = video ? site.subtitleTime(video, selected?.timeOrigin || 0) : NaN;
    return { version, at: new Date().toISOString(), site: site.id, watchPage: site.isWatchPage(), settings: settings && { enabled: settings.enabled, target: settings.target, provider: settings.provider },
      video: video ? { id: video.id, currentTime: video.currentTime, duration: video.duration, paused: video.paused, seeking: video.seeking, readyState: video.readyState, width: Math.round(video.getBoundingClientRect().width) } : null,
      ad: site.adBreak(), clock: { policy: site.clockPolicy, subtitleTime: Number.isFinite(time) ? time : null, awaitingViewer: video ? site.awaitingClock(video) : false, ...(video ? site.clockState(video) : {}) },
      tracks: T.describe(tracks, titleSeconds, selected), source,
      translation: { lines: session.cues.length, held: session.lines.size, complete: session.complete, working: session.working, service: session.episode?.status || null, error: session.error, interrupted: session.interrupted, attempts: session.attempts, awaiting: session.awaiting, again: !!session.redo },
      capture: { ...capture, error: captureError }, popup: progressInfo(),
      // The player's own captions against the file's times, in seconds; empty unless they are turned on.
      playerCaptions: probe.summary() };
  }

  chrome.runtime.onMessage.addListener((m, sender, respond) => {
    if (m.type === 'settingsChanged') {
      const changed = settings?.target !== m.settings.target || settings?.provider !== m.settings.provider; settings = m.settings; session.configure(settings);
      // Another language or translator has its own record; a finished setup can try again.
      if (m.resetTranslations || changed) session.reset();
      render(); respond({ ok: true });
    } else if (m.type === 'diagnostics') {
      const info = progressInfo();
      // tone: done, working, error or waiting; the popup draws the progress from these fields.
      const tone = session.complete ? 'done' : session.error ? 'error' : session.working || session.interrupted ? 'working' : info.retry ? 'error' : 'waiting';
      respond({ version, video: !!video, source, total: session.cues.length, translated: session.translated, complete: session.complete, redo: !!session.redo, provider: settings?.provider, busy: session.busy, ...info, tone,
        cached: !!session.episode?.cached, elapsedMs: session.episode && !session.episode.cached ? session.episode.elapsedMs : null, usage: session.episode?.usage || null, error: session.error, captureError, episodeId: session.episode?.id,
        files: tracks.map(t => ({ name: t.name, language: t.language, cues: t.cues.length })) });
    } else if (m.type === 'snapshot') respond(snapshot());
    else if (m.type === 'retry') { session.retry(); captureError = ''; window.postMessage({ type: 'smart-subtitles-replay', retry: true }, location.origin); respond({ ok: true }); }
    else if (m.type === 'retranslate') respond(session.again() ? { ok: true } : { ok: false, error: 'Nothing to translate again yet' });
    else if (m.type === 'importSubtitles') {
      try { imported = T.parse(m.text, { name: 'imported', declared: true }, parseXml); adopt(imported, 'Imported episode subtitles'); respond({ ok: true, count: imported.cues.length }); }
      catch (e) { respond({ ok: false, error: e.message }); }
    }
  });
  window.addEventListener('message', e => {
    if (e.source !== window || e.origin !== location.origin) return;
    const data = e.data;
    if (data?.type === 'smart-subtitles-resource-request' && data.page === here() && typeof data.id === 'string' && data.id.length < 80 && globalThis.SubtitleSites.subtitleResource(data.url, location.href)) {
      const { id, page: requestedPage, url } = data;
      const reply = result => { if (requestedPage === here()) window.postMessage({ type: 'smart-subtitles-resource-result', id, page: requestedPage, ...result }, location.origin); };
      send({ type: 'subtitleResource', url }).then(reply, () => reply({ error: `Could not read the ${site.name} subtitle file` }));
      return;
    }
    if (data?.page !== here()) return;
    if (data.type === 'smart-subtitles-progress') {
      samePage();
      for (const key of ['metadata', 'manifests', 'found', 'pending', 'received']) capture[key] = Math.max(0, Math.min(40000, Number(data[key]) || 0));
    } else if (data.type === 'smart-subtitles-capture-error') captureError = String(data.error).slice(0, 200);
    else if (data.type === 'smart-subtitles-captured' && typeof data.text === 'string' && data.text.length <= 5_000_000) {
      samePage();
      const fingerprint = C.hash(data.text); if (tracks.some(t => t.fingerprint === fingerprint)) return;
      try {
        tracks.push(T.parse(data.text, data, parseXml));
        // Keep the list short without losing what the player declared: observed files go first.
        if (tracks.length > 12) tracks.splice(Math.max(0, tracks.findIndex(t => !t.declared)), 1);
        captureError = '';
      } catch (error) { captureError = error.message; }
    }
  });
  window.addEventListener('smart-subtitles-builtin-ready', () => { session.retry(); tick(); });
  document.addEventListener('fullscreenchange', render);
  window.addEventListener('pagehide', () => session.cancel());
  void loadSettings();
  const timer = setInterval(tick, 150);
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(frame);
  // Mark ready only after initialization succeeds, so a failed attach can retry.
  globalThis.__smartSubtitles = true;
})();
