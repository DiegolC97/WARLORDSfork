/**
 * Units on the field as DOM sprites, reconciled by id every frame from the
 * snapshot.
 *
 * A unit whose race atlas carries a sprite set (the atlas contract,
 * `src/roster/atlas.ts`) is drawn from it: the body frame the simulation's
 * clip and frame resolve to, positioned so the frame's pivot — the feet —
 * sits on the lane baseline, mirrored when the unit faces left. Above the
 * body sits the **accent layer**: the atlas's untinted pennant frame used
 * as a mask and filled with the side's value — white for the left side,
 * black for the right — so two armies of the same race remain telling
 * apart with colour never the only cue. A unit without a sprite set keeps
 * the placeholder: a block in the race tint with a CSS pennant.
 */
import type { FrameState, Side } from '../../battle';
import { raceVisuals, resolveFrame, type AtlasDocument, type RaceId } from '../../roster';
import type { AtlasSource } from '../../ui/portrait';
import { fieldHeight, fieldX, laneY } from './layout';

export interface UnitLayer {
  readonly root: HTMLDivElement;
  update(frame: FrameState): void;
}

interface Sprite {
  el: HTMLDivElement;
  body: HTMLSpanElement;
  accent: HTMLSpanElement;
  hp: HTMLSpanElement;
  /** The frame key drawn last, so styles are only rewritten when it changes. */
  key: string | null;
}

export function buildUnitLayer(
  parent: HTMLElement,
  races: Readonly<Record<Side, RaceId>>,
  atlases: Readonly<Record<Side, AtlasSource>> = { left: { atlas: null, atlasImage: null }, right: { atlas: null, atlasImage: null } },
): UnitLayer {
  const root = document.createElement('div');
  root.className = 'units';
  root.dataset.role = 'units';
  parent.appendChild(root);

  const sprites = new Map<number, Sprite>();
  const projectiles = new Map<number, HTMLSpanElement>();
  const tints: Record<Side, string> = { left: raceVisuals(races.left).tint, right: raceVisuals(races.right).tint };

  const update = (frame: FrameState) => {
    const seen = new Set<number>();
    for (const u of frame.units) {
      seen.add(u.id);
      let sprite = sprites.get(u.id);
      if (!sprite) {
        const el = document.createElement('div');
        el.className = `unit ${u.side}`;
        el.dataset.unitId = String(u.id);
        el.dataset.side = u.side;
        el.dataset.unit = String(u.unit);
        el.dataset.lane = String(u.lane);
        el.dataset.accent = u.side === 'left' ? 'pennant-white-right' : 'pennant-black-left';
        el.style.setProperty('--tint', tints[u.side]);
        el.style.setProperty('--accent', u.side === 'left' ? '#fff' : '#000');
        el.style.setProperty('--accent-halo', u.side === 'left' ? '#000' : '#fff');
        const accent = document.createElement('span');
        accent.className = 'accent pennant';
        accent.dataset.role = 'accent';
        const body = document.createElement('span');
        body.className = 'body';
        const hp = document.createElement('span');
        hp.className = 'hp';
        el.append(body, accent, hp);
        root.appendChild(el);
        sprite = { el, body, accent, hp, key: null };
        sprites.set(u.id, sprite);
      }
      const { el, hp } = sprite;
      el.style.left = `${fieldX(u.x).toFixed(1)}px`;
      el.style.top = `${laneY(u.lane)}px`;
      el.style.zIndex = String(u.lane);
      el.dataset.x = u.x.toFixed(0);
      el.dataset.phase = u.phase;
      el.dataset.clip = u.clip;
      el.dataset.clipFrame = String(u.clipFrame);
      // A body fades out as the simulation says.
      el.style.opacity = u.alpha < 1 ? u.alpha.toFixed(2) : '';
      el.classList.toggle('dead', u.phase === 'dead');
      el.classList.toggle('attacking', u.phase === 'attack');
      el.classList.toggle('flipped', u.facing === -1);
      hp.style.width = `${Math.max(0, Math.min(100, (u.hp / u.maxHp) * 100)).toFixed(0)}%`;
      drawFrame(sprite, atlases[u.side], u.unit, u.clip, u.clipFrame);
    }
    for (const [id, { el }] of sprites) {
      if (!seen.has(id)) {
        el.remove();
        sprites.delete(id);
      }
    }

    const seenProjectiles = new Set<number>();
    for (const p of frame.projectiles) {
      seenProjectiles.add(p.id);
      let el = projectiles.get(p.id);
      if (!el) {
        el = document.createElement('span');
        el.className = `projectile ${p.kind} ${p.side}`;
        el.dataset.projectileId = String(p.id);
        root.appendChild(el);
        projectiles.set(p.id, el);
      }
      el.style.left = `${fieldX(p.x).toFixed(1)}px`;
      el.style.top = `${(laneY(p.lane) - fieldHeight(p.y)).toFixed(1)}px`;
      el.classList.toggle('flipped', p.facing === -1);
    }
    for (const [id, el] of projectiles) {
      if (!seenProjectiles.has(id)) {
        el.remove();
        projectiles.delete(id);
      }
    }
  };

  return { root, update };
}

