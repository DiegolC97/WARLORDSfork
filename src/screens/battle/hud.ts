/**
 * The battle HUD: the territory bar, the five-minute dial and a charge
 * meter per side. Each part is built once and updated from a frame
 * snapshot; nothing here computes a rule — the bar draws the width the
 * simulation reports, the dial draws the frames it has left.
 */
import {
  BAR_WIDTH,
  BATTLE_LENGTH_FRAMES,
  FRAMES_PER_SECOND,
  KILLS_PER_CHARGE,
  SIDES,
  type FrameState,
  type Side,
} from '../../battle';

const SVG = 'http://www.w3.org/2000/svg';

function svgEl(name: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function div(className: string, role?: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = className;
  if (role) d.dataset.role = role;
  return d;
}

export interface Hud {
  readonly root: HTMLDivElement;
  update(frame: FrameState): void;
}

export function buildHud(parent: HTMLElement, onCharge: (side: Side) => void): Hud {
  const root = div('hud', 'hud');
  parent.appendChild(root);

  // Territory bar: 700 px wide, filled from the left edge to the simulation's bar width.
  const bar = div('territory', 'territory-bar');
  const fill = div('fill');
  const centre = div('centre');
  const leftScore = document.createElement('span');
  leftScore.className = 'score left';
  leftScore.dataset.role = 'left-score';
  const rightScore = document.createElement('span');
  rightScore.className = 'score right';
  rightScore.dataset.role = 'right-score';
  bar.append(fill, centre, leftScore, rightScore);
  root.appendChild(bar);

  // The dial: a clock face whose remaining wedge shrinks over the five minutes.
  const dial = div('dial', 'dial');
  const face = svgEl('svg', { viewBox: '0 0 40 40', width: 40, height: 40, 'aria-hidden': 'true' });
  face.appendChild(svgEl('circle', { cx: 20, cy: 20, r: 19, fill: '#f3ecd8', stroke: '#2b2622', 'stroke-width': 2 }));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    face.appendChild(
      svgEl('line', {
        x1: 20 + Math.sin(a) * 15,
        y1: 20 - Math.cos(a) * 15,
        x2: 20 + Math.sin(a) * 17,
        y2: 20 - Math.cos(a) * 17,
        stroke: '#2b2622',
        'stroke-width': i % 3 === 0 ? 2 : 1,
      }),
    );
  }
  const wedge = svgEl('path', { d: '', fill: '#c0392b', opacity: 0.85 });
  wedge.dataset.role = 'dial-wedge';
  const hand = svgEl('line', { x1: 20, y1: 20, x2: 20, y2: 5, stroke: '#2b2622', 'stroke-width': 2, 'stroke-linecap': 'round' });
  face.append(wedge, hand);
  const seconds = document.createElement('span');
  seconds.className = 'seconds';
  seconds.dataset.role = 'seconds';
  dial.append(face, seconds);
  root.appendChild(dial);

  // Charge meters: kills banked toward the next line of eight, and the control that releases it.
  const meters = {} as Record<Side, { root: HTMLDivElement; fill: HTMLDivElement; label: HTMLSpanElement; button: HTMLButtonElement }>;
  for (const side of SIDES) {
    const meter = div(`charge ${side}`, `charge-${side}`);
    meter.dataset.side = side;
    const track = div('track');
    const meterFill = div('fill');
    track.appendChild(meterFill);
    const label = document.createElement('span');
    label.className = 'label';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'release';
    button.dataset.action = `charge:${side}`;
    button.textContent = 'Charge';
    button.title = `Release the full line of eight (${side === 'left' ? 'Q' : '0'})`;
    button.addEventListener('click', () => onCharge(side));
    meter.append(track, label, button);
    root.appendChild(meter);
    meters[side] = { root: meter, fill: meterFill, label, button };
  }

  const update = (frame: FrameState) => {
    const width = Math.max(0, Math.min(BAR_WIDTH, frame.barWidth));
    fill.style.width = `${width}px`;
    bar.dataset.bar = String(frame.barWidth);
    bar.dataset.target = String(frame.barTarget);
    bar.dataset.leftScore = String(frame.leftScore);
    bar.dataset.rightScore = String(frame.rightScore);
    bar.classList.toggle('full', frame.barWidth >= BAR_WIDTH);
    bar.classList.toggle('empty', frame.barWidth <= 0);
    leftScore.textContent = String(frame.leftScore);
    rightScore.textContent = String(frame.rightScore);

    const secondsLeft = Math.ceil(frame.framesLeft / FRAMES_PER_SECOND);
    const fraction = Math.max(0, Math.min(1, frame.framesLeft / BATTLE_LENGTH_FRAMES));
    wedge.setAttribute('d', wedgePath(fraction));
    const angle = fraction * 360;
    hand.setAttribute('transform', `rotate(${angle} 20 20)`);
    dial.dataset.framesLeft = String(frame.framesLeft);
    dial.dataset.seconds = String(secondsLeft);
    dial.classList.toggle('zero', frame.framesLeft === 0);
    // The original shows the number only in the last minute.
    seconds.textContent = secondsLeft <= 60 ? String(secondsLeft) : '';

    for (const side of SIDES) {
      const s = frame.spawners[side];
      const m = meters[side];
      const banked = Math.min(KILLS_PER_CHARGE, s.chargeKills);
      m.fill.style.width = `${(banked / KILLS_PER_CHARGE) * 100}%`;
      m.root.dataset.kills = String(s.chargeKills);
      m.root.dataset.progress = (banked / KILLS_PER_CHARGE).toFixed(2);
      m.root.classList.toggle('armed', s.chargeReady);
      m.root.classList.toggle('banked', s.chargeKills >= KILLS_PER_CHARGE);
      m.label.textContent = `${banked}/${KILLS_PER_CHARGE}`;
      m.button.disabled = !s.chargeReady;
    }
  };

  return { root, update };
}

/** A pie wedge from twelve o'clock covering `fraction` of the dial, clockwise. */
function wedgePath(fraction: number): string {
  if (fraction <= 0) return '';
  if (fraction >= 1) return 'M20 20 m0 -14 a14 14 0 1 1 -0.01 0 Z';
  const a = fraction * Math.PI * 2;
  const x = 20 + Math.sin(a) * 14;
  const y = 20 - Math.cos(a) * 14;
  const large = fraction > 0.5 ? 1 : 0;
  return `M20 20 L20 6 A14 14 0 ${large} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`;
}
