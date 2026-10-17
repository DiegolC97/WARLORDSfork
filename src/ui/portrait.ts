/**
 * A unit's portrait for the spawner rack and the shop's army rack. With a
 * sprite set in the race atlas (the atlas contract, `src/roster/atlas.ts`)
 * it is the `<sprite>/portrait` crop — head and shoulders of the ready
 * pose — scaled into the rack's box over the race tint. Without one (the
 * placeholder atlas) it is the legacy frame blended over the tint with a
 * two-letter glyph so the unit stays identifiable. Shared by both racks so
 * they read the same atlas json and agree on how a unit looks.
 */
import type { LoadedAssets } from '../assets/loader';
import { hasSpriteSet, portraitKey, type AtlasDocument, type UnitId } from '../roster';

/** The atlas json as the loader parses it. */
export type AtlasJson = AtlasDocument;

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
  const art = atlas && hasSpriteSet(atlas, frameName) ? portraitKey(frameName) : null;
  const frame = atlas?.frames[art ?? frameName];
  if (frame && atlas && atlasImage) {
    const [x, y, w, h] = frame.rect;
    const [tw, th] = atlas.meta?.size ?? textureExtent(atlas);
    const img = document.createElement('span');
    img.className = 'sprite';
    img.style.backgroundImage = `url(${atlasImage})`;
    // Percentages scale the frame to the box whatever the box's size: the image is `tw / w` boxes wide,
    // and a position of `x / (tw − w)` of the slack lands the frame's left edge on the box's.
    img.style.backgroundSize = `${((tw / w) * 100).toFixed(3)}% ${((th / h) * 100).toFixed(3)}%`;
    img.style.backgroundPosition = `${tw - w > 0 ? ((x / (tw - w)) * 100).toFixed(4) : 0}% ${th - h > 0 ? ((y / (th - h)) * 100).toFixed(4) : 0}%`;
    portrait.appendChild(img);
  }
  if (art) {
    portrait.classList.add('art');
    portrait.dataset.frame = art;
  } else {
    const initial = document.createElement('span');
    initial.className = 'initial';
    initial.textContent = initialsOf(name, unit);
    portrait.appendChild(initial);
  }
  return portrait;
}

/** A two-letter glyph so a portrait is identifiable while the atlas is a placeholder. */
export function initialsOf(name: string, unit: UnitId): string {
  const words = name.split(/\s+/).filter(Boolean);
  const last = words[words.length - 1] ?? String(unit);
  return last.slice(0, 2).toUpperCase();
}

/** The texture size implied by the frames, for an atlas without `meta` (the placeholder). */
function textureExtent(atlas: AtlasJson): [number, number] {
  let w = 1;
  let h = 1;
  for (const f of Object.values(atlas.frames)) {
    w = Math.max(w, f.rect[0] + f.rect[2]);
    h = Math.max(h, f.rect[1] + f.rect[3]);
  }
  return [w, h];
}
