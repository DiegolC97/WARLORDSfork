/**
 * The Spearman art module: which roster unit it draws, which contract clips
 * it provides, and how to render a frame and the portrait crop. The builder
 * (`scripts/build-unit-atlases.mjs`) reads the clip lengths and strike
 * frames from the roster, never from here.
 */
import { renderFrame, solve, tipX } from './rig.mjs';
import { poseFor } from './clips.mjs';
import { FRAME } from './rig.mjs';

export const PORTRAIT_SIZE = 96;

export default {
  unit: 0,
  sprite: 'spearman',
  /** Contract clips this art provides; `swipe-4` (the restored shield bash) is left to the renderer's fallback. */
  clips: ['ready', 'walk', 'swipe-1', 'swipe-2', 'swipe-3', 'death'],
  render: renderFrame,
  /** The spear tip's x on a frame: the builder checks it peaks on each swipe's strike frame. */
  reach: tipX,
  /** Head and shoulders of the ready pose, a square of `PORTRAIT_SIZE` at 4×, pivot at its centre. */
  portrait(variant) {
    const spec = { name: 'ready', frames: 2, strike: null };
    const { body } = renderFrame(variant, spec, 0);
    const j = solve(variant, poseFor(spec, 0));
    const cx = FRAME.centreX + j.head[0] - 2 * j.h;
    const cy = FRAME.baseline - (j.head[1] - j.headR * 0.9);
    const half = PORTRAIT_SIZE / 2;
    return { canvas: body.crop(Math.round(cx - half), Math.round(cy - half), PORTRAIT_SIZE, PORTRAIT_SIZE), pivot: [half, half] };
  },
};
