/**
 * A unit's portrait: its frame in the race atlas drawn over the race tint,
 * with a two-letter glyph on top so the unit stays identifiable while the
 * atlas is a placeholder. Shared by the battle screen's spawner rack and
 * the shop's army rack, so both read the same atlas json and agree on how
 * a unit looks.
 */
import type { LoadedAssets } from '../assets/loader';
import type { UnitId } from '../roster';

/** The atlas json as PlayCanvas parses it: frames keyed by name with a rect in grid units. */
export interface AtlasJson {
  readonly texture: string;
  readonly frames: Readonly<Record<string, { readonly rect: readonly [number, number, number, number] }>>;
}

export interface AtlasSource {
  /** Parsed atlas, or `null` when it is not available (headless). */
  readonly atlas: AtlasJson | null;
  /** Url of the atlas image, resolved from the atlas json's `texture`. */
  readonly atlasImage: string | null;
}

export const NO_ATLAS: AtlasSource = { atlas: null, atlasImage: null };

/** The manifest id a screen declares an atlas json under. */
export function atlasAssetId(url: string): string {
  return `atlas:${url}`;
}

/** The atlas at `url` from a screen's loaded manifest, when the host actually parsed it. */
export function atlasFromAssets(assets: LoadedAssets, url: string | undefined): AtlasSource {
  if (!url || !assets.has(atlasAssetId(url))) return NO_ATLAS;
  const resource = assets.get<unknown>(atlasAssetId(url));
  if (!isAtlas(resource)) return NO_ATLAS;
  const dir = url.slice(0, url.lastIndexOf('/') + 1);
  return { atlas: resource, atlasImage: `${dir}${resource.texture}` };
}

function isAtlas(v: unknown): v is AtlasJson {
  return typeof v === 'object' && v !== null && 'frames' in v && typeof (v as AtlasJson).frames === 'object' && typeof (v as AtlasJson).texture === 'string';
}

export function buildPortrait(unit: UnitId, frameName: string, tint: string, source: AtlasSource, name: string): HTMLSpanElement {
  const { atlas, atlasImage } = source;
  const portrait = document.createElement('span');
  portrait.className = 'portrait';
  portrait.dataset.role = 'portrait';
  portrait.dataset.frame = frameName;
  portrait.style.background = tint;
  const frame = atlas?.frames[frameName];
  if (frame && atlasImage) {
    const [col, row, w, h] = frame.rect;
    const cols = Math.max(...Object.values(atlas.frames).map((f) => f.rect[0] + f.rect[2]));
    const rows = Math.max(...Object.values(atlas.frames).map((f) => f.rect[1] + f.rect[3]));
    const img = document.createElement('span');
    img.className = 'sprite';
    img.style.backgroundImage = `url(${atlasImage})`;
    img.style.backgroundSize = `${(cols / w) * 100}% ${(rows / h) * 100}%`;
    img.style.backgroundPosition = `${cols - w > 0 ? (col / (cols - w)) * 100 : 0}% ${rows - h > 0 ? (row / (rows - h)) * 100 : 0}%`;
    portrait.appendChild(img);
  }
  const initial = document.createElement('span');
  initial.className = 'initial';
  initial.textContent = initialsOf(name, unit);
  portrait.appendChild(initial);
  return portrait;
}

/** A two-letter glyph so a portrait is identifiable while the atlas is a placeholder. */
export function initialsOf(name: string, unit: UnitId): string {
  const words = name.split(/\s+/).filter(Boolean);
  const last = words[words.length - 1] ?? String(unit);
  return last.slice(0, 2).toUpperCase();
}
