/**
 * The Spearman's pose set — one function per clip, returning the pose for
 * a frame. Every race variant plays exactly these poses with these
 * timings; a variant only offsets them (`stance`) and changes proportions
 * and parts (see `rig.mjs`).
 *
 * Pose space: the unit faces +x; angles are radians. Legs and arms are
 * absolute angles from straight down, positive swinging forward. `torso`
 * is the lean from straight up, positive forward. `spear` is the shaft's
 * direction with y up (π/2 = vertical, 0 = thrust straight ahead).
 * `grip` is where the front hand holds the shaft, as a fraction from the
 * butt. `hipX`/`hipY` are the hip joint in rig pixels (y up, feet at 0).
 */
import { deg, lerp, smooth } from '../../lib/geometry.mjs';

export const READY_POSE = Object.freeze({
  hipX: 0,
  hipY: 52,
  torso: 0.06,
  head: 0,
  legF: { thigh: 0.1, shin: 0.05 },
  legB: { thigh: -0.12, shin: -0.08 },
  armF: { upper: 0.75, fore: -0.1 },
  armB: { upper: -0.3, fore: -0.9 },
  spear: deg(70),
  grip: 0.45,
  /** How far the pennant streams (0 limp … 1 fully out). */
  flutter: 0,
  /** Drives the pennant's wave and the plume's sway; identical poses with the same phase render identical pixels. */
  phase: 0,
});

const mix = (a, b, t) => {
  const out = {};
  for (const k of Object.keys(a)) {
    out[k] = typeof a[k] === 'number' ? lerp(a[k], b[k], t) : mix(a[k], b[k], t);
  }
  return out;
};

/** The three thrusts: the spear's direction at full extension, and how low the lunge goes. */
const THRUSTS = {
  'swipe-1': { angle: deg(0), lunge: 1, lift: 0 },
  'swipe-2': { angle: deg(16), lunge: 0.7, lift: 10 },
  'swipe-3': { angle: deg(-14), lunge: 1.25, lift: -6 },
};

export function readyPose(frame, frames) {
  // Two frames: a breath. Frame 1 lifts the chest a hair and settles the spear.
  const t = frames > 1 ? frame / (frames - 1) : 0;
  const p = structuredClone(READY_POSE);
  p.hipY += 0.8 * t;
  p.spear -= deg(2) * t;
  p.flutter = 0.2 + 0.1 * t;
  p.phase = frame;
  return p;
}

export function walkPose(frame, frames) {
  const ph = (frame / frames) * Math.PI * 2;
  const p = structuredClone(READY_POSE);
  const swing = 0.58;
  p.legF.thigh = swing * Math.sin(ph);
  p.legB.thigh = swing * Math.sin(ph + Math.PI);
  // The swinging leg bends at the knee on its way forward; the stance leg stays straight.
  p.legF.shin = p.legF.thigh - 0.95 * Math.max(0, Math.cos(ph)) * Math.max(0, Math.sin(ph) + 0.3);
  p.legB.shin = p.legB.thigh - 0.95 * Math.max(0, Math.cos(ph + Math.PI)) * Math.max(0, Math.sin(ph + Math.PI) + 0.3);
  p.hipY = 52 - 2.2 * Math.abs(Math.sin(ph));
  p.torso = 0.12;
  p.armB.upper = -0.25 + 0.35 * Math.sin(ph + Math.PI);
  p.armB.fore = p.armB.upper - 0.6;
  p.armF.upper = 0.5 + 0.08 * Math.sin(ph);
  p.spear = deg(66) + deg(3) * Math.sin(ph);
  p.flutter = 0.7 + 0.2 * Math.sin(ph * 2);
  p.phase = frame;
  return p;
}

/** Frames a thrust takes to come back to guard; the rest of the clip holds the ready pose. */
export const RECOVER_FRAMES = 5;

