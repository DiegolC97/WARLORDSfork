/**
 * The render constant (AC 1, AC 2): at zoom 1 the battlefield is 700 px
 * wide, lanes sit 36.9 px apart and a Spearman's range is 32 px; at zoom 4
 * every one of those is exactly four times larger.
 */
import { describe, expect, it } from 'vitest';
import { FIELD, LANE_COUNT } from '../battle';
import { unitStats } from '../roster';
import { BATTLEFIELD_SCALE, FIELD_WIDTH_UNITS, STAGE_WIDTH, fieldBandOnScreen, fieldProjection, renderScale } from './scale';

const SPEARMAN = 0;

describe('the render constant', () => {
  it('is the battlefield scale times the zoom', () => {
    expect(renderScale(1)).toBe(BATTLEFIELD_SCALE);
    expect(renderScale(4)).toBeCloseTo(4 * BATTLEFIELD_SCALE, 12);
    expect(fieldProjection(0.75).pixelsPerUnit).toBeCloseTo(0.75 * BATTLEFIELD_SCALE, 12);
  });

  it('at zoom 1 the battlefield measures 700 px, lanes sit 36.9 px apart and the Spearman reaches 32 px (AC 1)', () => {
    const p = fieldProjection(1);
    expect(Math.abs(p.length(FIELD_WIDTH_UNITS) - STAGE_WIDTH)).toBeLessThan(1);
    expect(Math.abs(fieldBandOnScreen(1, 1400, 900).width - 700)).toBeLessThan(1);
    for (let lane = 1; lane < LANE_COUNT; lane++) {
      expect(p.y(FIELD.laneY(lane + 1)) - p.y(FIELD.laneY(lane))).toBeCloseTo(36.9, 1);
    }
    expect(unitStats(SPEARMAN).range).toBe(130);
    expect(p.length(unitStats(SPEARMAN).range)).toBeCloseTo(32, 0);
  });

  it('zoom 4 scales the battlefield, the lane spacing and every length by exactly four (AC 2)', () => {
    const one = fieldProjection(1);
    const four = fieldProjection(4);
    expect(four.length(FIELD_WIDTH_UNITS)).toBeCloseTo(4 * one.length(FIELD_WIDTH_UNITS), 9);
    expect(fieldBandOnScreen(4, 4000, 3000).width).toBeCloseTo(4 * fieldBandOnScreen(1, 4000, 3000).width, 9);
    expect(fieldBandOnScreen(4, 4000, 3000).height).toBeCloseTo(4 * fieldBandOnScreen(1, 4000, 3000).height, 9);
    for (let lane = 1; lane <= LANE_COUNT; lane++) {
      expect(four.y(FIELD.laneY(lane))).toBeCloseTo(4 * one.y(FIELD.laneY(lane)), 9);
    }
    expect(four.x(FIELD.rightSpawnX) - four.x(FIELD.leftSpawnX)).toBeCloseTo(4 * (one.x(FIELD.rightSpawnX) - one.x(FIELD.leftSpawnX)), 9);
    expect(four.length(unitStats(SPEARMAN).range)).toBeCloseTo(4 * one.length(unitStats(SPEARMAN).range), 9);
  });

  it('the field band is centred on the canvas with the stage', () => {
    const band = fieldBandOnScreen(1, 1400, 900);
    expect(band.left).toBeCloseTo(350, 6);
    expect(band.left + band.width / 2).toBeCloseTo(700.27, 1);
    // Lane 1's baseline lies under the HUD band and lane 8's above the racks, in the stage's 700 × 500 frame.
    const p = fieldProjection(1);
    expect(p.y(FIELD.laneY(1))).toBeGreaterThan(46);
    expect(p.y(FIELD.laneY(LANE_COUNT))).toBeLessThan(364);
  });
});
