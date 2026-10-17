// Writes the parts of extension/manifest.json that follow from the service registry
// (extension/sites.js): where the content scripts run, which scripts they are and which hosts the
// extension may reach. Run `npm run manifest` after changing the registry; a test fails while the
// two disagree. Everything else in the manifest is edited by hand.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import '../extension/sites.js';

export function siteManifest(manifest, sites = globalThis.SubtitleSites) {
  const worlds = [
    { js: sites.captureScripts, run_at: 'document_start', world: 'MAIN' },
    { js: sites.pageScripts, run_at: 'document_idle' },
  ];
  return {
    ...manifest,
    // API access is granted only when the viewer selects and configures a provider.
    host_permissions: [...new Set([...sites.matches, ...sites.resourcePatterns])],
    content_scripts: worlds.map(({ js, run_at, world }) => ({ matches: [...sites.matches], js: [...js], run_at, ...(world ? { world } : {}), all_frames: true })),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = new URL('../extension/manifest.json', import.meta.url);
  const next = JSON.stringify(siteManifest(JSON.parse(await readFile(file, 'utf8'))), null, 2) + '\n';
  await writeFile(file, next);
  console.log(`extension/manifest.json: ${globalThis.SubtitleSites.names.join(', ')}`);
}