/**
 * A thrust of `frames` frames striking on `strike`: wind-up over the frames
 * before the strike (the spear comes down level and the hand draws back),
 * the thrust itself landing exactly on `strike` (arm straight, torso
 * leaning, spear tip at its furthest), a quick recovery over
 * `RECOVER_FRAMES`, then the ready pose held — identical frames, which the
 * packer stores once.
 */
export function swipePose(name, frame, frames, strike) {
  const thrust = THRUSTS[name] ?? THRUSTS['swipe-1'];
  const ready = structuredClone(READY_POSE);
  const drawn = {
    ...structuredClone(READY_POSE),
    torso: -0.05,
    hipX: -3,
    hipY: 50,
    legF: { thigh: 0.35, shin: 0.3 },
    legB: { thigh: -0.3, shin: -0.4 },
    armF: { upper: -0.55, fore: -1.25 },
    armB: { upper: 0.2, fore: -0.5 },
    spear: thrust.angle + deg(6),
    grip: 0.5,
    flutter: 0.4,
    phase: 0,
  };
  const landed = {
    ...structuredClone(READY_POSE),
    torso: 0.42,
    hipX: 6 * thrust.lunge,
    hipY: 52 - 5 * thrust.lunge + thrust.lift * 0.3,
    legF: { thigh: 0.75 * thrust.lunge, shin: 0.2 * thrust.lunge },
    legB: { thigh: -0.55 * thrust.lunge, shin: -0.65 * thrust.lunge },
    armF: { upper: Math.PI / 2 + thrust.angle, fore: Math.PI / 2 + thrust.angle },
    armB: { upper: -0.9, fore: -1.6 },
    spear: thrust.angle,
    grip: 0.3,
    flutter: 1,
    phase: 0,
  };
  if (frame < strike) {
    const u = strike > 1 ? frame / (strike - 1) : 1;
    // Draw back first (0 … 0.6), then begin the thrust (0.6 … 1) so the strike frame is the peak.
    if (u < 0.6) return mix(ready, drawn, smooth(u / 0.6));
    return mix(drawn, landed, smooth((u - 0.6) / 0.4) * 0.72);
  }
  if (frame === strike) return landed;
  const recover = Math.min(RECOVER_FRAMES, Math.max(1, frames - 1 - strike));
  const v = (frame - strike) / recover;
  if (v >= 1) return readyPose(0, 1);
  const recovering = mix(landed, ready, smooth(v));
  recovering.flutter = 1 - 0.8 * v;
  recovering.phase = frame;
  return recovering;
}

/** Falling backwards, away from the enemy: the last frame lies flat and is held while the body fades. */
export function deathPose(frame, frames) {
  const u = smooth(frame / Math.max(1, frames - 1));
  const ready = structuredClone(READY_POSE);
  const flat = {
    hipX: -12,
    hipY: 7,
    torso: -1.5,
    head: -0.35,
    legF: { thigh: 1.35, shin: 1.05 },
    legB: { thigh: 1.05, shin: 1.5 },
    armF: { upper: -2.2, fore: -2.4 },
    armB: { upper: -1.7, fore: -2.6 },
    spear: deg(172),
    grip: 0.5,
    flutter: 0,
    phase: 0,
  };
  const p = mix(ready, flat, u);
  p.phase = frame;
  // Knees buckle before the body hits the ground.
  const buckle = Math.sin(Math.min(1, frame / Math.max(1, frames - 1)) * Math.PI);
  p.hipY -= 4 * buckle;
  return p;
}

/** The pose for any clip. `spec` is the roster's `{ name, frames, strike }`. */
export function poseFor(spec, frame) {
  switch (spec.name) {
    case 'ready':
      return readyPose(frame, spec.frames);
    case 'walk':
      return walkPose(frame, spec.frames);
    case 'death':
      return deathPose(frame, spec.frames);
    default:
      return swipePose(spec.name, frame, spec.frames, spec.strike ?? Math.floor(spec.frames / 3));
  }
}
