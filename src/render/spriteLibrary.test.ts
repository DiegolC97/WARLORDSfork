/**
 * The sprite library resolves by unit plus race only: the same clip set,
 * frame counts and frame keys for a unit from every race's atlas, sized in
 * field units, differing only in the texture sampled (AC 4).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as pc from 'playcanvas';
import { HeadlessEngineHost, textureAtlasFromDocument } from '../engine/headlessHost';
import { ATLAS_SCALE, BLOC_RACES, RACE_DEFINITIONS, requiredClips, type AtlasDocument, type RaceId } from '../roster';
import { BATTLEFIELD_SCALE } from './scale';
import { ATLAS_PIXELS_PER_FIELD_UNIT, SpriteLibrary } from './spriteLibrary';
import { createFlatSprites } from './textures';

const SPEARMAN = 0;
const atlasDoc = (race: RaceId): AtlasDocument => JSON.parse(readFileSync(join(process.cwd(), 'public', RACE_DEFINITIONS[race].atlas), 'utf8')) as AtlasDocument;

describe('the sprite library', () => {
  const host = new HeadlessEngineHost();
  const atlases = Object.fromEntries(BLOC_RACES.map((race) => [race, textureAtlasFromDocument(host.device, atlasDoc(race))])) as Record<RaceId, pc.TextureAtlas>;
  const library = new SpriteLibrary(host.device, atlases);

  it('measures atlas pixels in field units through the render constant: 4× over 0.2458', () => {
    expect(ATLAS_PIXELS_PER_FIELD_UNIT).toBeCloseTo(ATLAS_SCALE * BATTLEFIELD_SCALE, 12);
    // A 138 px tall frame is 140 field units, 34.5 px at zoom 1.
    expect((138 / ATLAS_PIXELS_PER_FIELD_UNIT) * BATTLEFIELD_SCALE).toBeCloseTo(138 / ATLAS_SCALE, 9);
  });

  it.each(BLOC_RACES)('%s: builds one sprite per contract clip for the Spearman, frame keys from the contract, in field units', (race) => {
    const set = library.spriteSet(race, SPEARMAN)!;
    expect(set).not.toBeNull();
    const expected = requiredClips(SPEARMAN).filter((c) => c.name !== 'swipe-4');
    expect([...set.clips.keys()]).toEqual(expected.map((c) => c.name));
    expect([...set.accents.keys()]).toEqual(expected.map((c) => c.name));
    for (const spec of expected) {
      const sprite = set.clips.get(spec.name)!;
      expect(sprite.frameKeys).toEqual(Array.from({ length: spec.frames }, (_, n) => `spearman/${spec.name}/${n}`));
      expect(sprite.meshes).toHaveLength(spec.frames);
      expect(sprite.pixelsPerUnit).toBe(ATLAS_PIXELS_PER_FIELD_UNIT);
      expect(sprite.atlas).toBe(atlases[race]);
      if (spec.strike !== null) expect(sprite.frameKeys[spec.strike]).toBe(`spearman/${spec.name}/${spec.strike}`);
    }
    // A unit stands roughly a lane tall: 100–160 field units (25–40 px at zoom 1).
    expect(set.height).toBeGreaterThan(90);
    expect(set.height).toBeLessThan(170);
    expect(set.footprint).toBeGreaterThan(40);
    // A unit without art has no set.
    expect(library.spriteSet(race, 1)).toBeNull();
    expect(library.hasSpriteSet(race, SPEARMAN)).toBe(true);
    expect(library.hasSpriteSet(race, 1)).toBe(false);
  });

  it('resolves the same clip and frame for every race, differing only in the texture (AC 4)', () => {
    const ticks: [string, number][] = [
      ['walk', 7],
      ['swipe-2', 4],
      ['swipe-4', 7],
      ['death', 300],
    ];
    for (const [clip, frame] of ticks) {
      const resolved = BLOC_RACES.map((race) => library.resolve(race, SPEARMAN, clip as never, frame)!);
      for (const r of resolved) expect(r).toEqual(resolved[0]);
    }
    const race1 = library.spriteSet('race1', SPEARMAN)!.clips.get('walk')!;
    const race4 = library.spriteSet('race4', SPEARMAN)!.clips.get('walk')!;
    expect(race1.frameKeys).toEqual(race4.frameKeys);
    expect(race1.atlas.texture).not.toBe(race4.atlas.texture);
    expect(race1.atlas.texture.name).toBe('race1.png');
    expect(race4.atlas.texture.name).toBe('race4.png');
  });

  it('builds a set once per race and unit, and nothing for a race with no atlas', () => {
    const partial = new SpriteLibrary(host.device, { race1: atlases.race1 });
    expect(partial.spriteSet('race1', SPEARMAN)).toBe(partial.spriteSet('race1', SPEARMAN));
    expect(partial.spriteSet('race2', SPEARMAN)).toBeNull();
    expect(partial.resolve('race2', SPEARMAN, 'walk', 0)).toBeNull();
    expect(partial.builtSets).toBe(1);
    partial.destroy();
    expect(partial.builtSets).toBe(0);
  });
});

describe('flat sprites', () => {
  it('generate a unit quad, a standing quad and a shadow ellipse, each one field unit across', () => {
    const host = new HeadlessEngineHost();
    const flat = createFlatSprites(host.device);
    for (const s of [flat.quad, flat.quadStanding, flat.shadow]) {
      expect(s.meshes).toHaveLength(1);
      expect(s.meshes[0]!.aabb.halfExtents.x).toBeCloseTo(0.5, 6);
    }
    expect(flat.quad.meshes[0]!.aabb.center.y).toBeCloseTo(0, 6);
    expect(flat.quadStanding.meshes[0]!.aabb.center.y).toBeCloseTo(0.5, 6);
    expect(flat.shadow.meshes[0]!.aabb.halfExtents.y).toBeCloseTo(0.25, 6);
    // The shadow is opaque at its centre and transparent at its corners.
    const data = flat.shadow.atlas.texture.lock() as Uint8Array;
    const w = flat.shadow.atlas.texture.width;
    const h = flat.shadow.atlas.texture.height;
    expect(data[((h / 2) * w + w / 2) * 4 + 3]).toBe(255);
    expect(data[3]).toBe(0);
    flat.shadow.atlas.texture.unlock();
    flat.destroy();
    host.destroy();
  });
});
