/**
 * Battle screen geometry — the reference layout is the original's 700 × 500
 * stage. Everything is laid out in stage pixels; the stage is then scaled by
 * the saved zoom. Field units (the simulation's x and lane) are mapped onto
 * the field band by `fieldX` / `laneY`.
 */
import { FIELD, LANE_COUNT } from '../../battle';

export const STAGE_WIDTH = 700;
export const STAGE_HEIGHT = 500;

/** The top HUD band: territory bar, dial, charge meters. */
export const HUD_TOP = { y: 0, height: 46 } as const;
/** The band the lanes occupy. */
export const FIELD_BAND = { y: 48, height: 312 } as const;
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

export const LANE_HEIGHT = FIELD_BAND.height / LANE_COUNT;

/** Stage y of a lane's baseline (units stand on it). */
export function laneY(lane: number): number {
  return FIELD_BAND.y + lane * LANE_HEIGHT - 4;
}

/** Stage x of a field x: exits at the stage edges. */
export function fieldX(x: number): number {
  return ((x - FIELD.minX) / (FIELD.maxX - FIELD.minX)) * STAGE_WIDTH;
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
