import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

// An explicit release inventory prevents local files and native helpers entering the ZIP.
const files = new Set(`THIRD_PARTY_LICENSE.txt async.js auth-callback.html auth-callback.js background.js builtin.js cache.js capture.js chatgpt-connection.js chatgpt-permissions.js chatgpt-runtime.html chatgpt-runtime.js chatgpt-worker.js content.js core.js icon.svg icons/icon-128.png icons/icon-16.png icons/icon-32.png icons/icon-48.png languages.js legal.html manifest.json network.js overlay.js players/disney.js players/hulu.js popup-player.js popup.css popup.html popup.js probe.js profiles.js session.js settings.css settings.html settings.js site.js sites.js subtitle-resource.js tracks.js vault.js translation.js ttml.js`.split(' '));
const hosts = ['https://*.hulu.com/*', 'https://hulu.com/*', 'https://*.disneyplus.com/*', 'https://disneyplus.com/*', 'https://*.dssott.com/*', 'https://*.dssedge.com/*'];
export async function checkExtensionSecurity(directory) {
  const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual([...manifest.permissions].sort(), ['storage', 'scripting', 'offscreen', 'alarms', 'declarativeNetRequestWithHostAccess'].sort(), 'Review any change to release permissions');
  assert.deepEqual([...(manifest.host_permissions || [])].sort(), [...hosts].sort(), 'No development or unrestricted hosts in the release');
  assert.ok(!manifest.externally_connectable && !manifest.update_url && !manifest.sandbox, 'No external messaging, private updater, or sandboxed remote code');
  assert.ok(!manifest.optional_permissions?.length);
  assert.deepEqual([...(manifest.optional_host_permissions || [])].sort(), ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'].sort());
  for (const script of manifest.content_scripts) assert.ok(script.matches.every(host => hosts.slice(0, 4).includes(host)), 'Content scripts must stay on supported video sites');
  assert.deepEqual(manifest.web_accessible_resources, [{ resources: ['auth-callback.html'], matches: ['https://auth.openai.com/*', 'http://127.0.0.1/*'] }]);
  const csp = manifest.content_security_policy?.extension_pages || '';
  assert.deepEqual(csp.split(';').map(s => s.trim()).filter(s => s.startsWith('connect-src')), ['connect-src https: http://localhost:* http://127.0.0.1:*'], 'Connection policy must use browser-supported sources and restrict HTTP to loopback');
  for (const rule of ["default-src 'none'", "script-src 'self'", "worker-src 'self'", "object-src 'none'", "base-uri 'none'", "frame-src 'none'", "form-action 'none'"]) assert.ok(csp.split(';').map(s => s.trim()).includes(rule), `Missing security policy: ${rule}`);
  assert.doesNotMatch(csp, /unsafe-eval|wasm-unsafe-eval/);
  const actual = new Set();
  for (const entry of await readdir(directory, { recursive: true })) {
    if (!(await stat(path.join(directory, entry))).isFile()) continue;
    const name = entry.replaceAll('\\', '/');
    assert.ok(files.has(name), `Unreviewed release file: ${name}`); actual.add(name);
    if (!/\.(?:js|html)$/.test(name)) continue;
    const source = await readFile(path.join(directory, entry), 'utf8');
    assert.doesNotMatch(source, /\beval\s*\(|new\s+Function\s*\(|(?:import|importScripts)\s*\(\s*['"]https?:|<script\b[^>]*src=['"]https?:/i, `Remote or dynamically evaluated code in ${name}`);
    assert.doesNotMatch(source, /testFetch|__testPlayback|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/, `Test transport or private material in ${name}`);
  }
  assert.deepEqual(actual, files, 'Release assets must match the reviewed inventory');
}
