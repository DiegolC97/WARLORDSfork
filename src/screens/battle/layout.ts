/**
 * Battle screen geometry — the DOM side of the original's 700 × 500 stage.
 * The HUD, rack and footer bands are laid out in stage pixels at zoom 1 and
 * the stage is CSS-scaled by the saved zoom. Anything placed by a field
 * position (lane arrows, the backdrop's lane lines) goes through the render
 * constant (`src/render/scale.ts`) at zoom 1, so it lines up with the
 * engine's field band, which the camera scales by the same zoom.
 */
import { FIELD } from '../../battle';
import { FIELD_BAND_UNITS, STAGE_HEIGHT, STAGE_WIDTH, fieldProjection } from '../../render/scale';

export { STAGE_HEIGHT, STAGE_WIDTH };

/** The stage at zoom 1: field units → stage pixels. */
const stage = fieldProjection(1);

/** The top HUD band: territory bar, dial, charge meters. */
export const HUD_TOP = { y: 0, height: 46 } as const;
/** The band the lanes occupy — the engine camera's viewport — in stage pixels. */
export const FIELD_BAND = {
  y: stage.y(FIELD_BAND_UNITS.top),
  height: stage.length(FIELD_BAND_UNITS.bottom - FIELD_BAND_UNITS.top),
} as const;
/** The spawner racks. */
export const RACK_BAND = { y: 364, height: 100 } as const;
/** The footer controls. */
export const FOOTER_BAND = { y: 466, height: 34 } as const;

/** Horizontal room a side's rack may use, and the gap between its buttons. */
export const RACK_SIDE_WIDTH = 342;
export const RACK_GAP = 4;
export const RACK_MARGIN = 6;
/** Buttons per rack row before wrapping to a second row. */
export const RACK_MAX_COLUMNS = 4;
export const RACK_HEADER_HEIGHT = 14;
export const RACK_BUTTON_HEIGHT = 41;
export const RACK_BUTTON_MAX_WIDTH = 120;

/** Stage pixels between lane baselines: 150 field units. */
export const LANE_HEIGHT = stage.length(150);

/** Stage y of a lane's baseline (units stand on it). */
export function laneY(lane: number): number {
  return stage.y(FIELD.laneY(lane));
}

/** Stage pixels above a lane's baseline for a field height (a projectile's `y`). */
export function fieldHeight(y: number): number {
  return stage.length(y);
}

/** Stage x of a field x. */
export function fieldX(x: number): number {
  return stage.x(x);
}

export interface RackGrid {
  readonly columns: number;
  readonly rows: number;
  readonly buttonWidth: number;
  readonly buttonHeight: number;
}

/**
 * How `count` buttons (1–8) share a side's rack: at most four per row, equal
 * widths from the side's allotted width, never wider than the cap, so the
 * eight-unit campaign army and the five-unit two-player army both fit.
 */
export function rackGrid(count: number): RackGrid {
  const n = Math.max(1, count);
  const rows = Math.ceil(n / RACK_MAX_COLUMNS);
  const columns = Math.ceil(n / rows);
  const buttonWidth = Math.min(RACK_BUTTON_MAX_WIDTH, Math.floor((RACK_SIDE_WIDTH - RACK_GAP * (columns - 1)) / columns));
  return { columns, rows, buttonWidth, buttonHeight: RACK_BUTTON_HEIGHT };
}
