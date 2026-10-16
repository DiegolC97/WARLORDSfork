/**
 * Units on the field as DOM sprites, reconciled by id every frame from the
 * snapshot. A sprite carries the race tint (its unit colour) and, above it,
 * the team accent layer: a pennant whose shape and value say which side
 * the unit fights for — white and pointing right for the left side, black
 * and pointing left for the right — so two armies of the same race remain
 * telling apart with colour never the only cue.
 */
import type { FrameState, Side } from '../../battle';
import { raceVisuals, type RaceId } from '../../roster';
import { fieldHeight, fieldX, laneY } from './layout';

export interface UnitLayer {
  readonly root: HTMLDivElement;
  update(frame: FrameState): void;
}

export function buildUnitLayer(parent: HTMLElement, races: Readonly<Record<Side, RaceId>>): UnitLayer {
  const root = document.createElement('div');
  root.className = 'units';
  root.dataset.role = 'units';
  parent.appendChild(root);

  const sprites = new Map<number, { el: HTMLDivElement; hp: HTMLSpanElement }>();
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
        const pennant = document.createElement('span');
        pennant.className = 'pennant';
        pennant.dataset.role = 'accent';
        const body = document.createElement('span');
        body.className = 'body';
        const hp = document.createElement('span');
        hp.className = 'hp';
        el.append(pennant, body, hp);
        root.appendChild(el);
        sprite = { el, hp };
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
      // A body fades out as the simulation says; the art slice maps clip and frame onto sprites.
      el.style.opacity = u.alpha < 1 ? u.alpha.toFixed(2) : '';
      el.classList.toggle('dead', u.phase === 'dead');
      el.classList.toggle('attacking', u.phase === 'attack');
      el.classList.toggle('flipped', u.facing === -1);
      hp.style.width = `${Math.max(0, Math.min(100, (u.hp / u.maxHp) * 100)).toFixed(0)}%`;
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
