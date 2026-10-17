/**
 * The unit layer — every unit and projectile of a frame snapshot as engine
 * sprites, reconciled by id each frame. It reads the snapshot and nothing
 * else: no rule, no timer, no state of its own beyond the entities it
 * keeps for the ids it has seen.
 *
 * A unit is an entity at its feet — the simulation's x and its lane's
 * baseline, in field units, at the lane's depth (`laneDepth`: lane 1 in
 * front, lane 8 at the back, so lower lanes occlude higher ones) — with:
 *
 * - a **ground shadow** under the feet, sized from the unit's widest
 *   frame, fading with the body;
 * - the **body**: an animated sprite component with one clip per contract
 *   clip from the sprite library, paused — the simulation's `clip` and
 *   `clipFrame` pick the clip and the frame every tick, so a blow lands on
 *   the strike frame the simulation says; `flipX` mirrors a unit facing
 *   left, so one set of frames serves both armies; `opacity` is the
 *   snapshot's `alpha`;
 * - the **accent** on top: the atlas's untinted pennant frame, coloured
 *   with the side's value — white on the left, black on the right — over a
 *   halo in the opposite value, so two armies of one race stay apart and
 *   the mark reads on any palette;
 * - a hit-point bar while alive.
 *
 * A unit whose race atlas has no sprite set yet is a block in the race
 * tint with a pennant quad in the side's value, on the same shadow.
 */
import * as pc from 'playcanvas';
import { FIELD, FRAMES_PER_SECOND, type FrameState, type ProjectileState, type Side, type UnitState } from '../battle';
import type { RaceId, SpriteClip, UnitId } from '../roster';
import { fieldToWorld, laneDepth } from './fieldView';
import type { SpriteLibrary, UnitSpriteSet } from './spriteLibrary';
import type { FlatSprites } from './textures';

/** The side's accent value: the pennant's fill. */
export const ACCENT_COLOURS: Readonly<Record<Side, string>> = { left: '#ffffff', right: '#000000' };
/** The ground shadow's opacity under a living unit; it fades with the body. */
export const SHADOW_OPACITY = 0.35;
/** The accent's halo offset in field units (one pixel at zoom 1, down and toward the unit's front). */
const HALO_OFFSET = 4;
const PLACEHOLDER = { width: 48, height: 72, pennant: { width: 28, height: 14, pole: 44 } } as const;
const HP_BAR = { width: 56, height: 6, above: 10 } as const;
const PROJECTILE_STYLE: Readonly<Record<ProjectileState['kind'], { width: number; height: number; colour: string }>> = {
  arrow: { width: 32, height: 8, colour: '#f3ecd8' },
  javelin: { width: 36, height: 8, colour: '#e0d2b0' },
  axe: { width: 20, height: 20, colour: '#bbbbbb' },
  magic: { width: 24, height: 24, colour: '#b26cff' },
};

export interface UnitSprite {
  readonly id: number;
  readonly side: Side;
  readonly unit: UnitId;
  /** The unit's root entity: its feet on the lane baseline. */
  readonly entity: pc.Entity;
  readonly body: pc.SpriteComponent;
  /** The side-coloured accent (the atlas pennant, or the placeholder's pennant quad). */
  readonly accent: pc.SpriteComponent;
  /** The accent's halo in the opposite value, or `null` for the placeholder. */
  readonly halo: pc.SpriteComponent | null;
  readonly shadow: pc.SpriteComponent;
  readonly hp: pc.SpriteComponent;
  /** True when the race atlas has no sprite set for the unit and the block stands in. */
  readonly placeholder: boolean;
  /** The body frame key drawn (`<sprite>/<clip>/<n>`), or `null` for the placeholder. */
  frameKey: string | null;
  /** The clip the body plays, or `null` for the placeholder. */
  clip: SpriteClip | null;
  /** The frame of `clip` shown. */
  frame: number;
  /** True when the atlas lacked the clip asked for and another stood in (`resolveFrame`). */
  fallback: boolean;
  /** The unit state this sprite last drew. */
  state: UnitState;
}

export interface UnitLayerOptions {
  readonly app: pc.AppBase;
  /** The entity the layer parents everything to (the screen's root). */
  readonly root: pc.Entity;
  readonly library: SpriteLibrary;
  readonly flat: FlatSprites;
  /** The race each side draws with (the contested host draws as the race whose atlas stands in). */
  readonly races: Readonly<Record<Side, RaceId>>;
  /** The race tint per side, for the placeholder block. */
  readonly tints: Readonly<Record<Side, string>>;
}

