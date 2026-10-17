/**
 * AC 9: with all six Spearman atlases loaded, a full battle renders at a
 * steady 24 ticks per second — the renderer's work per tick is a small
 * fraction of a frame, and the whole battle samples only one texture per
 * side, so nothing is ever swapped mid-battle.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as pc from 'playcanvas';
import { BATTLE_LENGTH_FRAMES, FRAMES_PER_SECOND, createBattle } from '../battle';
import { HeadlessEngineHost, textureAtlasFromDocument } from '../engine/headlessHost';
import { BLOC_RACES, RACE_DEFINITIONS, raceVisuals, type AtlasDocument, type RaceId } from '../roster';
import { createFieldView } from './fieldView';
import { SpriteLibrary } from './spriteLibrary';
import { createUnitLayer } from './unitLayer';

const SPEARMAN = 0;
const atlasDoc = (race: RaceId): AtlasDocument => JSON.parse(readFileSync(join(process.cwd(), 'public', RACE_DEFINITIONS[race].atlas), 'utf8')) as AtlasDocument;

describe('a full battle at 24 ticks per second (AC 9)', () => {
  it('renders every tick of a five-minute Spearman battle in a fraction of a frame, sampling one texture per side', () => {
    const host = new HeadlessEngineHost();
    const atlases = Object.fromEntries(BLOC_RACES.map((race) => [race, textureAtlasFromDocument(host.device, atlasDoc(race))])) as Record<RaceId, pc.TextureAtlas>;
    const library = new SpriteLibrary(host.device, atlases);
    const root = host.createSceneRoot('screen:battle');
    const view = createFieldView(host.app, root, 1);
    const races = { left: 'race3' as RaceId, right: 'race5' as RaceId };
    const units = createUnitLayer({ app: host.app, root, library, flat: view.flat, races, tints: { left: raceVisuals(races.left).tint, right: raceVisuals(races.right).tint } });
    const sim = createBattle({
      left: { race: races.left, army: [SPEARMAN], control: 'human' },
      right: { race: races.right, army: [SPEARMAN], control: 'human' },
      seed: 42,
      lengthFrames: BATTLE_LENGTH_FRAMES,
    });

    const frameBudgetMs = 1000 / FRAMES_PER_SECOND;
    const timings: number[] = [];
    let total = 0;
    let ticks = 0;
    let peakUnits = 0;
    const textures = new Set<pc.Texture>();
    while (sim.snapshot().winner === null && ticks < BATTLE_LENGTH_FRAMES) {
      const s = sim.snapshot();
      for (const side of ['left', 'right'] as const) if (s.spawners[side].canRelease) sim.command(side, 'release');
      sim.tick();
      const frame = sim.snapshot();
      const started = performance.now();
      units.update(frame);
      host.tick(1);
      const took = performance.now() - started;
      timings.push(took);
      total += took;
      ticks++;
      peakUnits = Math.max(peakUnits, frame.units.length);
      if (ticks % 240 === 0) {
        for (const sprite of units.sprites().values()) if (!sprite.placeholder) textures.add(sprite.body.sprite.atlas.texture);
      }
    }
    expect(ticks).toBeGreaterThan(1000);
    expect(peakUnits).toBeGreaterThan(10);
    const average = total / ticks;
    // The renderer's update plus a headless engine frame: well inside the 41.7 ms a tick has, on average and for
    // 99 ticks in 100 (the last percentile is left to the test runner's garbage collector and parallel workers).
    const sorted = [...timings].sort((a, b) => a - b);
    const p99 = sorted[Math.floor(sorted.length * 0.99)]!;
    expect(average).toBeLessThan(frameBudgetMs / 4);
    expect(p99).toBeLessThan(frameBudgetMs);
    // Both sides' units sample their own race's texture and nothing else: two textures for the whole battle.
    expect(textures.size).toBe(2);
    expect([...textures].map((t) => t.name).sort()).toEqual(['race3.png', 'race5.png']);
    // The six atlases stayed loaded; nothing was rebuilt per tick.
    expect(Object.keys(atlases)).toHaveLength(6);
    expect(library.builtSets).toBe(2);
    units.destroy();
    view.destroy();
    library.destroy();
    host.destroy();
  }, 120000);
});
