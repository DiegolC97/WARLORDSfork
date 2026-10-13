#!/usr/bin/env node
/**
 * Fails the build when the roster definition (src/roster/data.ts) is
 * internally inconsistent: an exclusive owned by no race or by two, a unit
 * without a per-race name, a strike frame beyond its clip, or an atlas
 * reference that does not exist under public/. Run by `npm run build` and CI.
 *
 * The TypeScript definition is loaded through Vite's SSR module loader so the
 * check reads the same source the game ships, with no second copy.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';

const ROOT = new URL('..', import.meta.url).pathname;

const server = await createServer({
  root: ROOT,
  configFile: join(ROOT, 'vite.config.ts'),
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});

let exitCode = 0;
try {
  const roster = await server.ssrLoadModule('/src/roster/index.ts');

  // Frame names of every atlas the definition references, read from public/.
  const atlases = {};
  for (const url of roster.referencedAtlases()) {
    const file = join(ROOT, 'public', url);
    if (!existsSync(file)) continue;
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    atlases[url] = Object.keys(parsed.frames ?? {});
  }

  const errors = roster.validateRoster(roster.ROSTER, atlases);
  if (errors.length) {
    console.error(`check-roster: the roster definition is inconsistent (${errors.length} error${errors.length === 1 ? '' : 's'}):`);
    for (const e of errors) console.error(`  ${e.message}`);
    exitCode = 1;
  } else {
    const units = roster.UNIT_IDS.length;
    const races = roster.definedRaces().length;
    console.log(`check-roster: ok — ${units} units × ${races} races, ${Object.keys(atlases).length} atlas(es) present`);
  }
} catch (err) {
  console.error('check-roster: could not load the roster definition');
  console.error(err);
  exitCode = 2;
} finally {
  await server.close();
}
process.exit(exitCode);