/** Resolve the unit's clip and frame against the side's atlas and apply the frame, or fall back to the placeholder block. */
function drawFrame(sprite: Sprite, source: AtlasSource, unit: Parameters<typeof resolveFrame>[1], clip: Parameters<typeof resolveFrame>[2], clipFrame: number): void {
  const { atlas, atlasImage } = source;
  const resolved = atlas && atlasImage ? resolveFrame(atlas, unit, clip, clipFrame) : null;
  const { el, body, accent } = sprite;
  if (!resolved) {
    if (sprite.key !== null || !el.classList.contains('placeholder')) {
      el.classList.remove('sprite');
      el.classList.add('placeholder');
      body.removeAttribute('style');
      accent.removeAttribute('style');
      delete el.dataset.frame;
      sprite.key = null;
    }
    return;
  }
  if (resolved.key === sprite.key) return;
  sprite.key = resolved.key;
  el.classList.add('sprite');
  el.classList.remove('placeholder');
  el.dataset.frame = resolved.key;
  el.dataset.fallback = resolved.fallback ? 'true' : 'false';
  placeFrame(body, atlas!, atlasImage!, resolved.key, 'background');
  if (resolved.accent) {
    accent.hidden = false;
    placeFrame(accent, atlas!, atlasImage!, resolved.accent, 'mask');
  } else {
    accent.hidden = true;
  }
}

/**
 * Size and position `el` so the frame's pivot lands on the element's
 * parent origin (the feet on the baseline), at 1× (atlas pixels divided by
 * the authoring scale). The frame is shown either as the background image
 * (body) or as a mask over the element's background colour (accent).
 */
function placeFrame(el: HTMLSpanElement, atlas: AtlasDocument, image: string, key: string, mode: 'background' | 'mask'): void {
  const frame = atlas.frames[key];
  if (!frame) return;
  const scale = atlas.meta?.scale ?? 1;
  const [tw, th] = atlas.meta?.size ?? textureExtent(atlas);
  const [x, y, w, h] = frame.rect;
  const [px, py] = frame.pivot;
  const toPx = (v: number) => `${(v / scale).toFixed(2)}px`;
  el.style.width = toPx(w);
  el.style.height = toPx(h);
  el.style.left = toPx(-px * w);
  el.style.top = toPx(-py * h);
  const size = `${toPx(tw)} ${toPx(th)}`;
  const position = `${toPx(-x)} ${toPx(-y)}`;
  if (mode === 'background') {
    el.style.backgroundImage = `url(${image})`;
    el.style.backgroundSize = size;
    el.style.backgroundPosition = position;
  } else {
    el.style.setProperty('mask-image', `url(${image})`);
    el.style.setProperty('mask-size', size);
    el.style.setProperty('mask-position', position);
    el.style.setProperty('-webkit-mask-image', `url(${image})`);
    el.style.setProperty('-webkit-mask-size', size);
    el.style.setProperty('-webkit-mask-position', position);
  }
}

function textureExtent(atlas: AtlasDocument): [number, number] {
  let w = 1;
  let h = 1;
  for (const f of Object.values(atlas.frames)) {
    w = Math.max(w, f.rect[0] + f.rect[2]);
    h = Math.max(h, f.rect[1] + f.rect[3]);
  }
  return [w, h];
}
