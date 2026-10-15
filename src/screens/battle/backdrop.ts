/**
 * The battlefield backdrop as inline SVG sized to the stage: sky and
 * horizon, a castle on the left skyline, a tree line on the right, and the
 * field band with its eight faint lane lines. Art-free on purpose: the art
 * slice swaps the drawing for textures at the same stage coordinates.
 */
import { LANE_COUNT } from '../../battle';
import { FIELD_BAND, LANE_HEIGHT, STAGE_HEIGHT, STAGE_WIDTH } from './layout';

const SVG = 'http://www.w3.org/2000/svg';

function el(name: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export function buildBackdrop(): SVGSVGElement {
  const svg = el('svg', {
    viewBox: `0 0 ${STAGE_WIDTH} ${STAGE_HEIGHT}`,
    width: STAGE_WIDTH,
    height: STAGE_HEIGHT,
    class: 'backdrop',
    'aria-hidden': 'true',
  }) as SVGSVGElement;
  svg.dataset.role = 'backdrop';

  const horizon = FIELD_BAND.y + 2;
  // Sky above the horizon.
  svg.appendChild(el('rect', { x: 0, y: 0, width: STAGE_WIDTH, height: horizon, fill: '#9fb7c9' }));
  // Distant hills.
  svg.appendChild(
    el('path', {
      d: `M0 ${horizon} C 120 ${horizon - 28}, 260 ${horizon - 6}, 380 ${horizon - 18} S 620 ${horizon - 4}, 700 ${horizon - 16} L700 ${horizon} Z`,
      fill: '#6f8a6c',
    }),
  );
  // Castle on the left skyline, kept under the HUD's bar.
  const castle = el('g', { fill: '#4d4a52', 'data-role': 'castle' });
  castle.appendChild(el('rect', { x: 150, y: horizon - 16, width: 60, height: 16 }));
  castle.appendChild(el('rect', { x: 144, y: horizon - 26, width: 12, height: 26 }));
  castle.appendChild(el('rect', { x: 204, y: horizon - 26, width: 12, height: 26 }));
  castle.appendChild(el('rect', { x: 172, y: horizon - 30, width: 16, height: 30 }));
  for (const x of [144, 151, 204, 211]) castle.appendChild(el('rect', { x, y: horizon - 30, width: 4, height: 4 }));
  for (const x of [172, 178, 184]) castle.appendChild(el('rect', { x, y: horizon - 34, width: 4, height: 4 }));
  svg.appendChild(castle);
  // Tree line on the right skyline.
  const trees = el('g', { fill: '#3f5f3a', 'data-role': 'tree-line' });
  for (let i = 0; i < 11; i++) {
    const x = 420 + i * 22;
    const h = 12 + ((i * 5) % 8);
    trees.appendChild(el('path', { d: `M${x} ${horizon} L${x + 10} ${horizon - h} L${x + 20} ${horizon} Z` }));
  }
  svg.appendChild(trees);
  // The field: eight lanes with faint separators.
  svg.appendChild(el('rect', { x: 0, y: FIELD_BAND.y, width: STAGE_WIDTH, height: FIELD_BAND.height, fill: '#5e7f45' }));
  for (let lane = 1; lane <= LANE_COUNT; lane++) {
    const y = FIELD_BAND.y + lane * LANE_HEIGHT;
    svg.appendChild(el('line', { x1: 0, y1: y, x2: STAGE_WIDTH, y2: y, stroke: '#4c6a38', 'stroke-width': 1 }));
  }
  // The ground under the racks and footer.
  svg.appendChild(
    el('rect', { x: 0, y: FIELD_BAND.y + FIELD_BAND.height, width: STAGE_WIDTH, height: STAGE_HEIGHT - FIELD_BAND.y - FIELD_BAND.height, fill: '#2b2622' }),
  );
  return svg;
}
