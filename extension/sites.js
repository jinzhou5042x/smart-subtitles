// The service registry: the one list of streaming services this product works on.
//
// Everything that has to know which services exist reads it from here: the manifest (generated
// by scripts/manifest.mjs), the page scripts and their order, the popup, the background worker's
// sender checks, subtitle discovery in the page world, and the tests. Nothing else names a host.
// It is loaded in every script world and by Node, so it holds only facts that follow from a URL;
// what a service's player does on the page belongs to its adapter in players/<id>.js (site.js).
//
// A service:
//   id, name        `name` is shown to users; the adapter is players/<id>.js
//   hosts           its sites, as registrable domains (subdomains included, https only)
//   sample          a playback URL, for the contract tests
//   watch(url)      is this URL a playback page; left out: every page of the service
//   key(url)        identifies the title on screen; left out: the path. A service that keeps the
//                   title in the query string must say so here, or every title looks the same
//   resourceHosts   CDN domains whose subtitle files the extension may fetch for the page when
//                   the page itself is refused (no CORS header); no cookies, no redirects
//   capture         { subtitle, metadata }: RegExps for subtitle files and playback metadata
//                   whose URLs the general rules in capture.js do not recognise
//   development     the local test clip; never named to users, never packaged for the store
(function (scope) {
  const domain = (host, root) => host === root || host.endsWith('.' + root);
  const SUBTITLE_FILE = /\.(m3u8|vtt|webvtt|ttml|dfxp|srt)$/i;
  const services = [
    // Episodes play on /watch/<id>. Autoplay of the next episode moves to a new path.
    { id: 'hulu', name: 'Hulu', hosts: ['hulu.com'], sample: 'https://www.hulu.com/watch/abc',
      watch: url => url.pathname.startsWith('/watch/') },
    { id: 'disney', name: 'Disney+', hosts: ['disneyplus.com'], sample: 'https://www.disneyplus.com/play/abc',
      watch: url => /^\/(?:[a-z]{2}(?:-[a-z]{2,4})?\/)?(?:play|video)\/[^/]+\/?$/i.test(url.pathname),
      // Only public subtitle/manifest CDN hosts; never an account, license or media endpoint.
      resourceHosts: ['dssott.com', 'dssedge.com'] },
    // The local test clip, played by the plain html5 behaviour in site.js (no adapter file).
    { id: 'demo', name: 'Video', development: true, adapter: false, sample: 'http://127.0.0.1:43127/demo',
      patterns: ['http://127.0.0.1/*'], owns: url => url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.pathname === '/demo' },
  ].map(service => Object.freeze({
    patterns: (service.hosts || []).flatMap(host => [`https://*.${host}/*`, `https://${host}/*`]),
    owns: url => url.protocol === 'https:' && (service.hosts || []).some(host => domain(url.hostname, host)),
    ...service,
  }));
  const parse = value => { try { return new URL(value); } catch { return null; } };
  const service = value => { const url = parse(value); return (url && services.find(s => s.owns(url))) || null; };
  const adapters = services.filter(service => service.adapter !== false).map(service => `players/${service.id}.js`);
  scope.SubtitleSites = Object.freeze({
    services,
    // Shown where the product says what it works on; the product name itself names no service.
    names: services.filter(service => !service.development).map(service => service.name),
    matches: services.flatMap(service => service.patterns),
    resourcePatterns: services.flatMap(service => (service.resourceHosts || []).map(host => `https://*.${host}/*`)),
    // The scripts of each world, in loading order; the manifest and the popup's re-injection use these.
    captureScripts: ['sites.js', 'capture.js'],
    pageScripts: ['sites.js', 'core.js', 'ttml.js', 'site.js', ...adapters, 'tracks.js', 'builtin.js', 'session.js', 'overlay.js', 'probe.js', 'content.js'],
    service,
    identify: value => service(value)?.id || null,
    watching(value) { const url = parse(value), found = service(value); return !!found && (!found.watch || found.watch(url)); },
    pageKey(value) { const url = parse(value), found = service(value); return url ? (found?.key ? found.key(url) : url.pathname) : ''; },
    // Is `value` a subtitle file the extension may fetch: for the service of `page`, or without
    // one, for any service.
    subtitleResource(value, page) {
      const url = parse(value), owners = page === undefined ? services : [service(page)].filter(Boolean);
      return !!url && url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443') &&
        owners.some(owner => (owner.resourceHosts || []).some(host => domain(url.hostname, host))) && SUBTITLE_FILE.test(url.pathname);
    },
  });
})(globalThis);
