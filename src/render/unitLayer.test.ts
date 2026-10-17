/**
 * The engine renderer against the simulation's snapshots: zoom (AC 2),
 * clip parity across atlases (AC 4), the team accent (AC 5), lane depth
 * (AC 6), the death fade (AC 7), mirroring (AC 8), shadows and feet on the
 * baseline — all on the headless engine, measuring entities, sprite
 * components and the camera's projection.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as pc from 'playcanvas';
import { BODY_FRAMES, FADE_PER_FRAME, FIELD, LANE_COUNT, createBattle, type ClipName, type FrameState, type Side, type UnitState } from '../battle';
import { HeadlessEngineHost, textureAtlasFromDocument } from '../engine/headlessHost';
import { BLOC_RACES, RACE_DEFINITIONS, raceVisuals, requiredClips, type AtlasDocument, type RaceId } from '../roster';
import { createFieldView, laneDepth, type FieldView } from './fieldView';
import { FIELD_WIDTH_UNITS, fieldProjection } from './scale';
import { SpriteLibrary } from './spriteLibrary';
import { ACCENT_COLOURS, SHADOW_OPACITY, createUnitLayer, type UnitLayer, type UnitSprite } from './unitLayer';

const SPEARMAN = 0;
const SWORDSMAN = 1;
const ARCHER = 2;
const atlasDoc = (race: RaceId): AtlasDocument => JSON.parse(readFileSync(join(process.cwd(), 'public', RACE_DEFINITIONS[race].atlas), 'utf8')) as AtlasDocument;

/** A scene: host, atlases for every bloc race, a field view at `zoom` and a unit layer drawing `races`. */
function scene(zoom: number, races: Record<Side, RaceId>, size: [number, number] = [1400, 900]) {
  const host = new HeadlessEngineHost({ width: size[0], height: size[1] });
  const atlases = Object.fromEntries(BLOC_RACES.map((race) => [race, textureAtlasFromDocument(host.device, atlasDoc(race))])) as Record<RaceId, pc.TextureAtlas>;
  const library = new SpriteLibrary(host.device, atlases);
  const root = host.createSceneRoot('screen:battle');
  const view = createFieldView(host.app, root, zoom);
  const units = createUnitLayer({ app: host.app, root, library, flat: view.flat, races, tints: { left: raceVisuals(races.left).tint, right: raceVisuals(races.right).tint } });
  const destroy = () => {
    units.destroy();
    view.destroy();
    library.destroy();
    host.destroy();
  };
  return { host, atlases, library, root, view, units, destroy };
}

/** A snapshot holding exactly `units` (and `projectiles`), on top of a fresh battle's frame. */
function frameWith(units: Partial<UnitState>[], projectiles: FrameState['projectiles'] = []): FrameState {
  const base = createBattle({ left: { race: 'race1', army: [SPEARMAN], control: 'human' }, right: { race: 'race1', army: [SPEARMAN], control: 'human' }, seed: 1 }).snapshot();
  const full = units.map(
    (u, i): UnitState => ({
      id: i + 1, side: 'left', unit: SPEARMAN, race: 'race1', lane: 4, x: 1000, hp: 37, maxHp: 37, phase: 'walk', facing: 1, clip: 'walk', clipFrame: 0, alpha: 1,
      ...u,
    }),
  );
  return { ...base, units: full, projectiles };
}

const bodyMesh = (s: UnitSprite) => (s.body as unknown as { _meshInstance: pc.MeshInstance })._meshInstance;
const meshOf = (c: pc.SpriteComponent) => (c as unknown as { _meshInstance: pc.MeshInstance | null })._meshInstance;
/** The world-space box of the frame a sprite component draws (the component's own aabb is its 9-slice size, not the frame's). */
const drawnBox = (mi: pc.MeshInstance): pc.BoundingBox => {
  const box = new pc.BoundingBox();
  box.setFromTransformedAabb(mi.mesh.aabb, mi.node.getWorldTransform());
  return box;
};

/** Spearman against Spearman on one lane, both sides releasing whenever they can: 1500 ticks of walks, every swipe and deaths. */
function replay(left: RaceId, right: RaceId) {
  const sim = createBattle({ left: { race: left, army: [SPEARMAN], control: 'human' }, right: { race: right, army: [SPEARMAN], control: 'human' }, seed: 2026 });
  const frames: FrameState[] = [];
  for (let t = 0; t < 1500; t++) {
    const s = sim.snapshot();
    for (const side of ['left', 'right'] as const) if (s.spawners[side].canRelease) sim.command(side, 'release');
    sim.tick();
    frames.push(sim.snapshot());
  }
  return frames;
}

