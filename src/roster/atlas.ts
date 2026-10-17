/**
 * The unit atlas contract — what a race's atlas must contain for the
 * renderer to draw a unit from art instead of the tinted placeholder block,
 * and how a simulation clip and frame resolve to a frame key in it.
 *
 * An atlas is a PNG plus a JSON next to it:
 *
 * ```json
 * {
 *   "texture": "race1.png",
 *   "meta": { "scale": 4, "size": [1024, 1024], "origin": "top-left", "contract": 1 },
 *   "frames": {
 *     "spearman/ready/0":        { "rect": [x, y, w, h], "pivot": [px, py], "border": [0, 0, 0, 0] },
 *     "spearman/accent/ready/0": { ... },
 *     "spearman/portrait":       { ... },
 *     "swordsman":               { ... }
 *   }
 * }
 * ```
 *
 * - `rect` is in texture pixels with the origin at the texture's top-left
 *   corner (what the DOM renderer and the placeholder use; PlayCanvas's own
 *   sprite loader measures `y` from the bottom, so an engine-sprite move
 *   flips it as `size[1] − y − h`). `pivot` is a fraction of the rect,
 *   `[0, 0]` its top-left: the point that sits on the lane baseline at the
 *   unit's centre — the feet. Frames are trimmed to their pixels, so a
 *   small frame far from the feet (a pennant) has a pivot outside 0…1;
 *   that is expected. `meta.scale` is the authoring scale (4: a unit
 *   around 112 px tall in the atlas is drawn 28 px tall at 1×).
 * - A unit's **sprite set** is every frame keyed `<sprite>/<clip>/<n>`, with
 *   `<sprite>` the roster's `sprite` key. The clips and their lengths come
 *   from the roster (`requiredClips`): `ready` of `READY_FRAMES`, `walk` of
 *   the walk cycle's `clip`, `swipe-i` of the i-th attack's `clip` (with the
 *   strike frame inside it), `death` of `DEATH_FRAMES`. Every body frame has
 *   a matching **accent** frame `<sprite>/accent/<clip>/<n>`: the team
 *   marker (a pennant) as an untinted white shape the renderer colours per
 *   side. `<sprite>/portrait` is the rack crop.
 * - A unit with no sprite set keeps a single legacy frame `<sprite>` (the
 *   placeholder) and is drawn as the tinted block.
 * - A sprite set may omit a swipe beyond the first (the work order's
 *   three-swipe contract against a roster that restored the Spearman's
 *   fourth): the renderer then plays the first swipe time-warped so the
 *   strike frames coincide (`resolveFrame`). Every other clip is required.
 *
 * Nothing here reads a file: the build check and the tests pass the parsed
 * JSON in; the renderer passes what the asset loader returned.
 */
import { ROSTER, type RosterDefinition, type UnitId } from './data';

export const READY_FRAMES = 2;
export const DEATH_FRAMES = 8;
/** The authoring scale the art is drawn at: atlas pixels per 1× stage pixel. */
export const ATLAS_SCALE = 4;

/** The clips the simulation reports (`src/battle` spells the same union as `ClipName`; the roster must not import it). */
export type PlayingClip = 'walk' | `swipe-${number}` | 'death';
export type SpriteClip = 'ready' | PlayingClip;

export interface AtlasFrame {
  /** `[x, y, width, height]` in texture pixels, top-left origin. */
  readonly rect: readonly [number, number, number, number];
  /** `[x, y]` as fractions of the rect, `[0, 0]` top-left: the feet, on the lane baseline. */
  readonly pivot: readonly [number, number];
  /** 9-slice borders; unused for units, kept for PlayCanvas compatibility. */
  readonly border?: readonly [number, number, number, number];
}

export interface AtlasMeta {
  readonly scale: number;
  /** Texture `[width, height]` in pixels. */
  readonly size: readonly [number, number];
  readonly origin?: 'top-left';
  readonly contract?: number;
}

/** An atlas JSON as shipped under `public/assets/units/`. */
export interface AtlasDocument {
  readonly texture: string;
  readonly meta?: AtlasMeta;
  readonly frames: Readonly<Record<string, AtlasFrame>>;
}

export function frameKey(sprite: string, clip: SpriteClip, frame: number): string {
  return `${sprite}/${clip}/${frame}`;
}

