#!/usr/bin/env node
/**
 * Builds every race's unit atlas from the art sources under `art/units/`:
 *
 *   art/units/races/<race>.mjs   a race variant (palette + rig modifiers)
 *   art/units/<unit>/index.mjs   a unit's art module (rig, clips, portrait)
 *
 * For each race file it renders every frame of every authored unit, trims
 * and packs them into `public/assets/units/<race>.png` and writes the
 * frame table to `<race>.json` in the atlas contract (`src/roster/atlas.ts`):
 * body frames `<sprite>/<clip>/<n>`, accent frames
 * `<sprite>/accent/<clip>/<n>`, `<sprite>/portrait`, and a one-pixel legacy
 * frame `<sprite>` for every unit not yet authored, so `check:roster`
 * keeps passing while the roster fills in. Rects are written the way the
 * engine's texture atlas loader reads them: y from the texture's bottom.
 * The ground shadow is not in the art — the renderer draws it under every
 * unit — so a frame's bottom row is the feet.
 *
 * Clip lengths and strike frames come from the roster through Vite's SSR
 * loader (the same source the game ships), so the art can never disagree
 * with the simulation. It also writes the review sheets under `docs/art/`.
 *
 * Usage: node scripts/build-unit-atlases.mjs [race …]   (default: every race file)
 */
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import { Canvas } from '../art/lib/raster.mjs';
import { encodePNG } from '../art/lib/png.mjs';
import { packFrames } from '../art/lib/pack.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const RACES_DIR = join(ROOT, 'art/units/races');
const OUT_DIR = join(ROOT, 'public/assets/units');
const DOCS_DIR = join(ROOT, 'docs/art');
const TEXTURE = 1024;
const SCALE = 4;

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
  const wanted = process.argv.slice(2);
  const raceFiles = readdirSync(RACES_DIR)
    .filter((f) => f.endsWith('.mjs'))
    .map((f) => f.replace(/\.mjs$/, ''))
    .filter((id) => wanted.length === 0 || wanted.includes(id))
    .sort();
  if (raceFiles.length === 0) throw new Error(`no race files in ${RACES_DIR}`);

  // Every unit art module: art/units/<name>/index.mjs (the races folder and lib are not units).
  const unitModules = [];
  for (const entry of readdirSync(join(ROOT, 'art/units'), { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'races') continue;
    const mod = await import(pathToFileURL(join(ROOT, 'art/units', entry.name, 'index.mjs')).href);
    unitModules.push(mod.default);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(DOCS_DIR, { recursive: true });
  const review = [];

  for (const raceId of raceFiles) {
    const variant = (await import(pathToFileURL(join(RACES_DIR, `${raceId}.mjs`)).href)).default;
    const frames = [];
    const sheetFrames = {};
    const peaks = [];
    for (const art of unitModules) {
      const specs = roster.requiredClips(art.unit);
      const missingRequired = specs.filter((c) => c.required && !art.clips.includes(c.name));
      if (missingRequired.length) throw new Error(`${art.sprite}: art omits required clip(s) ${missingRequired.map((c) => c.name).join(', ')}`);
      const unknown = art.clips.filter((name) => !specs.some((c) => c.name === name));
      if (unknown.length) throw new Error(`${art.sprite}: art names clip(s) the roster has not: ${unknown.join(', ')}`);
      for (const spec of specs) {
        if (!art.clips.includes(spec.name)) continue;
        if (spec.strike !== null && art.reach) {
          // The blow must land on the frame of furthest reach, whatever the variant's proportions and stance.
          const reach = Array.from({ length: spec.frames }, (_, n) => art.reach(variant, spec, n));
          const peak = reach.indexOf(Math.max(...reach));
          if (peak !== spec.strike) throw new Error(`${raceId} ${art.sprite}/${spec.name}: reach peaks on frame ${peak}, the roster strikes on ${spec.strike}`);
          peaks.push(`${spec.name} strike ${spec.strike} ✓`);
        }
        for (let n = 0; n < spec.frames; n++) {
          const { body, accent, pivot } = art.render(variant, spec, n);
          frames.push(trimmed(`${art.sprite}/${spec.name}/${n}`, body, pivot));
          frames.push(trimmed(`${art.sprite}/accent/${spec.name}/${n}`, accent, pivot));
          sheetFrames[`${art.sprite}/${spec.name}/${n}`] = { body, accent };
        }
      }
      const portrait = art.portrait(variant);
      frames.push({ key: `${art.sprite}/portrait`, canvas: portrait.canvas, pivot: portrait.pivot });
    }
    // One grey pixel block shared by every unit the art does not cover yet.
    const legacy = new Canvas(4, 4);
    legacy.fillPolygon([[0, 0], [4, 0], [4, 4], [0, 4]], [0.75, 0.75, 0.75, 1]);
    frames.push({ key: '__legacy', canvas: legacy, pivot: [2, 4] });

    const packed = packFrames(frames, TEXTURE, TEXTURE);
    const height = Math.min(TEXTURE, Math.ceil(packed.height / 4) * 4);
    const atlas = new Canvas(TEXTURE, height);
    const table = {};
    const drawn = new Set();
    for (const [key, p] of packed.placed) {
      if (key === '__legacy') continue;
      const rectKey = p.rect.join(',');
      if (!drawn.has(rectKey)) {
        atlas.blit(p.canvas, p.rect[0], p.rect[1]);
        drawn.add(rectKey);
      }
      // The engine's convention: rect y from the texture's bottom, pivot y from the frame's bottom.
      table[key] = { rect: bottomLeft(p.rect, height), pivot: [round3(p.pivot[0]), round3(1 - p.pivot[1])], border: [0, 0, 0, 0] };
    }
    const legacyRect = packed.placed.get('__legacy').rect;
    atlas.blit(legacy, legacyRect[0], legacyRect[1]);
    const authored = new Set(unitModules.map((m) => m.sprite));
    for (const unit of roster.UNIT_IDS) {
      const sprite = roster.UNITS[unit].sprite;
      if (authored.has(sprite)) continue;
      table[sprite] = { rect: bottomLeft([legacyRect[0] + 1, legacyRect[1] + 1, 1, 1], height), pivot: [0.5, 0], border: [0, 0, 0, 0] };
    }

    const json = {
      texture: `${raceId}.png`,
      // Mipmapped minification: the 8 px gutter keeps neighbours out of the first three levels.
      minfilter: 'linear_mip_linear',
      magfilter: 'linear',
      mipmaps: true,
      meta: { scale: SCALE, size: [TEXTURE, height], origin: 'bottom-left', contract: roster.ATLAS_CONTRACT, generator: 'scripts/build-unit-atlases.mjs' },
      frames: table,
    };
    writeFileSync(join(OUT_DIR, `${raceId}.png`), encodePNG(atlas.width, atlas.height, atlas.toRGBA8()));
    writeFileSync(join(OUT_DIR, `${raceId}.json`), `${JSON.stringify(json, null, 1)}\n`);
    const fill = [...new Set([...packed.placed.values()].map((p) => p.rect.join(',')))].reduce((n, r) => n + r.split(',')[2] * r.split(',')[3], 0);
    console.log(`build-unit-atlases: ${raceId} — ${Object.keys(table).length} frames (${packed.unique} unique) in ${TEXTURE}×${height}, ${Math.round((100 * fill) / (TEXTURE * height))}% filled; ${peaks.join(', ')}`);
    review.push({ raceId, variant, sheetFrames, portrait: packed.placed.get(`${unitModules[0].sprite}/portrait`).canvas });
  }

  writeReviewSheets(review, unitModules[0]);
} catch (err) {
  console.error('build-unit-atlases: failed');
  console.error(err);
  exitCode = 1;
} finally {
  await server.close();
}
process.exit(exitCode);

function trimmed(key, canvas, pivot) {
  const b = canvas.bounds() ?? { x: Math.round(pivot[0]), y: Math.round(pivot[1]) - 1, w: 1, h: 1 };
  return { key, canvas: canvas.crop(b.x, b.y, b.w, b.h), pivot: [pivot[0] - b.x, pivot[1] - b.y] };
}

function round3(v) {
  return Math.round(v * 1000) / 1000;
}

/** A top-left packed rect as the engine reads it: y measured from the texture's bottom. */
function bottomLeft([x, y, w, h], textureHeight) {
  return [x, textureHeight - y - h, w, h];
}

/**
 * Review sheets: a colour contact sheet at 2× (key frames of every clip per
 * race), the six at-rest silhouettes at 1× with no colour (the identification
 * check), the same blown up 4× for reading on a screen, and the portraits.
 */
function writeReviewSheets(review, art) {
  if (review.length === 0) return;
  const picks = ['ready/0', 'walk/0', 'walk/3', 'walk/6', 'walk/9', 'swipe-1/2', 'swipe-1/4', 'swipe-1/9', 'swipe-2/4', 'swipe-3/4', 'death/3', 'death/7'];
  const cell = { w: 232, h: 196 };
  const sheet = new Canvas(cell.w * picks.length, cell.h * review.length);
  fill(sheet, [0.93, 0.93, 0.9, 1]);
  review.forEach((r, row) => {
    picks.forEach((pick, col) => {
      const f = r.sheetFrames[`${art.sprite}/${pick}`];
      if (!f) return;
      sheet.blit(f.body, col * cell.w, row * cell.h);
      sheet.blit(f.accent.silhouette([1, 1, 1]), col * cell.w, row * cell.h);
    });
  });
  const half = sheet.downsample(2);
  writeFileSync(join(DOCS_DIR, `${art.sprite}-sheet.png`), encodePNG(half.width, half.height, half.toRGBA8()));

  // Silhouettes at 1×: each race's ready/0 body (no accent, no colour) on white, feet on one baseline.
  const slot = 48;
  const sil = new Canvas(slot * review.length, 48);
  fill(sil, [1, 1, 1, 1]);
  review.forEach((r, i) => {
    const body = r.sheetFrames[`${art.sprite}/ready/0`].body;
    const small = body.silhouette([0, 0, 0]).downsample(SCALE);
    // The authoring canvas's centre x and baseline, at 1×.
    sil.blit(small, i * slot + slot / 2 - Math.round(232 / SCALE / 2), 44 - Math.round(170 / SCALE));
  });
  writeFileSync(join(DOCS_DIR, `${art.sprite}-silhouettes-1x.png`), encodePNG(sil.width, sil.height, sil.toRGBA8()));
  const zoom = nearest(sil, 6);
  writeFileSync(join(DOCS_DIR, `${art.sprite}-silhouettes-1x-zoom.png`), encodePNG(zoom.width, zoom.height, zoom.toRGBA8()));

  // Portraits at 4× and at the 18 px rack size.
  const ps = 96;
  const portraits = new Canvas(ps * review.length, ps + 24);
  fill(portraits, [0.2, 0.2, 0.22, 1]);
  review.forEach((r, i) => {
    portraits.blit(r.portrait, i * ps, 0);
    const tiny = r.portrait.downsample(Math.round(ps / 18));
    portraits.blit(tiny, i * ps + 4, ps + 3);
  });
  writeFileSync(join(DOCS_DIR, `${art.sprite}-portraits.png`), encodePNG(portraits.width, portraits.height, portraits.toRGBA8()));
}

function fill(canvas, [r, g, b, a]) {
  for (let i = 0; i < canvas.data.length; i += 4) {
    canvas.data[i] = r * a;
    canvas.data[i + 1] = g * a;
    canvas.data[i + 2] = b * a;
    canvas.data[i + 3] = a;
  }
}

function nearest(canvas, k) {
  const out = new Canvas(canvas.width * k, canvas.height * k);
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const s = ((y / k | 0) * canvas.width + (x / k | 0)) * 4;
      const d = (y * out.width + x) * 4;
      out.data[d] = canvas.data[s];
      out.data[d + 1] = canvas.data[s + 1];
      out.data[d + 2] = canvas.data[s + 2];
      out.data[d + 3] = canvas.data[s + 3];
    }
  }
  return out;
}
