/**
 * The sprite library — a unit's engine sprites, resolved by unit plus race
 * and nothing else.
 *
 * A race is one texture atlas asset. For a unit the race fields, the
 * library builds one `pc.Sprite` per contract clip (`ready`, `walk`,
 * `swipe-i`, `death`) whose frame keys are the contract's
 * `<sprite>/<clip>/<n>`, and one per accent clip. The clip names, frame
 * counts and strike frames are the roster's, identical for every race:
 * the library asks the atlas only which frame keys exist, never what the
 * race is. Sprites measure their frames in field units
 * (`ATLAS_PIXELS_PER_FIELD_UNIT` atlas pixels each), so the scene needs no
 * conversion: a unit sits where the simulation says.
 *
 * Sprites are shared by every unit of the same race and unit type, so a
 * battle touches at most two textures, one per side.
 */
import * as pc from 'playcanvas';
import {
  ATLAS_SCALE,
  ROSTER,
  accentKey,
  clipLength,
  frameKey,
  hasSpriteSet,
  requiredClips,
  resolveFrame,
  type RaceId,
  type ResolvedFrame,
  type PlayingClip,
  type RosterDefinition,
  type SpriteClip,
  type UnitId,
} from '../roster';
import { BATTLEFIELD_SCALE } from './scale';

/** Atlas pixels per field unit: the art's 4× over the battlefield scale (0.983 — one atlas pixel is just over one field unit). */
export const ATLAS_PIXELS_PER_FIELD_UNIT = ATLAS_SCALE * BATTLEFIELD_SCALE;

/** The engine atlas frame shape (`pc.TextureAtlas.frames` values). */
export interface EngineFrame {
  readonly rect: pc.Vec4;
  readonly pivot: pc.Vec2;
  readonly border: pc.Vec4;
}

export interface UnitSpriteSet {
  /** Body sprite per clip the atlas holds (an omitted optional swipe is absent). */
  readonly clips: ReadonlyMap<SpriteClip, pc.Sprite>;
  /** Accent (pennant) sprite per clip, white, for the renderer to tint per side. */
  readonly accents: ReadonlyMap<SpriteClip, pc.Sprite>;
  /** The widest body frame, in field units: what the ground shadow is sized from. */
  readonly footprint: number;
  /** The tallest body frame, in field units. */
  readonly height: number;
}

export class SpriteLibrary {
  private readonly sets = new Map<string, UnitSpriteSet | null>();

  constructor(
    private readonly device: pc.GraphicsDevice,
    private readonly atlases: Readonly<Partial<Record<RaceId, pc.TextureAtlas>>>,
    private readonly def: RosterDefinition = ROSTER,
  ) {}

  /** The race's texture atlas, or `null` when none was loaded for it. */
  atlas(race: RaceId): pc.TextureAtlas | null {
    return this.atlases[race] ?? null;
  }

  /** The frames the race's atlas holds, keyed as the contract keys them. */
  frames(race: RaceId): Readonly<Record<string, EngineFrame>> {
    return (this.atlases[race]?.frames ?? {}) as Readonly<Record<string, EngineFrame>>;
  }

  /** True when `race`'s atlas carries a sprite set for `unit` (otherwise the unit draws as the placeholder block). */
  hasSpriteSet(race: RaceId, unit: UnitId): boolean {
    return this.spriteSet(race, unit) !== null;
  }

  /** The unit's clip sprites as `race` draws it, or `null` without a sprite set. Built once per race and unit. */
  spriteSet(race: RaceId, unit: UnitId): UnitSpriteSet | null {
    const id = `${race}/${unit}`;
    const cached = this.sets.get(id);
    if (cached !== undefined) return cached;
    const built = this.build(race, unit);
    this.sets.set(id, built);
    return built;
  }

  /** The body and accent frame the unit draws for a simulation clip and frame, from the atlas's frame keys. */
  resolve(race: RaceId, unit: UnitId, clip: PlayingClip, clipFrame: number): ResolvedFrame | null {
    const atlas = this.atlases[race];
    if (!atlas) return null;
    return resolveFrame({ frames: this.frames(race) }, unit, clip, clipFrame, this.def);
  }

  /** Every sprite the library built, for a count or a teardown. */
  get builtSets(): number {
    return [...this.sets.values()].filter((s) => s !== null).length;
  }

  destroy(): void {
    for (const set of this.sets.values()) {
      if (!set) continue;
      for (const s of set.clips.values()) s.destroy();
      for (const s of set.accents.values()) s.destroy();
    }
    this.sets.clear();
  }

  private build(race: RaceId, unit: UnitId): UnitSpriteSet | null {
    const atlas = this.atlases[race];
    if (!atlas) return null;
    const frames = this.frames(race);
    const sprite = this.def.units[unit].sprite;
    if (!hasSpriteSet({ frames }, sprite)) return null;
    const clips = new Map<SpriteClip, pc.Sprite>();
    const accents = new Map<SpriteClip, pc.Sprite>();
    let footprint = 0;
    let height = 0;
    for (const spec of requiredClips(unit, this.def)) {
      const length = clipLength({ frames }, sprite, spec.name);
      if (length === 0) continue;
      const bodyKeys = Array.from({ length }, (_, n) => frameKey(sprite, spec.name, n));
      const accentKeys = Array.from({ length }, (_, n) => accentKey(sprite, spec.name, n)).filter((k) => k in frames);
      clips.set(spec.name, this.sprite(atlas, bodyKeys));
      if (accentKeys.length === length) accents.set(spec.name, this.sprite(atlas, accentKeys));
      for (const key of bodyKeys) {
        const f = frames[key];
        if (!f) continue;
        footprint = Math.max(footprint, f.rect.z / ATLAS_PIXELS_PER_FIELD_UNIT);
        height = Math.max(height, f.rect.w / ATLAS_PIXELS_PER_FIELD_UNIT);
      }
    }
    return { clips, accents, footprint, height };
  }

  private sprite(atlas: pc.TextureAtlas, frameKeys: string[]): pc.Sprite {
    return new pc.Sprite(this.device, { atlas, frameKeys, pixelsPerUnit: ATLAS_PIXELS_PER_FIELD_UNIT, renderMode: pc.SPRITE_RENDERMODE_SIMPLE });
  }
}