export function accentKey(sprite: string, clip: SpriteClip, frame: number): string {
  return `${sprite}/accent/${clip}/${frame}`;
}

export function portraitKey(sprite: string): string {
  return `${sprite}/portrait`;
}

export interface ClipSpec {
  readonly name: SpriteClip;
  readonly frames: number;
  /** Frame the blow lands on (the first strike of a swipe), or `null` for a clip without one. */
  readonly strike: number | null;
  /** False for a swipe beyond the first: the renderer can stand in for it. */
  readonly required: boolean;
}

/** The clips a unit's sprite set consists of, with the lengths the roster dictates. */
export function requiredClips(unit: UnitId, def: RosterDefinition = ROSTER): ClipSpec[] {
  const u = def.units[unit];
  const clips: ClipSpec[] = [
    { name: 'ready', frames: READY_FRAMES, strike: null, required: true },
    { name: 'walk', frames: u.walk.clip, strike: null, required: true },
  ];
  u.attacks.forEach((attack, i) => {
    clips.push({ name: `swipe-${i + 1}`, frames: attack.clip, strike: attack.strikeFrames[0] ?? null, required: i === 0 });
  });
  clips.push({ name: 'death', frames: DEATH_FRAMES, strike: null, required: true });
  return clips;
}

/** True when the atlas carries a sprite set for `sprite` (as opposed to a legacy placeholder frame). */
export function hasSpriteSet(doc: Pick<AtlasDocument, 'frames'>, sprite: string): boolean {
  return frameKey(sprite, 'ready', 0) in doc.frames;
}

/** The number of consecutive frames `0…n−1` the atlas holds for a clip (0 when the clip is absent). */
export function clipLength(doc: Pick<AtlasDocument, 'frames'>, sprite: string, clip: SpriteClip): number {
  let n = 0;
  while (frameKey(sprite, clip, n) in doc.frames) n++;
  return n;
}

export interface ResolvedFrame {
  /** The body frame key. */
  readonly key: string;
  /** The accent frame key, or `null` when the atlas has none for this frame. */
  readonly accent: string | null;
  /** The clip actually drawn (differs from the one asked for on a fallback). */
  readonly clip: SpriteClip;
  readonly frame: number;
  /** True when the atlas lacked the clip asked for and another stood in. */
  readonly fallback: boolean;
}

/**
 * The frame to draw for a unit playing `clip` at `clipFrame`.
 *
 * - A frame past the clip's end clamps to the last one (a body keeps lying
 *   on the final death frame while `clipFrame` counts its age).
 * - A swipe the atlas lacks plays the first swipe, time-warped piecewise
 *   linearly so the two strike frames coincide: the blow still lands on
 *   the frame the simulation says.
 * - A missing walk or death falls back to `ready/0`.
 *
 * Returns `null` when the atlas has no sprite set for the unit.
 */
export function resolveFrame(
  doc: Pick<AtlasDocument, 'frames'>,
  unit: UnitId,
  clip: PlayingClip,
  clipFrame: number,
  def: RosterDefinition = ROSTER,
): ResolvedFrame | null {
  const sprite = def.units[unit].sprite;
  if (!hasSpriteSet(doc, sprite)) return null;
  const present = clipLength(doc, sprite, clip);
  const want = Math.max(0, Math.floor(clipFrame));
  if (present > 0) return pick(doc, sprite, clip, Math.min(want, present - 1), false);

  if (clip.startsWith('swipe-')) {
    const specs = requiredClips(unit, def);
    const missing = specs.find((c) => c.name === clip);
    const standIn = specs.find((c) => c.name.startsWith('swipe-') && clipLength(doc, sprite, c.name) > 0);
    if (missing && standIn) {
      const source = clipLength(doc, sprite, standIn.name);
      const frame = warpFrame(Math.min(want, missing.frames - 1), missing.frames, missing.strike, source, standIn.strike);
      return pick(doc, sprite, standIn.name, frame, true);
    }
  }
  return pick(doc, sprite, 'ready', 0, true);
}

function pick(doc: Pick<AtlasDocument, 'frames'>, sprite: string, clip: SpriteClip, frame: number, fallback: boolean): ResolvedFrame {
  const accent = accentKey(sprite, clip, frame);
  return { key: frameKey(sprite, clip, frame), accent: accent in doc.frames ? accent : null, clip, frame, fallback };
}

