/**
 * SVG drawing for the campaign map: one pointy-top hexagon per region on
 * the odd-r layout the region data describes, labels, the player's
 * holdings, and attack arrows. Pure DOM construction; the screen wires the
 * clicks and decides what state to draw.
 */
import {
  CONTESTED,
  RACE_COLOURS,
  REGIONS,
  attackOrigins,
  attackableRegions,
  blocColour,
  defenderOf,
  isHeldByPlayer,
  labelColourOn,
  region,
  type RegionId,
  type RegionOwners,
} from '../../campaign';
import { CONTESTED_LABEL, raceName, regionName } from '../../names';
import type { RaceId } from '../../save';

const SVG = 'http://www.w3.org/2000/svg';
/** Hex circumradius in SVG units. */
const SIZE = 58;
const WIDTH = Math.sqrt(3) * SIZE;
const MARGIN = 12;

export interface MapView {
  readonly owners: RegionOwners;
  /** The player's race, for the fill of held regions; `null` before a race is picked. */
  readonly playerRace: RaceId | null;
  readonly onAttack: (id: RegionId) => void;
}

export function hexCentre(col: number, row: number): { x: number; y: number } {
  return {
    x: MARGIN + WIDTH * (col + (row % 2 === 1 ? 0.5 : 0)) + WIDTH / 2,
    y: MARGIN + SIZE * 1.5 * row + SIZE,
  };
}

function hexPoints(cx: number, cy: number, r = SIZE - 2): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string> = {}): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

/** Split a name into at most two lines at the space nearest its middle. */
function wrapName(name: string): string[] {
  if (name.length <= 13 || !name.includes(' ')) return [name];
  const mid = name.length / 2;
  let best = -1;
  for (let i = 0; i < name.length; i++) {
    if (name[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  }
  return [name.slice(0, best), name.slice(best + 1)];
}

export function viewBox(): string {
  const cols = Math.max(...REGIONS.map((r) => r.col)) + 1.5;
  const rows = Math.max(...REGIONS.map((r) => r.row));
  return `0 0 ${Math.ceil(MARGIN * 2 + WIDTH * cols)} ${Math.ceil(MARGIN * 2 + SIZE * 1.5 * rows + SIZE * 2)}`;
}

/** Build the whole map SVG for the given state. Call again to redraw. */
export function buildMap(view: MapView): SVGSVGElement {
  const svg = el('svg', { viewBox: viewBox(), role: 'img' });
  svg.dataset.role = 'map';

  const defs = el('defs');
  const hatch = el('pattern', { id: 'contested-hatch', width: '8', height: '8', patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
  hatch.appendChild(el('rect', { width: '8', height: '8', fill: blocColour(CONTESTED) }));
  hatch.appendChild(el('line', { x1: '0', y1: '0', x2: '0', y2: '8', stroke: '#8a8a8a', 'stroke-width': '3' }));
  defs.appendChild(hatch);
  const marker = el('marker', { id: 'arrowhead', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
  marker.appendChild(el('path', { d: 'M0,0 L10,5 L0,10 Z', fill: '#ffffff' }));
  defs.appendChild(marker);
  svg.appendChild(defs);

  const attackable = new Set(attackableRegions(view.owners));
  const regionsLayer = el('g', { class: 'regions' });
  const arrowsLayer = el('g', { class: 'arrows' });

  for (const r of REGIONS) {
    const { x, y } = hexCentre(r.col, r.row);
    const held = isHeldByPlayer(view.owners, r.id);
    const open = attackable.has(r.id);
    const solid = held && view.playerRace ? RACE_COLOURS[view.playerRace] : blocColour(r.bloc);
    const fill = !held && r.bloc === CONTESTED ? 'url(#contested-hatch)' : solid;
    const textColour = labelColourOn(solid);

    const g = el('g', { class: `region${held ? ' held' : ''}${open ? ' attackable' : ''}` });
    g.dataset.region = r.id;
    g.dataset.bloc = r.bloc;
    g.dataset.owner = held ? 'player' : (view.owners[r.id] ?? 'none');
    if (open) g.dataset.attackable = 'true';

    const defenderLabel = held ? 'Yours' : labelFor(view.owners, r.id);
    g.dataset.defender = held ? 'player' : defenderKey(view.owners, r.id);

    g.appendChild(el('polygon', { points: hexPoints(x, y), fill }));
    const text = el('text', { x: String(x), y: String(y - 10), 'text-anchor': 'middle', fill: textColour, class: 'name' });
    const lines = wrapName(regionName(r.id));
    lines.forEach((line, i) => {
      const t = el('tspan', { x: String(x), dy: i === 0 ? '0' : '11' });
      t.textContent = line;
      text.appendChild(t);
    });
    const def = el('tspan', { x: String(x), dy: '13', class: 'defender' });
    def.textContent = held ? `⚑ ${defenderLabel}` : defenderLabel;
    text.appendChild(def);
    g.appendChild(text);

    const title = el('title');
    title.textContent = open ? `Attack ${regionName(r.id)} (${defenderLabel})` : `${regionName(r.id)} — ${defenderLabel}`;
    g.appendChild(title);

    if (open) {
      g.addEventListener('click', () => view.onAttack(r.id));
      const origin = attackOrigins(view.owners, r.id)[0];
      if (origin) arrowsLayer.appendChild(arrow(origin, r.id));
    }
    regionsLayer.appendChild(g);
  }

  svg.appendChild(regionsLayer);
  svg.appendChild(arrowsLayer);
  return svg;
}

function arrow(from: RegionId, to: RegionId): SVGLineElement {
  const a = region(from), b = region(to);
  const p = hexCentre(a.col, a.row), q = hexCentre(b.col, b.row);
  const dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len;
  const start = { x: p.x + ux * SIZE * 0.45, y: p.y + uy * SIZE * 0.45 };
  const end = { x: q.x - ux * SIZE * 0.8, y: q.y - uy * SIZE * 0.8 };
  const line = el('line', {
    x1: start.x.toFixed(1), y1: start.y.toFixed(1), x2: end.x.toFixed(1), y2: end.y.toFixed(1),
    class: 'arrow', 'marker-end': 'url(#arrowhead)',
  });
  line.dataset.arrowFrom = from;
  line.dataset.arrowTo = to;
  return line;
}

function labelFor(owners: RegionOwners, id: RegionId): string {
  const d = defenderOf(owners, id);
  return d.kind === 'race' ? raceName(d.race) : CONTESTED_LABEL;
}

function defenderKey(owners: RegionOwners, id: RegionId): string {
  const d = defenderOf(owners, id);
  return d.kind === 'race' ? d.race : CONTESTED;
}