describe('the unit layer draws the snapshot (AC 4, AC 8)', () => {
  const s = scene(1, { left: 'race1', right: 'race4' });
  afterAll(() => s.destroy());

  it('places a unit at its field x on its lane baseline, feet on the line, shadow underneath, at the lane depth', () => {
    s.units.update(frameWith([{ id: 7, lane: 3, x: 1234, clip: 'walk', clipFrame: 5 }]));
    s.host.tick(1);
    const sprite = s.units.sprites().get(7)!;
    expect(sprite).toBeDefined();
    const pos = sprite.entity.getPosition();
    expect(pos.x).toBe(1234);
    expect(pos.y).toBe(-FIELD.laneY(3));
    expect(pos.z).toBe(laneDepth(3));
    expect(sprite.frameKey).toBe('spearman/walk/5');
    expect(sprite.body.currentClip.name).toBe('walk');
    expect(sprite.body.currentClip.frame).toBe(5);
    expect(sprite.body.currentClip.isPaused).toBe(true);
    // The body's feet (its lowest point) sit on the baseline, within a boot sole; the figure stands a lane tall above it.
    const aabb = drawnBox(bodyMesh(sprite));
    expect(aabb.getMin().y).toBeGreaterThanOrEqual(pos.y - 6);
    expect(aabb.getMin().y).toBeLessThanOrEqual(pos.y + 1);
    expect(aabb.getMax().y - pos.y).toBeGreaterThan(100);
    expect(aabb.getMax().y - pos.y).toBeLessThan(170);
    // The ground shadow: centred under the feet, behind the body, 35 % black, sized from the unit's widest frame.
    const shadow = drawnBox(meshOf(sprite.shadow)!);
    expect(shadow.center.x).toBeCloseTo(pos.x, 6);
    expect(shadow.center.y).toBeCloseTo(pos.y, 6);
    expect(shadow.center.z).toBeLessThan(aabb.center.z);
    expect(sprite.shadow.opacity).toBeCloseTo(SHADOW_OPACITY, 6);
    expect(sprite.shadow.color.r).toBe(0);
    expect(shadow.halfExtents.x * 2).toBeGreaterThan(40);
    expect(shadow.halfExtents.y).toBeCloseTo(shadow.halfExtents.x / 2, 6);
  });

  it('a right-army unit is the horizontal mirror of the frame the left army uses; the atlas stores no mirrored frames (AC 8)', () => {
    const s = scene(1, { left: 'race1', right: 'race1' });
    s.units.update(
      frameWith([
        { id: 1, side: 'left', facing: 1, clip: 'swipe-1', clipFrame: 4, x: 900 },
        { id: 2, side: 'right', facing: -1, clip: 'swipe-1', clipFrame: 4, x: 1100 },
      ]),
    );
    s.host.tick(1);
    const left = s.units.sprites().get(1)!;
    const right = s.units.sprites().get(2)!;
    expect(left.frameKey).toBe('spearman/swipe-1/4');
    expect(right.frameKey).toBe('spearman/swipe-1/4');
    expect(left.body.flipX).toBe(false);
    expect(right.body.flipX).toBe(true);
    expect(right.accent.flipX).toBe(true);
    // The very same mesh (same frame of its race's atlas) drawn under a mirrored transform.
    expect(bodyMesh(left).mesh.id).toBe(s.library.spriteSet('race1', SPEARMAN)!.clips.get('swipe-1')!.meshes[4]!.id);
    expect(bodyMesh(right).mesh.id).toBe(bodyMesh(left).mesh.id);
    expect(bodyMesh(left).node.getLocalScale().x).toBe(1);
    expect(bodyMesh(right).node.getLocalScale().x).toBe(-1);
    // The spear points to the right of the left unit's feet and to the left of the right unit's.
    const l = drawnBox(bodyMesh(left));
    const r = drawnBox(bodyMesh(right));
    expect(l.getMax().x - 900).toBeGreaterThan(900 - l.getMin().x);
    expect(1100 - r.getMin().x).toBeGreaterThan(r.getMax().x - 1100);
    expect(1100 - r.getMin().x).toBeCloseTo(l.getMax().x - 900, 3);
    // No atlas holds a frame beyond the contract's: body, accent and portrait keys only, every body frame facing one way.
    for (const race of BLOC_RACES) {
      const keys = Object.keys(s.atlases[race].frames).filter((k) => k.startsWith('spearman/'));
      const contract = requiredClips(SPEARMAN).filter((c) => c.name !== 'swipe-4').reduce((n, c) => n + c.frames, 0);
      expect(keys.length).toBe(contract * 2 + 1);
    }
    s.destroy();
  });

  it('renders the same replay through the race1 and race4 atlases with identical clips and frames on every tick, differing only in the texture (AC 4)', () => {
    const first = scene(1, { left: 'race1', right: 'race1' });
    const second = scene(1, { left: 'race4', right: 'race4' });
    const frames = replay('race1', 'race1');
    const clips = new Set<string>();
    let compared = 0;
    for (const frame of frames) {
      first.units.update(frame);
      second.units.update(frame);
      for (const u of frame.units) {
        const a = first.units.sprites().get(u.id)!;
        const b = second.units.sprites().get(u.id)!;
        expect([a.clip, a.frame, a.frameKey, a.fallback]).toEqual([b.clip, b.frame, b.frameKey, b.fallback]);
        expect(a.body.currentClip.name).toBe(b.body.currentClip.name);
        expect(a.body.currentClip.frame).toBe(b.body.currentClip.frame);
        expect(a.body.sprite.frameKeys).toEqual(b.body.sprite.frameKeys);
        expect(a.body.sprite.atlas.texture.name).toBe('race1.png');
        expect(b.body.sprite.atlas.texture.name).toBe('race4.png');
        clips.add(a.clip!);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(1000);
    expect([...clips].sort()).toEqual(['death', 'swipe-1', 'swipe-2', 'swipe-3', 'walk']);
    first.destroy();
    second.destroy();
  });

  it('a unit without a sprite set is the placeholder block with a pennant, and a projectile is a quad at its height', () => {
    s.units.update(
      frameWith(
        [
          { id: 3, unit: SWORDSMAN, side: 'right', facing: -1, x: 700 },
          { id: 4, unit: ARCHER, side: 'left', x: 300, lane: 2 },
        ],
        [{ id: 9, side: 'left', lane: 2, x: 420, y: 66, kind: 'arrow', facing: 1, firer: 4 }],
      ),
    );
    s.host.tick(1);
    const block = s.units.sprites().get(3)!;
    expect(block.placeholder).toBe(true);
    expect(block.frameKey).toBeNull();
    expect(block.body.color.toString(false)).toBe(new pc.Color().fromString(raceVisuals('race4').tint).toString(false));
    expect(block.accent.color.toString(false)).toBe(new pc.Color().fromString(ACCENT_COLOURS.right).toString(false));
    expect(block.accent.entity.getLocalPosition().x).toBeLessThan(0); // the pennant flies to the unit's front: left
    expect(block.shadow.opacity).toBeCloseTo(SHADOW_OPACITY, 6);
    const arrow = s.units.projectiles().get(9)!;
    expect(arrow.getPosition().x).toBe(420);
    expect(arrow.getPosition().y).toBeCloseTo(-(FIELD.laneY(2) - 66), 6);
    expect(arrow.tags.has('arrow')).toBe(true);
    s.units.update(frameWith([]));
    expect(s.units.sprites().size).toBe(0);
    expect(s.units.projectiles().size).toBe(0);
  });
});

describe('the team accent tells the sides apart when both pick the same race (AC 5)', () => {
  it('both bodies share the race atlas untinted; the accents are white on the left and black on the right, each over a halo of the other value', () => {
    const s = scene(1, { left: 'race3', right: 'race3' });
    s.units.update(
      frameWith([
        { id: 1, side: 'left', facing: 1, x: 900, race: 'race3' },
        { id: 2, side: 'right', facing: -1, x: 1100, race: 'race3' },
      ]),
    );
    s.host.tick(1);
    const left = s.units.sprites().get(1)!;
    const right = s.units.sprites().get(2)!;
    expect(left.body.sprite.atlas).toBe(right.body.sprite.atlas);
    expect(left.body.color.toString(false)).toBe(right.body.color.toString(false));
    expect(left.body.color.toString(false)).toBe('#ffffff');
    // Sample the accent: its fill is the side's value, so the pixels differ between the two armies.
    expect(left.accent.color.toString(false)).toBe('#ffffff');
    expect(right.accent.color.toString(false)).toBe('#000000');
    expect(left.halo!.color.toString(false)).toBe('#000000');
    expect(right.halo!.color.toString(false)).toBe('#ffffff');
    expect(left.accent.sprite.frameKeys[0]).toBe('spearman/accent/walk/0');
    expect(left.accent.frame).toBe(0);
    expect(meshOf(left.accent)).not.toBeNull();
    // The accent sits above the body in depth, the halo between them.
    const body = drawnBox(bodyMesh(left)).center.z;
    expect(drawnBox(meshOf(left.accent)!).center.z).toBeGreaterThan(drawnBox(meshOf(left.halo!)!).center.z);
    expect(drawnBox(meshOf(left.halo!)!).center.z).toBeGreaterThan(body);
    s.destroy();
  });
});

describe('lane depth (AC 6)', () => {
  it('a unit in lane 8 is drawn behind a unit in lane 1 when they overlap: it comes first in the camera\'s back-to-front order', () => {
    const s = scene(1, { left: 'race1', right: 'race2' });
    s.units.update(
      frameWith([
        { id: 1, lane: 8, x: 1000, side: 'left' },
        { id: 2, lane: 1, x: 1000, side: 'right', facing: -1 },
      ]),
    );
    s.host.tick(1);
    const back = s.units.sprites().get(1)!;
    const front = s.units.sprites().get(2)!;
    expect(laneDepth(8)).toBeLessThan(laneDepth(1));
    expect(back.entity.getPosition().z).toBeLessThan(front.entity.getPosition().z);
    const world = s.host.app.scene.layers.getLayerById(pc.LAYERID_WORLD)!;
    expect(world.transparentSortMode).toBe(pc.SORTMODE_BACK2FRONT);
    const drawn = world.getCulledInstances(s.view.camera.camera!.camera).transparent;
    const order = drawn.map((mi) => mi.mesh.id);
    expect(order.indexOf(bodyMesh(back).mesh.id)).toBeGreaterThanOrEqual(0);
    expect(order.indexOf(bodyMesh(back).mesh.id)).toBeLessThan(order.indexOf(bodyMesh(front).mesh.id));
    // Every lane: a lower lane number is nearer the camera than a higher one.
    for (let lane = 1; lane < LANE_COUNT; lane++) expect(laneDepth(lane)).toBeGreaterThan(laneDepth(lane + 1));
    s.destroy();
  });
});

describe('the death fade (AC 7)', () => {
  it('a dead unit stays fully opaque for 500 ticks, then loses opacity every tick and is gone after 100 more', () => {
    const s = scene(1, { left: 'race1', right: 'race2' });
    const frames = replay('race1', 'race2');
    // The first unit to die, and the tick it died on.
    let victim: number | null = null;
    let deathTick = -1;
    for (const f of frames) {
      const dead = f.units.find((u) => u.phase === 'dead');
      if (dead) {
        victim = dead.id;
        deathTick = f.tick;
        break;
      }
    }
    expect(victim).not.toBeNull();
    const opacities: number[] = [];
    let gone = -1;
    for (const f of frames) {
      s.units.update(f);
      const sprite = s.units.sprites().get(victim!);
      if (f.tick < deathTick) continue;
      if (!sprite) {
        gone = f.tick;
        break;
      }
      expect(sprite.body.currentClip.name).toBe('death');
      expect(sprite.body.opacity).toBe(f.units.find((u) => u.id === victim)!.alpha);
      expect(sprite.shadow.opacity).toBeCloseTo(SHADOW_OPACITY * sprite.body.opacity, 6);
      expect(sprite.hp.enabled).toBe(false);
      opacities.push(sprite.body.opacity);
    }
    expect(opacities.slice(0, BODY_FRAMES + 1).every((a) => a === 1)).toBe(true);
    const fading = opacities.slice(BODY_FRAMES + 1);
    expect(fading.length).toBeGreaterThan(50);
    for (let i = 0; i < fading.length; i++) expect(fading[i]).toBeCloseTo(1 - FADE_PER_FRAME * (i + 1), 6);
    expect(gone).toBe(deathTick + BODY_FRAMES + Math.round(1 / FADE_PER_FRAME));
    expect(s.root.findByName(`unit:${victim}`)).toBeNull();
    s.destroy();
  });
});

describe('zoom (AC 2)', () => {
  /** The body's rendered box, in canvas pixels. */
  const renderedBox = (view: FieldView, sprite: UnitSprite) => {
    const aabb = drawnBox(bodyMesh(sprite));
    const min = view.toScreen(aabb.getMin().x, -aabb.getMax().y);
    const max = view.toScreen(aabb.getMax().x, -aabb.getMin().y);
    return { width: max.x - min.x, height: max.y - min.y, left: min.x, top: min.y };
  };

  it('zoom 4 renders the battlefield, every unit and the lane spacing exactly four times larger than zoom 1', () => {
    const one = scene(1, { left: 'race1', right: 'race2' }, [4000, 3000]);
    const four = scene(4, { left: 'race1', right: 'race2' }, [4000, 3000]);
    const frame = frameWith([
      { id: 1, lane: 2, x: 400 },
      { id: 2, lane: 7, x: 2200, side: 'right', facing: -1, clip: 'swipe-2', clipFrame: 4 },
    ]);
    one.units.update(frame);
    four.units.update(frame);
    one.host.tick(1);
    four.host.tick(1);
    // The battlefield: the camera's viewport is the band, 700 px wide at zoom 1 and 2800 at zoom 4.
    const bandWidth = (v: FieldView) => v.toScreen(FIELD_WIDTH_UNITS, 0).x - v.toScreen(0, 0).x;
    expect(Math.abs(bandWidth(one.view) - 700)).toBeLessThan(1);
    expect(bandWidth(four.view)).toBeCloseTo(4 * bandWidth(one.view), 3);
    expect(one.view.camera.camera!.rect.z * 4000).toBeCloseTo(bandWidth(one.view), 3);
    // Lanes: 36.9 px apart at zoom 1, 147.5 at zoom 4.
    const laneGap = (v: FieldView) => v.toScreen(0, FIELD.laneY(2)).y - v.toScreen(0, FIELD.laneY(1)).y;
    expect(laneGap(one.view)).toBeCloseTo(36.87, 1);
    expect(laneGap(four.view)).toBeCloseTo(4 * laneGap(one.view), 3);
    // Units: four times the size and four times the spacing, at the same place relative to the band.
    for (const id of [1, 2]) {
      const a = renderedBox(one.view, one.units.sprites().get(id)!);
      const b = renderedBox(four.view, four.units.sprites().get(id)!);
      expect(b.width).toBeCloseTo(4 * a.width, 3);
      expect(b.height).toBeCloseTo(4 * a.height, 3);
      // A foot unit stands 18–42 px tall at zoom 1 (the squat race2 is the shortest).
      expect(a.height).toBeGreaterThan(18);
      expect(a.height).toBeLessThan(42);
    }
    const spacing = (v: FieldView) => v.toScreen(2200, 0).x - v.toScreen(400, 0).x;
    expect(spacing(four.view)).toBeCloseTo(4 * spacing(one.view), 3);
    expect(spacing(one.view)).toBeCloseTo(fieldProjection(1).length(1800), 3);
    one.destroy();
    four.destroy();
  });

  it('a recorded replay produces identical simulation snapshots whatever the zoom it is rendered at', () => {
    const at = (zoom: number) => {
      const s = scene(zoom, { left: 'race1', right: 'race2' });
      const sim = createBattle({ left: { race: 'race1', army: [SPEARMAN], control: 'human' }, right: { race: 'race2', army: [SPEARMAN], control: 'human' }, seed: 77 });
      const snapshots: string[] = [];
      for (let t = 0; t < 600; t++) {
        const f = sim.snapshot();
        for (const side of ['left', 'right'] as const) if (f.spawners[side].canRelease) sim.command(side, 'release');
        sim.tick();
        s.units.update(sim.snapshot());
        s.host.tick(1);
        snapshots.push(JSON.stringify(sim.snapshot()));
      }
      s.destroy();
      return snapshots;
    };
    const one = at(1);
    const four = at(4);
    expect(four).toEqual(one);
    expect(one.length).toBe(600);
  });
});

describe('the renderer holds no state of its own', () => {
  it('two layers fed the same snapshots draw the same thing, and a layer fed a later snapshot first still draws it', () => {
    const a = scene(1, { left: 'race1', right: 'race2' });
    const b = scene(1, { left: 'race1', right: 'race2' });
    const frames = replay('race1', 'race2').slice(200, 260);
    for (const f of frames) a.units.update(f);
    b.units.update(frames[frames.length - 1]!);
    const snapshotOf = (layer: UnitLayer) => [...layer.sprites().values()].map((s) => [s.id, s.frameKey, s.body.flipX, s.body.opacity, s.entity.getPosition().x]);
    expect(snapshotOf(b.units)).toEqual(snapshotOf(a.units));
    const clips = new Set(frames.flatMap((f) => f.units.map((u) => u.clip as ClipName)));
    expect(clips.size).toBeGreaterThan(0);
    a.destroy();
    b.destroy();
  });
});
