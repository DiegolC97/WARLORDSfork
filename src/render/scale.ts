/**
 * The render constant — the one place field units become pixels.
 *
 * The original draws the battlefield at `BATTLEFIELD_SCALE` (0.2458), so
 * its 2850 field units fill the 700 px stage. The game multiplies that by
 * a configurable zoom and nothing else: a lane's 150 field units are
 * `150 × 0.2458 × zoom` rendered pixels, a Spearman's 130-unit range is
 * `130 × 0.2458 × zoom`, and a unit's sprite — authored at 4× — is its
 * atlas pixels over `4 × 0.2458` field units each. At zoom 4 one field unit
 * is 0.983 px, which is why the art is drawn at 4×.
 *
 * Two consumers:
 *
 * - The engine scene (`src/render/`) is laid out **in field units**: unit
 *   entities sit at the simulation's x and lane y, sprites measure their
 *   frames in field units, and only the camera's viewport
 *   (`fieldBandOnScreen`) is in pixels. Zoom changes the viewport, never
 *   the scene.
 * - The DOM stage (`src/screens/battle/layout.ts`) is the original's
 *   700 × 500 reference layout at zoom 1, CSS-scaled by the zoom; what it
 *   places by field position (lane arrows, the backdrop's lane lines) it
 *   converts with `fieldProjection(1)`.
 *
 * Nothing here knows a sprite or a rule.
 */
import { FIELD, LANE_COUNT } from '../battle';

/** Rendered pixels per field unit at zoom 1: the original's stage scale. */
export const BATTLEFIELD_SCALE = 0.2458;

/** The render constant: rendered pixels per field unit at `zoom`. */
export function renderScale(zoom: number): number {
  return BATTLEFIELD_SCALE * zoom;
}

/** The original's reference stage, in pixels at zoom 1. */
export const STAGE_WIDTH = 700;
export const STAGE_HEIGHT = 500;

/** Field units across the stage: the battlefield from the left spawner's edge to the right's. */
export const FIELD_WIDTH_UNITS = 2850;

/**
 * The field point drawn at the stage's top-left corner. x = 0 puts the
 * spawners (50 and 2800) 12 px in from the stage edges; y = 420 puts lane
 * 1's baseline (field y 750) 81 px down, under the HUD band.
 */
export const STAGE_ORIGIN_FIELD = { x: 0, y: 420 } as const;

/**
 * The band the lanes occupy, in field units: from just above lane 1's
 * ground to a little below lane 8's baseline. This is the engine camera's
 * viewport; the HUD sits above it and the racks below.
 */
export const FIELD_BAND_UNITS = {
  left: 0,
  right: FIELD_WIDTH_UNITS,
  top: FIELD.laneY(0) + 6,
  bottom: FIELD.laneY(LANE_COUNT) + 80,
} as const;

export interface FieldProjection {
  readonly zoom: number;
  /** Rendered pixels per field unit. */
  readonly pixelsPerUnit: number;
  /** A length in field units, in rendered pixels. */
  length(units: number): number;
  /** Rendered x of a field x, from the stage's left edge. */
  x(fieldX: number): number;
  /** Rendered y of a field y, from the stage's top edge. */
  y(fieldY: number): number;
}

/** Field units → rendered pixels at `zoom`, relative to the stage's top-left corner. */
export function fieldProjection(zoom: number): FieldProjection {
  const pixelsPerUnit = renderScale(zoom);
  return {
    zoom,
    pixelsPerUnit,
    length: (units) => units * pixelsPerUnit,
    x: (fieldX) => (fieldX - STAGE_ORIGIN_FIELD.x) * pixelsPerUnit,
    y: (fieldY) => (fieldY - STAGE_ORIGIN_FIELD.y) * pixelsPerUnit,
  };
}

export interface ScreenRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Where the field band lands on a canvas of `canvasWidth × canvasHeight`
 * CSS pixels when the stage is centred and scaled by `zoom` — the engine
 * camera's viewport. The band is `FIELD_WIDTH_UNITS × renderScale(zoom)`
 * wide: 700 px at zoom 1, 2800 px at zoom 4.
 */
export function fieldBandOnScreen(zoom: number, canvasWidth: number, canvasHeight: number): ScreenRect {
  const p = fieldProjection(zoom);
  const stageLeft = canvasWidth / 2 - (STAGE_WIDTH * zoom) / 2;
  const stageTop = canvasHeight / 2 - (STAGE_HEIGHT * zoom) / 2;
  return {
    left: stageLeft + p.x(FIELD_BAND_UNITS.left),
    top: stageTop + p.y(FIELD_BAND_UNITS.top),
    width: p.length(FIELD_BAND_UNITS.right - FIELD_BAND_UNITS.left),
    height: p.length(FIELD_BAND_UNITS.bottom - FIELD_BAND_UNITS.top),
  };
}
