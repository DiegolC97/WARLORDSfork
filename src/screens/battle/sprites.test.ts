/**
 * The art pipeline proof: the six shipped Spearman atlases against the
 * renderer. Contract validation and texture bounds, a recorded replay
 * resolved through every atlas with the strike on frame 4, the screen
 * drawing exactly the frame the simulation reports, the accent layer
 * telling same-race sides apart, feet on one baseline for every race, and
 * the portrait crop reaching both racks.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, type App } from '../../app';
import type { AssetBackend, AssetSpec } from '../../assets/loader';
import { battleHandle, createBattle, type BattleHandle, type ClipName, type Side } from '../../battle';
import { BLOCS, PLAYER_OWNER, REGION_IDS, type RegionOwners } from '../../campaign';
import { NullEngineHost } from '../../engine/nullHost';
import {
  ATLAS_SCALE,
  BLOC_RACES,
  RACE_DEFINITIONS,
  contractProblems,
  hasSpriteSet,
  portraitKey,
  raceVisuals,
  requiredClips,
  resolveFrame,
  type AtlasDocument,
  type BlocRaceId,
  type RaceId,
} from '../../roster';
import { MemoryStorage, SaveStore, defaultSave, type CampaignSave } from '../../save';
import { laneY } from './layout';

const SPEARMAN = 0;
const TEXTURE_LIMIT = 1024;

/** The atlas json a race ships, read from public/ as the build check and the loader do. */
const atlasOf = (race: RaceId): AtlasDocument => JSON.parse(readFileSync(join(process.cwd(), 'public', RACE_DEFINITIONS[race].atlas), 'utf8')) as AtlasDocument;

/** Width and height from a PNG's IHDR chunk. */
const pngSize = (file: string): [number, number] => {
  const bytes = readFileSync(file);
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
};

/** mulberry32, so the screen-level battles replay exactly. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A headless host whose asset backend parses json from public/, so screens see the real atlases. */
class FileAssetHost extends NullEngineHost {
  override readonly assetBackend: AssetBackend = {
    load: async (spec: AssetSpec) => (spec.type === 'json' ? JSON.parse(readFileSync(join(process.cwd(), 'public', spec.url), 'utf8')) : { id: spec.id, url: spec.url }),
    unload: () => {},
  };
}

describe('the six atlases honour the contract (AC 1, AC 4)', () => {
  it.each(BLOC_RACES)('%s: a complete Spearman sprite set, inside a single texture no larger than 1024 × 1024', (race) => {
    const doc = atlasOf(race);
    expect(hasSpriteSet(doc, 'spearman')).toBe(true);
    expect(contractProblems(doc, SPEARMAN)).toEqual([]);
    expect(doc.meta?.scale).toBe(ATLAS_SCALE);
    const [w, h] = doc.meta!.size;
    expect(w).toBeLessThanOrEqual(TEXTURE_LIMIT);
    expect(h).toBeLessThanOrEqual(TEXTURE_LIMIT);
    // The texture really is that size, so no frame rect can run off it.
    const png = join(process.cwd(), 'public', RACE_DEFINITIONS[race].atlas.replace(/[^/]+$/, doc.texture));
    expect(pngSize(png)).toEqual([w, h]);
    for (const [key, frame] of Object.entries(doc.frames)) {
      const [x, y, fw, fh] = frame.rect;
      expect(x + fw, key).toBeLessThanOrEqual(w);
      expect(y + fh, key).toBeLessThanOrEqual(h);
    }
    // Exactly the contract's clips: ready 2, walk 12, three 15-frame swipes striking on 4, death 8.
    const clips = requiredClips(SPEARMAN).filter((c) => c.name !== 'swipe-4');
    expect(clips.map((c) => [c.name, c.frames, c.strike])).toEqual([
      ['ready', 2, null],
      ['walk', 12, null],
      ['swipe-1', 15, 4],
      ['swipe-2', 15, 4],
      ['swipe-3', 15, 4],
      ['death', 8, null],
    ]);
  });
});

