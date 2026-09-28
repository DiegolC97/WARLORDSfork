#!/usr/bin/env node
/**
 * Fails when a user-visible working name (game title, race names) appears
 * anywhere outside the single naming file. Run by `npm run build` and CI.
 *
 * The names are read from the naming file itself, so adding a name there
 * automatically extends the check.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const NAMING_FILE = 'src/names/displayNames.ts';
const SCAN_ROOTS = ['src', 'public', 'index.html'];
const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp3', '.ogg', '.woff', '.woff2', '.ttf']);

const naming = readFileSync(join(ROOT, NAMING_FILE), 'utf8');

// Pull the primary title line, the leading line and every race name out of the naming file.
const titleLeading = /leading:\s*'([^']+)'/.exec(naming)?.[1];
const titlePrimary = /primary:\s*'([^']+)'/.exec(naming)?.[1];
const raceBlock = /RACE_NAMES[^=]*=\s*\{([\s\S]*?)\};/.exec(naming)?.[1] ?? '';
const raceNames = [...raceBlock.matchAll(/race\d+:\s*'([^']+)'/g)].map((m) => m[1]);

const forbidden = [titlePrimary, `${titleLeading} ${titlePrimary}`, ...raceNames]
  .filter(Boolean)
  // "Empire", "Dwarfs" etc. Match whole words, case-insensitive; also the singular for plurals.
  .flatMap((n) => [n, n.endsWith('s') ? n.slice(0, -1) : null].filter(Boolean));

if (forbidden.length < 7) {
  console.error(`check-names: could not parse names from ${NAMING_FILE} (found ${forbidden.length})`);
  process.exit(2);
}

const patterns = forbidden.map((n) => ({
  name: n,
  re: new RegExp(`(^|[^a-z])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i'),
}));

function* walk(path) {
  const st = statSync(path);
  if (st.isDirectory()) {
    for (const entry of readdirSync(path)) yield* walk(join(path, entry));
  } else {
    yield path;
  }
}

const hits = [];
for (const root of SCAN_ROOTS) {
  for (const file of walk(join(ROOT, root))) {
    const rel = relative(ROOT, file);
    if (rel === NAMING_FILE) continue;
    if (SKIP_EXT.has(rel.slice(rel.lastIndexOf('.')))) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const { name, re } of patterns) {
        if (re.test(line)) hits.push(`${rel}:${i + 1}: "${name}" — ${line.trim()}`);
      }
    });
  }
}

if (hits.length) {
  console.error(`check-names: working names must live only in ${NAMING_FILE}. Found:\n  ${hits.join('\n  ')}`);
  process.exit(1);
}
console.log(`check-names: ok — ${forbidden.length} names checked, none outside ${NAMING_FILE}`);