export interface UnitLayer {
  readonly root: pc.Entity;
  update(frame: FrameState): void;
  /** The sprites on the field, by unit id. */
  sprites(): ReadonlyMap<number, UnitSprite>;
  /** The projectile entities on the field, by projectile id. */
  projectiles(): ReadonlyMap<number, pc.Entity>;
  destroy(): void;
}

export function createUnitLayer(options: UnitLayerOptions): UnitLayer {
  const { app, root: parent, library, flat, races, tints } = options;
  const root = new pc.Entity('units', app);
  parent.addChild(root);
  const sprites = new Map<number, UnitSprite>();
  const projectiles = new Map<number, pc.Entity>();
  const colours = {
    accent: { left: colour(ACCENT_COLOURS.left), right: colour(ACCENT_COLOURS.right) },
    halo: { left: colour(ACCENT_COLOURS.right), right: colour(ACCENT_COLOURS.left) },
    tint: { left: colour(tints.left), right: colour(tints.right) },
    shadow: colour('#000000'),
    hp: colour('#2ecc71'),
  };
  const position = new pc.Vec3();

  const create = (u: UnitState): UnitSprite => {
    const race = races[u.side];
    const set = library.spriteSet(race, u.unit);
    const entity = new pc.Entity(`unit:${u.id}`, app);
    entity.tags.add('unit', u.side);
    root.addChild(entity);

    const shadow = child(app, entity, 'shadow', 0, 0, -2);
    shadow.addComponent('sprite', { type: pc.SPRITETYPE_SIMPLE, color: colours.shadow, opacity: SHADOW_OPACITY });
    shadow.sprite!.sprite = flat.shadow;
    const footprint = set ? set.footprint * 0.8 : PLACEHOLDER.width * 1.2;
    shadow.setLocalScale(footprint, footprint, 1);

    const hp = child(app, entity, 'hp', 0, (set ? set.height : PLACEHOLDER.height) + HP_BAR.above, 2);
    hp.addComponent('sprite', { type: pc.SPRITETYPE_SIMPLE, color: colours.hp });
    hp.sprite!.sprite = flat.quad;

    const body = child(app, entity, 'body', 0, 0, 0);
    if (set) {
      body.addComponent('sprite', { type: pc.SPRITETYPE_ANIMATED });
      addClips(body.sprite!, set);
      const accent = child(app, entity, 'accent', 0, 0, 1);
      accent.addComponent('sprite', { type: pc.SPRITETYPE_SIMPLE, color: colours.accent[u.side] });
      const halo = child(app, entity, 'halo', 0, 0, 0.5);
      halo.addComponent('sprite', { type: pc.SPRITETYPE_SIMPLE, color: colours.halo[u.side], opacity: 0.85 });
      return {
        id: u.id, side: u.side, unit: u.unit, entity, body: body.sprite!, accent: accent.sprite!, halo: halo.sprite!, shadow: shadow.sprite!, hp: hp.sprite!,
        placeholder: false, frameKey: null, clip: null, frame: -1, fallback: false, state: u,
      };
    }
    body.addComponent('sprite', { type: pc.SPRITETYPE_SIMPLE, color: colours.tint[u.side] });
    body.sprite!.sprite = flat.quadStanding;
    body.setLocalScale(PLACEHOLDER.width, PLACEHOLDER.height, 1);
    const pole = child(app, entity, 'pole', 0, PLACEHOLDER.height + PLACEHOLDER.pennant.pole / 2, 0.5);
    pole.addComponent('sprite', { type: pc.SPRITETYPE_SIMPLE, color: colours.accent[u.side] });
    pole.sprite!.sprite = flat.quad;
    pole.setLocalScale(3, PLACEHOLDER.pennant.pole, 1);
    const pennant = child(app, entity, 'accent', 0, PLACEHOLDER.height + PLACEHOLDER.pennant.pole - PLACEHOLDER.pennant.height / 2, 1);
    pennant.addComponent('sprite', { type: pc.SPRITETYPE_SIMPLE, color: colours.accent[u.side] });
    pennant.sprite!.sprite = flat.quad;
    pennant.setLocalScale(PLACEHOLDER.pennant.width, PLACEHOLDER.pennant.height, 1);
    return {
      id: u.id, side: u.side, unit: u.unit, entity, body: body.sprite!, accent: pennant.sprite!, halo: null, shadow: shadow.sprite!, hp: hp.sprite!,
      placeholder: true, frameKey: null, clip: null, frame: -1, fallback: false, state: u,
    };
  };

  const draw = (s: UnitSprite, u: UnitState) => {
    const flipped = u.facing === -1;
    s.entity.setPosition(fieldToWorld(u.x, FIELD.laneY(u.lane), laneDepth(u.lane), position));
    s.body.opacity = u.alpha;
    s.shadow.opacity = SHADOW_OPACITY * u.alpha;
    s.accent.opacity = u.phase === 'dead' ? 0.7 * u.alpha : u.alpha;
    if (s.halo) s.halo.opacity = 0.85 * u.alpha;
    s.hp.enabled = u.phase !== 'dead';
    if (s.hp.enabled) s.hp.entity.setLocalScale(Math.max(0, Math.min(1, u.hp / u.maxHp)) * HP_BAR.width, HP_BAR.height, 1);

    if (s.placeholder) {
      // The block mirrors by moving its pennant to the unit's front.
      s.accent.entity.setLocalPosition((flipped ? -1 : 1) * (PLACEHOLDER.pennant.width / 2 + 1), s.accent.entity.getLocalPosition().y, 1);
      s.state = u;
      return;
    }
    const resolved = library.resolve(races[u.side], u.unit, u.clip, u.clipFrame);
    if (!resolved) return;
    if (resolved.clip !== s.clip) {
      s.body.play(resolved.clip);
      s.body.currentClip.pause();
      const set = library.spriteSet(races[u.side], u.unit)!;
      const accent = set.accents.get(resolved.clip);
      s.accent.enabled = accent !== undefined;
      if (accent) s.accent.sprite = accent;
      if (s.halo) {
        s.halo.enabled = accent !== undefined;
        if (accent) s.halo.sprite = accent;
      }
      s.clip = resolved.clip;
      s.frame = -1;
    }
    if (resolved.frame !== s.frame) {
      s.body.currentClip.frame = resolved.frame;
      s.accent.frame = resolved.frame;
      if (s.halo) s.halo.frame = resolved.frame;
      s.frame = resolved.frame;
    }
    if (s.body.flipX !== flipped) {
      s.body.flipX = flipped;
      s.accent.flipX = flipped;
      if (s.halo) {
        s.halo.flipX = flipped;
        s.halo.entity.setLocalPosition((flipped ? -1 : 1) * HALO_OFFSET, -HALO_OFFSET, 0.5);
      }
    }
    s.frameKey = resolved.key;
    s.fallback = resolved.fallback;
    s.state = u;
  };

  const drawProjectile = (p: ProjectileState) => {
    let entity = projectiles.get(p.id);
    if (!entity) {
      const style = PROJECTILE_STYLE[p.kind];
      entity = new pc.Entity(`projectile:${p.id}`, app);
      entity.tags.add('projectile', p.kind, p.side);
      entity.addComponent('sprite', { type: pc.SPRITETYPE_SIMPLE, color: colour(style.colour) });
      entity.sprite!.sprite = flat.quad;
      entity.setLocalScale(style.width, style.height, 1);
      root.addChild(entity);
      projectiles.set(p.id, entity);
    }
    entity.setPosition(fieldToWorld(p.x, FIELD.laneY(p.lane) - p.y, laneDepth(p.lane) + 5, position));
  };

  return {
    root,
    update(frame) {
      const seen = new Set<number>();
      for (const u of frame.units) {
        seen.add(u.id);
        let s = sprites.get(u.id);
        if (!s) {
          s = create(u);
          sprites.set(u.id, s);
        }
        draw(s, u);
      }
      for (const [id, s] of sprites) {
        if (seen.has(id)) continue;
        s.entity.destroy();
        sprites.delete(id);
      }
      const seenProjectiles = new Set<number>();
      for (const p of frame.projectiles) {
        seenProjectiles.add(p.id);
        drawProjectile(p);
      }
      for (const [id, entity] of projectiles) {
        if (seenProjectiles.has(id)) continue;
        entity.destroy();
        projectiles.delete(id);
      }
    },
    sprites: () => sprites,
    projectiles: () => projectiles,
    destroy() {
      root.destroy();
      sprites.clear();
      projectiles.clear();
    },
  };
}

/** One paused clip per contract clip, named as the contract names it, at the battle's frame rate; the snapshot sets the frame. */
function addClips(component: pc.SpriteComponent, set: UnitSpriteSet): void {
  for (const [name, sprite] of set.clips) {
    const clip = component.addClip({ name, fps: FRAMES_PER_SECOND, loop: false });
    clip.sprite = sprite;
  }
}

function child(app: pc.AppBase, parent: pc.Entity, name: string, x: number, y: number, z: number): pc.Entity {
  const e = new pc.Entity(name, app);
  e.setLocalPosition(x, y, z);
  parent.addChild(e);
  return e;
}

function colour(hex: string): pc.Color {
  return new pc.Color().fromString(hex);
}
