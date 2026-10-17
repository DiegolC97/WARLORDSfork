/**
 * The field view — the camera that turns the field-unit scene into pixels.
 *
 * The scene is in field units: world x is the simulation's x, world y is
 * minus the simulation's y (the engine's y points up, the field's down),
 * world z is depth. An orthographic camera looks at the field band
 * (`FIELD_BAND_UNITS`) with an ortho height of half the band, so what it
 * sees never changes; its viewport on the canvas is the band's rectangle at
 * the current zoom (`fieldBandOnScreen`), so the render constant decides
 * only how many pixels the band gets. It clears its viewport to the ground
 * colour and draws the eight lane lines under everything.
 */
import * as pc from 'playcanvas';
import { FIELD, LANE_COUNT } from '../battle';
import { FIELD_BAND_UNITS, FIELD_WIDTH_UNITS, fieldBandOnScreen } from './scale';
import { createFlatSprites, type FlatSprites } from './textures';

/** The camera's distance from the field plane; everything drawn sits between z 0 and `DEPTH_RANGE`. */
export const CAMERA_Z = 1000;
export const DEPTH_RANGE = 200;
/** World z of a lane's units: lane 1 nearest the camera, each lane a step further back, so lower lanes occlude higher ones. */
export function laneDepth(lane: number): number {
  return (LANE_COUNT - lane) * 10;
}
/** World z of the lane lines and the ground: behind every unit. */
export const GROUND_DEPTH = -20;

export const GROUND_COLOUR = '#5e7f45';
const LANE_LINE_COLOUR = '#4c6a38';
/** A lane line's thickness in field units: one pixel at zoom 1. */
const LANE_LINE_UNITS = 4;

/** World position of a field point at depth `z`. */
export function fieldToWorld(x: number, y: number, z = 0, out = new pc.Vec3()): pc.Vec3 {
  return out.set(x, -y, z);
}

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface FieldView {
  readonly zoom: number;
  readonly camera: pc.Entity;
  readonly flat: FlatSprites;
  /** Place the viewport on the canvas for its current client size; called every frame, cheap when nothing changed. */
  layout(): void;
  /** Where a field point lands on the canvas, in CSS pixels from its top-left corner. */
  toScreen(fieldX: number, fieldY: number): ScreenPoint;
  destroy(): void;
}

export function createFieldView(app: pc.AppBase, root: pc.Entity, zoom: number): FieldView {
  const device = app.graphicsDevice;
  const flat = createFlatSprites(device);

  const bandWidth = FIELD_BAND_UNITS.right - FIELD_BAND_UNITS.left;
  const bandHeight = FIELD_BAND_UNITS.bottom - FIELD_BAND_UNITS.top;
  const camera = new pc.Entity('field-camera', app);
  camera.addComponent('camera', {
    projection: pc.PROJECTION_ORTHOGRAPHIC,
    orthoHeight: bandHeight / 2,
    nearClip: 1,
    farClip: CAMERA_Z + DEPTH_RANGE,
    priority: 1,
    clearColor: new pc.Color().fromString(GROUND_COLOUR),
    clearColorBuffer: true,
    clearDepthBuffer: true,
  });
  camera.setPosition(fieldToWorld(FIELD_BAND_UNITS.left + bandWidth / 2, FIELD_BAND_UNITS.top + bandHeight / 2, CAMERA_Z));
  root.addChild(camera);

  const lines = new pc.Entity('lane-lines', app);
  root.addChild(lines);
  const lineColour = new pc.Color().fromString(LANE_LINE_COLOUR);
  for (let lane = 1; lane <= LANE_COUNT; lane++) {
    const line = new pc.Entity(`lane-line-${lane}`, app);
    line.addComponent('sprite', { type: pc.SPRITETYPE_SIMPLE, color: lineColour });
    line.sprite!.sprite = flat.quad;
    line.setLocalScale(FIELD_WIDTH_UNITS, LANE_LINE_UNITS, 1);
    line.setPosition(fieldToWorld(FIELD_WIDTH_UNITS / 2, FIELD.laneY(lane) + LANE_LINE_UNITS / 2, GROUND_DEPTH));
    lines.addChild(line);
  }

  let laidOut = { width: -1, height: -1 };
  const layout = () => {
    const { width, height } = device.clientRect;
    if (width === laidOut.width && height === laidOut.height) return;
    laidOut = { width, height };
    if (!(width > 0 && height > 0)) return;
    const band = fieldBandOnScreen(zoom, width, height);
    // The engine's rect is normalised with y from the bottom.
    camera.camera!.rect = new pc.Vec4(band.left / width, 1 - (band.top + band.height) / height, band.width / width, band.height / height);
  };
  layout();

  const scratch = new pc.Vec3();
  return {
    zoom,
    camera,
    flat,
    layout,
    toScreen(fieldX, fieldY) {
      layout();
      const p = camera.camera!.worldToScreen(fieldToWorld(fieldX, fieldY, 0, scratch), scratch);
      return { x: p.x, y: p.y };
    },
    destroy() {
      lines.destroy();
      camera.destroy();
      flat.destroy();
    },
  };
}
