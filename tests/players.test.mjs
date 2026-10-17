import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, readdir } from 'node:fs/promises';
import '../extension/sites.js';
import '../extension/core.js';
import { PAGE_SCRIPTS } from '../extension/popup-player.js';
import { siteManifest } from '../scripts/manifest.mjs';
const read = file => readFile(new URL('../extension/' + file, import.meta.url), 'utf8');
const manifest = JSON.parse(await read('manifest.json'));
const adapterFiles = (await readdir(new URL('../extension/players', import.meta.url))).filter(f => f.endsWith('.js')).map(f => 'players/' + f);
const CONTRACT = ['isWatchPage', 'episodeKey', 'contentVideo', 'overlayParent', 'adBreak', 'timelineSeconds', 'titleSeconds', 'subtitleTime', 'awaitingClock', 'clockState'];
const Sites = globalThis.SubtitleSites;
// Every registered service is checked on its own sample playback page.
const pages = Object.fromEntries(Sites.services.map(s => [s.id, s.sample]));

test('every player adapter is loaded, in one order, wherever the page scripts are listed', () => {
  const isolated = manifest.content_scripts.find(s => s.world !== 'MAIN').js;
  assert.deepEqual(isolated, PAGE_SCRIPTS, 'the manifest and the popup\'s re-injection list are the same');
  for (const file of adapterFiles) assert.ok(isolated.includes(file), `${file} is listed`);
  assert.ok(isolated.indexOf('site.js') < Math.min(...adapterFiles.map(f => isolated.indexOf(f))), 'the contract loads before its adapters');
  assert.ok(isolated.indexOf('content.js') === isolated.length - 1);
});

test('the manifest is what the service registry says (npm run manifest)', () => {
  assert.deepEqual(manifest, siteManifest(manifest));
  assert.deepEqual(adapterFiles.sort(), Sites.services.filter(s => s.adapter !== false).map(s => `players/${s.id}.js`).sort(), 'one adapter file per registered service');
  for (const s of Sites.services) {
    assert.match(s.id, /^[a-z0-9]+$/); assert.equal(Sites.identify(s.sample), s.id); assert.equal(Sites.watching(s.sample), true, `${s.id} sample is a playback page`);
    assert.ok(s.patterns.every(p => manifest.host_permissions.includes(p)), `${s.id} hosts are permitted`);
  }
  // No service may fetch another one's subtitle files, and nothing but subtitle files.
  assert.equal(Sites.subtitleResource('https://cdn.dssott.com/a/b.vtt', 'https://www.disneyplus.com/play/abc'), true);
  assert.equal(Sites.subtitleResource('https://cdn.dssott.com/a/b.vtt', 'https://www.hulu.com/watch/abc'), false);
  assert.equal(Sites.subtitleResource('https://cdn.dssott.com/a/b.mp4', 'https://www.disneyplus.com/play/abc'), false);
  assert.equal(Sites.subtitleResource('https://evil.example/a.vtt'), false);
});

test('every supported service has an adapter that answers the whole contract on its playback page', async () => {
  const code = (await Promise.all(['site.js', ...adapterFiles].map(read))).join('\n');
  const seen = new Set();
  for (const [id, href] of Object.entries(pages)) {
    assert.equal(globalThis.SubtitleSites.identify(href), id);
    const context = vm.createContext({ SubtitleSites: globalThis.SubtitleSites, SubtitleCore: globalThis.SubtitleCore, location: new URL(href), Date,
      document: { body: {}, fullscreenElement: null, querySelector: () => null, querySelectorAll: () => [] }, getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }) });
    vm.runInContext(code, context);
    const site = context.SubtitleSite; seen.add(site.id);
    assert.equal(site.id, id); assert.equal(typeof site.name, 'string'); assert.match(site.clockPolicy, /^[a-z0-9-]+-v\d+$/);
    for (const method of CONTRACT) assert.equal(typeof site[method], 'function', `${id}.${method}`);
    const video = { id: 'v', currentTime: 12.5, duration: 600, paused: false, seeking: false, getBoundingClientRect: () => ({ width: 800, height: 450 }) };
    assert.equal(site.isWatchPage(), true); assert.equal(site.episodeKey(), Sites.pageKey(href)); assert.match(site.lengthFrom, /^(player|track)$/); assert.ok(site.captionLinger >= 0 && site.captionLinger < 3, `${id}.captionLinger`); assert.equal(site.adBreak(), false);
    assert.equal(site.contentVideo(), undefined, 'no video on an empty page');
    const time = site.subtitleTime(video, 0); assert.ok(Number.isNaN(time) || typeof time === 'number');
    assert.equal(typeof site.awaitingClock(video), 'boolean'); assert.equal(typeof site.clockState(video), 'object');
    assert.ok(site.titleSeconds(video, { duration: 600, cues: [] }) >= 0);
    video.seeking = true; assert.ok(Number.isNaN(site.subtitleTime(video, 0)), `${id} shows nothing during a seek`);
  }
  // Every service named to users is one the code can play, and has its host in the manifest.
  assert.deepEqual([...seen].sort(), Sites.services.map(s => s.id).sort());
  assert.equal(Sites.names.length, Sites.services.filter(s => !s.development).length);
  const hosts = manifest.content_scripts.flatMap(s => s.matches).join(' ');
  for (const pattern of globalThis.SubtitleSites.matches) assert.ok(hosts.includes(pattern), pattern);
});