describe('the rig lands the blow on the strike frame for every race variant', () => {
  it.each(BLOC_RACES)('%s: the spear tip is furthest on frame 4 of each contract swipe', async (race) => {
    // The art sources are plain JavaScript modules without declarations.
    // @ts-expect-error -- untyped art module
    const { tipX } = (await import('../../../art/units/spearman/rig.mjs')) as { tipX: (v: unknown, spec: unknown, frame: number) => number };
    const variant = ((await import(`../../../art/units/races/${race}.mjs`)) as { default: unknown }).default;
    for (const spec of requiredClips(SPEARMAN).filter((c) => c.name.startsWith('swipe-') && c.name !== 'swipe-4')) {
      const reach = Array.from({ length: spec.frames }, (_, f) => tipX(variant, spec, f));
      expect(reach.indexOf(Math.max(...reach)), spec.name).toBe(spec.strike);
    }
  });
});

describe('one recorded Spearman replay against every atlas (AC 2)', () => {
  interface Recorded {
    tick: number;
    id: number;
    clip: ClipName;
    clipFrame: number;
  }

  /** Spearman against Spearman, both sides releasing whenever they can, for 1500 ticks. */
  const record = () => {
    const sim = createBattle({
      left: { race: 'race1', army: [SPEARMAN], control: 'human', upgrades: {} },
      right: { race: 'race2', army: [SPEARMAN], control: 'human', upgrades: {} },
      seed: 2026,
    });
    const frames: Recorded[] = [];
    const hits: { tick: number; by: number; kind: string }[] = [];
    for (let t = 0; t < 1500; t++) {
      const s = sim.snapshot();
      for (const side of ['left', 'right'] as const) if (s.spawners[side].canRelease) sim.command(side, 'release');
      sim.tick();
      const n = sim.snapshot();
      for (const u of n.units) frames.push({ tick: n.tick, id: u.id, clip: u.clip, clipFrame: u.clipFrame });
      for (const h of n.hits) hits.push({ tick: n.tick, by: h.by, kind: h.kind });
    }
    return { frames, hits };
  };
  const replay = record();

  it('the replay exercises walks, every swipe and deaths', () => {
    const clips = new Set(replay.frames.map((f) => f.clip));
    expect([...clips].sort()).toEqual(['death', 'swipe-1', 'swipe-2', 'swipe-3', 'swipe-4', 'walk']);
    expect(replay.hits.filter((h) => h.kind === 'melee').length).toBeGreaterThan(5);
  });

  it.each(BLOC_RACES)('%s: every frame of the replay resolves to a frame the atlas holds, with its accent', (race) => {
    const doc = atlasOf(race);
    const covered = new Map<string, Set<number>>();
    for (const f of replay.frames) {
      const r = resolveFrame(doc, SPEARMAN, f.clip, f.clipFrame);
      expect(r, `${f.clip}/${f.clipFrame}`).not.toBeNull();
      expect(doc.frames[r!.key], r!.key).toBeDefined();
      expect(r!.accent, r!.key).not.toBeNull();
      expect(doc.frames[r!.accent!], r!.accent!).toBeDefined();
      if (!covered.has(r!.clip)) covered.set(r!.clip, new Set());
      covered.get(r!.clip)!.add(r!.frame);
    }
    // No frame is skipped: the walk cycle and each contract swipe play through every frame.
    expect([...covered.get('walk')!].sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, i) => i));
    for (const swipe of ['swipe-1', 'swipe-2', 'swipe-3']) {
      expect([...covered.get(swipe)!].sort((a, b) => a - b), swipe).toEqual(Array.from({ length: 15 }, (_, i) => i));
    }
    expect([...covered.get('death')!].sort((a, b) => a - b)).toEqual(Array.from({ length: 8 }, (_, i) => i));
  });

  it.each(BLOC_RACES)('%s: every melee blow lands on the frame the atlas marks as the strike', (race) => {
    const doc = atlasOf(race);
    const melee = replay.hits.filter((h) => h.kind === 'melee');
    expect(melee.length).toBeGreaterThan(0);
    let checked = 0;
    for (const hit of melee) {
      let f = replay.frames.find((r) => r.tick === hit.tick && r.id === hit.by)!;
      if (f.clip === 'death') {
        // Killed in the same exchange: the snapshot shows the death; the tick before must have been the frame before the strike.
        expect(f.clipFrame).toBe(0);
        f = replay.frames.find((r) => r.tick === hit.tick - 1 && r.id === hit.by)!;
        expect(f.clip).toMatch(/^swipe-/);
        expect(f.clipFrame).toBe(f.clip === 'swipe-4' ? 6 : 3);
        continue;
      }
      checked++;
      expect(f.clip).toMatch(/^swipe-/);
      const r = resolveFrame(doc, SPEARMAN, f.clip, f.clipFrame)!;
      if (f.clip === 'swipe-4') {
        // The shield bash is not in the three-swipe contract: it plays swipe-1 with the strike pinned to frame 4.
        expect(f.clipFrame).toBe(7);
        expect(r).toMatchObject({ key: 'spearman/swipe-1/4', fallback: true });
      } else {
        expect(f.clipFrame).toBe(4);
        expect(r).toMatchObject({ key: `spearman/${f.clip}/4`, fallback: false });
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('the battle screen draws the atlas frame the simulation reports (AC 2, AC 5, AC 6, AC 8)', () => {
  let overlayRoot: HTMLElement;
  let storage: MemoryStorage;
  let host: FileAssetHost;
  let app: App;

  /** Everything the player's except one region defended by `race`, so that region is the only attack. */
  const ownersFacing = (race: BlocRaceId): RegionOwners => {
    const owners: Record<string, string | null> = Object.fromEntries(REGION_IDS.map((id) => [id, PLAYER_OWNER]));
    owners[BLOCS[race].holdout] = race;
    return owners;
  };

  const boot = async (save: CampaignSave) => {
    storage = new MemoryStorage();
    new SaveStore({ storage }).write(save);
    document.body.innerHTML = '<div id="ui"></div>';
    overlayRoot = document.getElementById('ui')!;
    host = new FileAssetHost();
    app = await createApp({ host, overlayRoot, storage });
    await app.shell.navigate('ready');
  };
  const click = async (action: string) => {
    const btn = overlayRoot.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`);
    if (!btn) throw new Error(`no button "${action}" on ${app.shell.activeScreenId}`);
    btn.click();
    await app.shell.settled();
  };
  const battle = () => overlayRoot.querySelector<HTMLElement>('[data-screen="battle"]')!;
  const handle = (): BattleHandle => battleHandle(battle())!;

  const startAgainst = async (race: BlocRaceId) => {
    await boot({ ...defaultSave(), chosenRace: 'race1', regionOwners: ownersFacing(race), ownedUnits: [SPEARMAN], battleRegion: null });
    await click('campaign');
    await click(`attack:${BLOCS[race].holdout}`);
    expect(app.shell.activeScreenId).toBe('battle');
    expect(battle().dataset.defender).toBe(race);
  };

  /** Release a Spearman on each side (the right spawner starts on its first unit, the Spearman). */
  const fieldSpearmen = () => {
    const sim = handle().simulation;
    while (!sim.snapshot().spawners.left.canRelease) host.tick(1);
    sim.command('left', 'release');
    while (!sim.snapshot().spawners.right.canRelease) host.tick(1);
    while (sim.snapshot().spawners.right.unit !== SPEARMAN) sim.command('right', 'next-unit');
    // Same lane as the left Spearman, so the two meet and fight.
    const lane = sim.snapshot().spawners.left.lane;
    while (sim.snapshot().spawners.right.lane < lane) sim.command('right', 'lane-down');
    while (sim.snapshot().spawners.right.lane > lane) sim.command('right', 'lane-up');
    sim.command('right', 'release');
    host.tick(2);
  };

  const spriteOf = (side: Side) => battle().querySelector<HTMLElement>(`.unit.${side}.sprite[data-unit="${SPEARMAN}"]`)!;
  const px = (v: string) => parseFloat(v);

  /** Every drawn sprite shows exactly the frame its unit's clip and frame resolve to in its side's atlas. */
  const expectNoDesync = (races: Record<Side, RaceId>): number => {
    const frame = handle().frame();
    const sprites = [...battle().querySelectorAll<HTMLElement>('.unit.sprite')];
    for (const el of sprites) {
      const u = frame.units.find((x) => x.id === Number(el.dataset.unitId))!;
      expect(el.dataset.clipFrame).toBe(String(u.clipFrame));
      const resolved = resolveFrame(atlasOf(races[u.side]), u.unit, u.clip, u.clipFrame)!;
      expect(el.dataset.frame).toBe(resolved.key);
      const body = el.querySelector<HTMLElement>('.body')!;
      expect(body.style.backgroundImage).toContain(raceVisuals(races[u.side]).atlas.replace('.json', '.png'));
    }
    return sprites.length;
  };

  beforeEach(() => {
    vi.spyOn(Math, 'random').mockImplementation(seeded(5));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(BLOC_RACES)('race1 against %s: both Spearmen are atlas sprites, feet on the lane baseline, frames in step with the simulation', async (race) => {
    await startAgainst(race);
    fieldSpearmen();
    const races: Record<Side, RaceId> = { left: 'race1', right: race };
    for (const side of ['left', 'right'] as const) {
      const el = spriteOf(side);
      expect(el, side).toBeTruthy();
      const u = handle().frame().units.find((x) => x.id === Number(el.dataset.unitId))!;
      // The unit element is anchored on its lane's baseline; the body hangs off the feet pivot.
      expect(el.style.top).toBe(`${laneY(u.lane)}px`);
      const body = el.querySelector<HTMLElement>('.body')!;
      const doc = atlasOf(races[side]);
      const f = doc.frames[el.dataset.frame!]!;
      const [, , w, h] = f.rect;
      expect(px(body.style.width)).toBeCloseTo(w / ATLAS_SCALE, 1);
      expect(px(body.style.height)).toBeCloseTo(h / ATLAS_SCALE, 1);
      expect(px(body.style.left)).toBeCloseTo((-f.pivot[0] * w) / ATLAS_SCALE, 1);
      expect(px(body.style.top)).toBeCloseTo((-f.pivot[1] * h) / ATLAS_SCALE, 1);
      // Feet on the baseline: only the ground shadow hangs below the anchor, and the figure stands above it.
      const bottom = px(body.style.top) + px(body.style.height);
      expect(bottom, `${race} ${side} shadow depth`).toBeGreaterThanOrEqual(0);
      expect(bottom, `${race} ${side} shadow depth`).toBeLessThanOrEqual(3.5);
      expect(px(body.style.top), `${race} ${side} height`).toBeLessThan(-20);
      expect(el.classList.contains('flipped')).toBe(u.facing === -1);
    }
    expect(expectNoDesync(races)).toBe(2);
    // Let the two fight, checking every few ticks: no frame ever drifts from the simulation.
    const clipsSeen = new Set<string>();
    let checked = 0;
    for (let i = 0; i < 300 && handle().frame().winner === null; i++) {
      host.tick(5);
      checked += expectNoDesync(races);
      for (const el of battle().querySelectorAll<HTMLElement>('.unit.sprite')) clipsSeen.add(el.dataset.clip!);
    }
    expect(checked).toBeGreaterThan(50);
    expect([...clipsSeen].some((c) => c.startsWith('swipe-') || c === 'death')).toBe(true);
  });

  it('race1 against race1: the same race tint and atlas on both sides, told apart by the accent layer alone (AC 5)', async () => {
    await startAgainst('race1');
    fieldSpearmen();
    const left = spriteOf('left');
    const right = spriteOf('right');
    expect(left.style.getPropertyValue('--tint')).toBe(right.style.getPropertyValue('--tint'));
    expect(left.dataset.frame!.startsWith('spearman/')).toBe(true);
    expect(right.dataset.frame!.startsWith('spearman/')).toBe(true);
    expect(left.style.getPropertyValue('--accent')).toBe('#fff');
    expect(right.style.getPropertyValue('--accent')).toBe('#000');
    for (const el of [left, right]) {
      const accent = el.querySelector<HTMLElement>('[data-role="accent"]')!;
      expect(accent.hidden).toBe(false);
      // The accent is the atlas's untinted pennant frame used as a mask over the side's value.
      expect(accent.style.getPropertyValue('mask-image')).toContain('race1.png');
      const u = handle().frame().units.find((x) => x.id === Number(el.dataset.unitId))!;
      const resolved = resolveFrame(atlasOf('race1'), SPEARMAN, u.clip, u.clipFrame)!;
      const f = atlasOf('race1').frames[resolved.accent!]!;
      expect(px(accent.style.width)).toBeCloseTo(f.rect[2] / ATLAS_SCALE, 1);
    }
  });

  it('a unit without a sprite set keeps the placeholder block beside atlas sprites', async () => {
    await startAgainst('race4');
    const sim = handle().simulation;
    while (!sim.snapshot().spawners.right.canRelease) host.tick(1);
    while (sim.snapshot().spawners.right.unit !== 1) sim.command('right', 'next-unit');
    sim.command('right', 'release');
    host.tick(2);
    const swordsman = battle().querySelector<HTMLElement>('.unit.right[data-unit="1"]')!;
    expect(swordsman.classList.contains('placeholder')).toBe(true);
    expect(swordsman.dataset.frame).toBeUndefined();
    expect(swordsman.querySelector('[data-role="accent"]')).not.toBeNull();
  });

  it('the spawner rack shows the portrait crop, large enough for the 18 px button (AC 8)', async () => {
    await startAgainst('race3');
    for (const side of ['left', 'right'] as const) {
      const button = battle().querySelector<HTMLElement>(`[data-role="rack-${side}"] button.spawner[data-unit="${SPEARMAN}"]`)!;
      const portrait = button.querySelector<HTMLElement>('[data-role="portrait"]')!;
      expect(portrait.classList.contains('art')).toBe(true);
      expect(portrait.dataset.frame).toBe(portraitKey('spearman'));
      expect(portrait.querySelector('.initial')).toBeNull();
      const sprite = portrait.querySelector<HTMLElement>('.sprite')!;
      expect(sprite.style.backgroundImage).toContain(side === 'left' ? 'race1.png' : 'race3.png');
      expect(sprite.style.backgroundSize).toMatch(/%/);
      const doc = atlasOf(side === 'left' ? 'race1' : 'race3');
      const [, , w, h] = doc.frames[portraitKey('spearman')]!.rect;
      // A 4× crop at least as large as the rack box, so the button never upsamples it.
      expect(w / ATLAS_SCALE).toBeGreaterThanOrEqual(18);
      expect(h / ATLAS_SCALE).toBeGreaterThanOrEqual(18);
    }
    // Units without art keep the glyph.
    const other = battle().querySelector<HTMLElement>('[data-role="rack-right"] button.spawner[data-unit="1"] [data-role="portrait"]')!;
    expect(other.classList.contains('art')).toBe(false);
    expect(other.querySelector('.initial')?.textContent).toBe('SW');
  });

  it('the shop rack shows the same portrait crop (AC 8)', async () => {
    await boot({ ...defaultSave(), chosenRace: 'race6', regionOwners: ownersFacing('race2'), ownedUnits: [SPEARMAN, 1] });
    await click('campaign');
    await click('shop');
    expect(app.shell.activeScreenId).toBe('shop');
    const portraits = [...overlayRoot.querySelectorAll<HTMLElement>('.shop [data-role="portrait"]')];
    const spear = portraits.find((p) => p.dataset.frame === portraitKey('spearman'))!;
    expect(spear).toBeTruthy();
    expect(spear.classList.contains('art')).toBe(true);
    expect(spear.querySelector<HTMLElement>('.sprite')!.style.backgroundImage).toContain('race6.png');
    const sword = portraits.find((p) => p.dataset.frame === 'swordsman')!;
    expect(sword.querySelector('.initial')?.textContent).toBe('SW');
  });
});
