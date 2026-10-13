import { describe, expect, it } from 'vitest';
import { BLOC_RACES, RACES } from '../save';
import { CONTESTED_COLOUR, RACE_COLOURS, blocColour, labelColourOn } from './palette';

/**
 * Colour-vision-deficiency simulation (Machado, Oliveira & Fernandes 2009,
 * severity 1.0) applied in linear RGB, then CIEDE2000 between every pair.
 */
const SIMULATIONS: Record<string, number[][]> = {
  normal: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};

const hexToLinear = (hex: string): number[] =>
  [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });

const simulate = (m: number[][], v: number[]): number[] =>
  m.map((row) => Math.min(1, Math.max(0, row[0]! * v[0]! + row[1]! * v[1]! + row[2]! * v[2]!)));

const toLab = ([r, g, b]: number[]): [number, number, number] => {
  const x = (r! * 0.4124 + g! * 0.3576 + b! * 0.1805) / 0.95047;
  const y = r! * 0.2126 + g! * 0.7152 + b! * 0.0722;
  const z = (r! * 0.0193 + g! * 0.1192 + b! * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
};

function deltaE2000([L1, a1, b1]: number[], [L2, a2, b2]: number[]): number {
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1!, b1!), C2 = Math.hypot(a2!, b2!), Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = a1! * (1 + G), a2p = a2! * (1 + G);
  const C1p = Math.hypot(a1p, b1!), C2p = Math.hypot(a2p, b2!);
  const hue = (a: number, b: number) => (a === 0 && b === 0 ? 0 : ((Math.atan2(b, a) / rad) + 360) % 360);
  const h1 = hue(a1p, b1!), h2 = hue(a2p, b2!);
  const dL = L2! - L1!, dC = C2p - C1p;
  let dh = 0;
  if (C1p * C2p !== 0) dh = Math.abs(h2 - h1) <= 180 ? h2 - h1 : h2 - h1 > 180 ? h2 - h1 - 360 : h2 - h1 + 360;
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh / 2) * rad);
  const Lb = (L1! + L2!) / 2, Cbp = (C1p + C2p) / 2;
  let hb: number;
  if (C1p * C2p === 0) hb = h1 + h2;
  else if (Math.abs(h1 - h2) <= 180) hb = (h1 + h2) / 2;
  else hb = h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2;
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hb - 275) / 25) ** 2));
  const RC = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2);
  const SC = 1 + 0.045 * Cbp, SH = 1 + 0.015 * Cbp * T;
  const RT = -Math.sin(2 * dTheta * rad) * RC;
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}

/** Below this, two map fills would be easy to confuse at a glance. */
const MIN_DELTA_E = 10;

const minPairDistance = (colours: Record<string, string>, matrix: number[][]) => {
  const labs = Object.entries(colours).map(([k, hex]) => [k, toLab(simulate(matrix, hexToLinear(hex)))] as const);
  let min = { d: Infinity, pair: '' };
  for (let i = 0; i < labs.length; i++) {
    for (let j = i + 1; j < labs.length; j++) {
      const d = deltaE2000(labs[i]![1], labs[j]![1]);
      if (d < min.d) min = { d, pair: `${labs[i]![0]} vs ${labs[j]![0]}` };
    }
  }
  return min;
};

describe('map palette (AC 9)', () => {
  const required: Record<string, string> = Object.fromEntries([
    ...BLOC_RACES.map((race) => [race, RACE_COLOURS[race]]),
    ['contested', CONTESTED_COLOUR],
  ]);

  it('six bloc colours plus the contested colour stay distinguishable under protanopia, deuteranopia and tritanopia', () => {
    expect(Object.keys(required)).toHaveLength(7);
    for (const [name, matrix] of Object.entries(SIMULATIONS)) {
      const { d, pair } = minPairDistance(required, matrix);
      expect(d, `${name}: closest pair ${pair} has ΔE2000 ${d.toFixed(1)}`).toBeGreaterThanOrEqual(MIN_DELTA_E);
    }
  });

  it('the unlockable race\'s colour is also distinct from all seven', () => {
    const all = { ...required, race7: RACE_COLOURS.race7 };
    for (const [name, matrix] of Object.entries(SIMULATIONS)) {
      const { d, pair } = minPairDistance(all, matrix);
      expect(d, `${name}: closest pair ${pair} has ΔE2000 ${d.toFixed(1)}`).toBeGreaterThanOrEqual(MIN_DELTA_E);
    }
  });

  it('every race has a colour and bloc fills resolve', () => {
    for (const race of RACES) expect(RACE_COLOURS[race]).toMatch(/^#[0-9A-F]{6}$/i);
    expect(blocColour('race3')).toBe(RACE_COLOURS.race3);
    expect(blocColour('contested')).toBe(CONTESTED_COLOUR);
    expect(labelColourOn('#F0E442')).toBe('#111111');
    expect(labelColourOn('#0072B2')).toBe('#FFFFFF');
  });
});