/**
 * Map frame `f` of an `n`-frame clip striking at `s` onto an `m`-frame clip
 * striking at `t`: linear before the strike, linear after it, so `s ↦ t`.
 * Clips without a strike map proportionally.
 */
export function warpFrame(f: number, n: number, s: number | null, m: number, t: number | null): number {
  const clamp = (v: number) => Math.max(0, Math.min(m - 1, Math.round(v)));
  if (n <= 1) return 0;
  if (s === null || t === null) return clamp((f * (m - 1)) / (n - 1));
  if (f <= s) return clamp(s === 0 ? t : (f * t) / s);
  const after = n - 1 - s;
  return clamp(after === 0 ? m - 1 : t + ((f - s) * (m - 1 - t)) / after);
}

export interface ContractProblem {
  readonly message: string;
}

/**
 * Everything wrong with `doc` as a sprite set for `unit`: a frame missing
 * from a required clip, a clip longer or shorter than the roster says, a
 * strike frame absent, an accent frame missing, no portrait, or a rect
 * outside the texture. A swipe beyond the first may be absent altogether
 * (reported by `omittedClips`, never an error), but once present it must
 * be complete.
 */
export function contractProblems(doc: AtlasDocument, unit: UnitId, def: RosterDefinition = ROSTER): ContractProblem[] {
  const sprite = def.units[unit].sprite;
  const problems: ContractProblem[] = [];
  const problem = (message: string) => problems.push({ message });
  if (!hasSpriteSet(doc, sprite)) {
    problem(`no sprite set for "${sprite}" (no frame "${frameKey(sprite, 'ready', 0)}")`);
    return problems;
  }
  if (!doc.meta) problem(`atlas with a sprite set for "${sprite}" declares no meta (scale and size)`);
  else if (!(doc.meta.scale > 0)) problem(`atlas meta.scale is ${doc.meta.scale}; expected a positive authoring scale`);

  for (const clip of requiredClips(unit, def)) {
    const length = clipLength(doc, sprite, clip.name);
    if (length === 0) {
      if (clip.required) problem(`"${sprite}" lacks clip "${clip.name}" (${clip.frames} frames expected)`);
      continue;
    }
    if (length !== clip.frames) {
      problem(`"${sprite}/${clip.name}" has ${length} frames; the roster says ${clip.frames}`);
    }
    if (clip.strike !== null && !(frameKey(sprite, clip.name, clip.strike) in doc.frames)) {
      problem(`"${sprite}/${clip.name}" has no frame ${clip.strike}, the strike frame`);
    }
    for (let n = 0; n < Math.min(length, clip.frames); n++) {
      if (!(accentKey(sprite, clip.name, n) in doc.frames)) problem(`"${sprite}" has no accent frame "${accentKey(sprite, clip.name, n)}"`);
    }
  }
  if (!(portraitKey(sprite) in doc.frames)) problem(`"${sprite}" has no portrait frame "${portraitKey(sprite)}"`);

  if (doc.meta) {
    const [width, height] = doc.meta.size;
    for (const [key, frame] of Object.entries(doc.frames)) {
      if (!key.startsWith(`${sprite}/`)) continue;
      const [x, y, w, h] = frame.rect;
      if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > width || y + h > height) {
        problem(`frame "${key}" rect [${frame.rect.join(', ')}] is not inside the ${width}×${height} texture`);
      }
      const [px, py] = frame.pivot;
      if (!(Number.isFinite(px) && Number.isFinite(py))) problem(`frame "${key}" has no usable pivot`);
    }
  }
  return problems;
}

/** The optional clips (swipes beyond the first) a sprite set leaves to the renderer's fallback. */
export function omittedClips(doc: Pick<AtlasDocument, 'frames'>, unit: UnitId, def: RosterDefinition = ROSTER): SpriteClip[] {
  const sprite = def.units[unit].sprite;
  if (!hasSpriteSet(doc, sprite)) return [];
  return requiredClips(unit, def)
    .filter((clip) => !clip.required && clipLength(doc, sprite, clip.name) === 0)
    .map((clip) => clip.name);
}
