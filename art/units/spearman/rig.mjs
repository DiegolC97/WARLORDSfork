/**
 * The shared Spearman rig: a 2D bone chain (pelvis, spine, head, two arms
 * holding spear and shield, two legs) drawn as flat capsules and polygons
 * in the original's vector look — solid fills, two tones per material, an
 * elliptical ground shadow, no outlines.
 *
 * `renderFrame(variant, spec, frame)` poses the rig with `clips.mjs`,
 * applies the variant's proportions, stance offsets and parts, and draws
 * two canvases: the **body** (race palette baked in) and the **accent**
 * (the pennant under the spearhead, pure white: the renderer tints it per
 * side). Both share the frame's pivot — the point between the feet on the
 * lane baseline.
 *
 * Authoring scale is 4×: the baseline unit stands about 112 px tall here
 * and 28 px in battle. Everything faces +x; the renderer mirrors it.
 */
import { Canvas, rgba, shade } from '../../lib/raster.mjs';
import { add, bar, capsule, circle, deg, ellipse, lerp, polar, roundedRect, scale, spikes, sub, taper } from '../../lib/geometry.mjs';
import { poseFor } from './clips.mjs';

/** Authoring canvas: room for a thrust ahead, a raised spear above and the shadow below. */
export const FRAME = { width: 232, height: 196, centreX: 104, baseline: 170 };
export const SPEAR_LENGTH = 96;

/** The baseline rig everything derives from: neutral proportions, no parts. */
export const BASELINE = Object.freeze({
  id: 'baseline',
  palette: {
    skin: '#d9a673',
    hair: '#5a3b24',
    primary: '#8a8a8a',
    secondary: '#5f5f5f',
    trim: '#e8e2d2',
    metal: '#b7bcc4',
    metalDark: '#6f7680',
    leather: '#6b4a2b',
    wood: '#8c6239',
    /** Optional: the legs' and arms' cloth when they differ from secondary / primary. */
    legs: null,
    arms: null,
  },
  proportions: {
    /** Overall scale of the figure (legs, torso, head together). */
    height: 1,
    legs: 1,
    torsoWidth: 1,
    shoulderWidth: 1,
    headSize: 1,
    limbWidth: 1,
    handSize: 1,
    /** Lateral spread of the feet (depth cue: the back foot sits a little behind). */
    stanceWidth: 1,
    spearLength: 1,
  },
  stance: {
    /** Added to the pose's torso lean (radians, + forward). */
    hunch: 0,
    /** Added to the head tilt. */
    headTilt: 0,
    /** Added to every thigh/shin angle: + bends the knees (crouch). */
    kneeBend: 0,
    /** Added to the spear angle while not thrusting (+ raises the tip). */
    spearRest: 0,
    /** Added to the hips' height (rig px at 4×). */
    hipLift: 0,
    /** Shoulder line tilt: + drops the back shoulder (asymmetry). */
    shoulderDrop: 0,
    /** Digitigrade legs: the shin angles back and a long foot carries the weight. */
    digitigrade: 0,
    /** Added to the spear arm's angles while not thrusting (+ carries the spear higher). */
    armLift: 0,
  },
  parts: {
    helmet: 'cap', // 'cap' | 'crest' | 'horned' | 'open' | 'none'
    plume: false,
    beard: false,
    horns: false,
    tail: false,
    slashedSleeves: false,
    bigFists: false,
    shield: 'round', // 'round' | 'tall' | 'kite' | 'none'
    pauldrons: false,
    scales: false,
    tusks: false,
  },
});

/** Deep-merge `overrides` onto the baseline: a race variant file is just the overrides. */
export function defineVariant(overrides) {
  const merge = (base, over) => {
    const out = { ...base };
    for (const [k, v] of Object.entries(over ?? {})) {
      out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' ? merge(base[k], v) : v;
    }
    return out;
  };
  return merge(BASELINE, overrides);
}

// ---- helpers

const DOWN = -Math.PI / 2;
/** A joint `len` away from `from` at `angle` from straight down (+ forward), in rig space (y up). */
const limb = (from, angle, len) => [from[0] + Math.sin(angle) * len, from[1] - Math.cos(angle) * len];

class Painter {
  constructor(canvas, origin) {
    this.canvas = canvas;
    this.origin = origin;
  }
  /** Rig → canvas: x forward, y up, feet at the baseline. */
  p([x, y]) {
    return [this.origin[0] + x, this.origin[1] - y];
  }
  poly(points, hex, alpha = 1) {
    this.canvas.fillPolygon(points.map((pt) => this.p(pt)), rgba(hex, alpha));
  }
  capsule(a, b, ra, rb, hex) {
    this.poly(capsule(a, b, ra, rb ?? ra), hex);
  }
  circle(c, r, hex) {
    this.poly(circle(c[0], c[1], r), hex);
  }
  ellipse(c, rx, ry, rot, hex, alpha = 1) {
    this.poly(ellipse(c[0], c[1], rx, ry, rot), hex, alpha);
  }
}

/**
 * Solve the skeleton for a pose under the variant's proportions. Returns
 * every joint in rig space plus the derived sizes the painter uses.
 */
export function solve(variant, pose) {
  const P = variant.proportions;
  const S = variant.stance;
  const h = P.height;
  const thigh = 27 * h * P.legs;
  const shin = 25 * h * P.legs;
  const torsoLen = 34 * h;
  const neck = 4 * h;
  const headR = 11 * h * P.headSize;
  const upper = 18 * h;
  const fore = 16 * h;
  const legScale = thigh + shin;
  const baseLegs = 52;

  const kb = S.kneeBend;
  const dg = S.digitigrade;
  const legAngles = (leg) => ({ thigh: leg.thigh + kb + 0.55 * dg, shin: leg.shin - kb * 1.6 - 0.75 * dg });
  const lf = legAngles(pose.legF);
  const lb = legAngles(pose.legB);
  // Hip height follows the leg length and the pose's crouch, so the feet stay on the baseline.
  const standing = (legAngle) => Math.cos(legAngle.thigh) * thigh + Math.cos(legAngle.shin) * shin;
  const poseDrop = baseLegs - pose.hipY;
  const groundLeg = Math.max(standing(lf), standing(lb));
  const hipY = Math.max(groundLeg - poseDrop * h, 6 * h) + S.hipLift * h + (dg > 0 ? 10 * dg * h : 0);
  const hip = [pose.hipX * h, hipY];
  const spread = (3 * P.stanceWidth - 3) * h;

  const kneeF = limb(hip, lf.thigh, thigh);
  const ankleF = limb(kneeF, lf.shin, shin);
  const kneeB = limb([hip[0] - spread, hip[1]], lb.thigh, thigh);
  const ankleB = limb(kneeB, lb.shin, shin);

  const torso = pose.torso + S.hunch;
  const shoulder = [hip[0] + Math.sin(torso) * torsoLen, hip[1] + Math.cos(torso) * torsoLen];
  const headTilt = torso + pose.head + S.headTilt;
  const neckTop = [shoulder[0] + Math.sin(headTilt) * neck, shoulder[1] + Math.cos(headTilt) * neck];
  const head = [neckTop[0] + Math.sin(headTilt) * headR, neckTop[1] + Math.cos(headTilt) * headR];
  const shoulderW = 11 * h * P.shoulderWidth * P.torsoWidth;
  const hipW = 9 * h * P.torsoWidth;

  const shF = [shoulder[0] + 2 * h, shoulder[1] - 1 * h];
  const shB = [shoulder[0] - 3 * h, shoulder[1] - 2 * h - S.shoulderDrop * 8 * h];
  const elbowF = limb(shF, pose.armF.upper, upper);
  const wristF = limb(elbowF, pose.armF.fore, fore);
  const elbowB = limb(shB, pose.armB.upper, upper);
  const wristB = limb(elbowB, pose.armB.fore, fore);
  const handR = 4.5 * h * P.handSize * (variant.parts.bigFists ? 1.9 : 1);
  const handF = limb(wristF, pose.armF.fore, handR * 0.6);
  const handB = limb(wristB, pose.armB.fore, handR * 0.6);

  const spearLen = SPEAR_LENGTH * h * P.spearLength;
  const thrusting = Math.abs(pose.spear) < deg(40);
  const spearAngle = pose.spear + (thrusting ? 0 : S.spearRest);
  if (!thrusting && S.armLift) {
    // Re-solve the spear arm carried higher (ready and walk only; a thrust is a thrust).
    const lift = S.armLift * (1 - Math.min(1, Math.abs(pose.spear - deg(70)) / deg(50)));
    const e2 = limb(shF, pose.armF.upper + lift, upper);
    const w2 = limb(e2, pose.armF.fore + lift, fore);
    elbowF[0] = e2[0];
    elbowF[1] = e2[1];
    wristF[0] = w2[0];
    wristF[1] = w2[1];
    const h2 = limb(w2, pose.armF.fore + lift, handR * 0.6);
    handF[0] = h2[0];
    handF[1] = h2[1];
  }
  const dir = [Math.cos(spearAngle), Math.sin(spearAngle)];
  const butt = sub(handF, scale(dir, pose.grip * spearLen));
  const tip = add(butt, scale(dir, spearLen));

  return {
    h,
    hip,
    kneeF,
    ankleF,
    kneeB,
    ankleB,
    shoulder,
    neckTop,
    head,
    headR,
    shoulderW,
    hipW,
    torso,
    headTilt,
    shF,
    shB,
    elbowF,
    wristF,
    handF,
    elbowB,
    wristB,
    handB,
    handR,
    butt,
    tip,
    spearAngle,
    spearDir: dir,
    limbW: P.limbWidth * h,
    thigh,
    shin,
    legF: lf,
    legB: lb,
  };
}

/** The spear tip's x for a clip frame: tests pin the strike frame to its peak. */
export function tipX(variant, spec, frame) {
  return solve(variant, poseFor(spec, frame)).tip[0];
}

// ---- drawing

function drawShadow(pt, j, variant, lying) {
  const w = (lying ? 36 : 22) * j.h * variant.proportions.torsoWidth;
  pt.ellipse([lying ? j.hip[0] - 6 * j.h : j.hip[0] * 0.5, 0], w, 5 * j.h, 0, '#000000', 0.32);
}

function drawTail(pt, j, variant, pose) {
  if (!variant.parts.tail) return;
  const { hip, h } = j;
  const sway = Math.sin(pose.phase * 0.9) * 0.12 + (pose.flutter - 0.5) * 0.1;
  let p = [hip[0] - 6 * h, hip[1] - 4 * h];
  let angle = Math.PI + 0.25 + sway; // backwards, drooping
  let r = 6.5 * h;
  const col = variant.palette.primary;
  const dark = shade(col, -0.25);
  for (let i = 0; i < 5; i++) {
    const len = (11 - i * 1.2) * h;
    const q = [p[0] + Math.cos(angle) * len, p[1] + Math.sin(angle) * len];
    pt.capsule(p, q, r, r * 0.78, i % 2 ? dark : col);
    p = q;
    r *= 0.78;
    angle += 0.28 + sway * 0.5;
  }
}

function drawLeg(pt, j, knee, ankle, hipPt, hex, dark, variant) {
  const w = j.limbW;
  const dg = variant.stance.digitigrade;
  pt.capsule(hipPt, knee, 6.5 * w, 5 * w, hex);
  pt.capsule(knee, ankle, 5 * w, 4 * w, hex);
  // The foot: a flat boot forward of the ankle, or a long clawed foot for digitigrade legs.
  const footLen = (dg > 0 ? 17 : 12) * j.h;
  const toe = [ankle[0] + footLen, Math.max(ankle[1] - 2 * j.h, 2.5 * j.h)];
  const heel = [ankle[0] - 3 * j.h, toe[1]];
  pt.capsule(heel, toe, 3 * j.h, 2.6 * j.h, dark);
  if (variant.parts.scales && dg > 0) {
    pt.poly(spikes(toe[0] + 1 * j.h, toe[1], 2, 2 * j.h, 4 * j.h, 0), shade(dark, 0.4));
  }
}

function drawArm(pt, j, sh, elbow, wrist, hand, hex, skin, variant, isFront) {
  const w = j.limbW;
  const puff = variant.parts.slashedSleeves ? 1.6 : 1;
  pt.capsule(sh, elbow, 5 * w * puff, 4 * w * puff, hex);
  if (variant.parts.slashedSleeves) {
    // Slashes: lighter stripes along the puffed upper arm.
    const d = sub(elbow, sh);
    const n = [-d[1], d[0]];
    const nn = scale(n, 1 / Math.hypot(n[0], n[1]));
    for (const k of [-0.45, 0, 0.45]) {
      const off = scale(nn, k * 5 * w * puff);
      pt.poly(bar(add(add(sh, off), scale(d, 0.15)), add(add(elbow, off), scale(d, -0.1)), 1.6 * w), variant.palette.trim);
    }
  }
  if (variant.parts.pauldrons && isFront !== null) {
    pt.circle(sh, 7.5 * w, variant.palette.metalDark);
    pt.circle([sh[0], sh[1] + 1.5 * j.h], 6 * w, variant.palette.metal);
  }
  pt.capsule(elbow, wrist, 4 * w, 3.5 * w, isFront ? hex : shade(hex, -0.15));
  pt.circle(hand, j.handR, skin);
}

function drawShield(pt, j, variant, pose) {
  const kind = variant.parts.shield;
  if (kind === 'none') return;
  const c = [j.wristB[0] - 1 * j.h, j.wristB[1] + 2 * j.h];
  const rim = variant.palette.metalDark;
  const face = variant.palette.primary;
  if (kind === 'round') {
    pt.ellipse(c, 10 * j.h, 12 * j.h, 0, rim);
    pt.ellipse(c, 8 * j.h, 10 * j.h, 0, face);
    pt.circle(c, 3 * j.h, variant.palette.metal);
  } else if (kind === 'tall') {
    pt.poly(roundedRect(c[0] - 7 * j.h, c[1] - 16 * j.h, 14 * j.h, 30 * j.h, 5 * j.h), rim);
    pt.poly(roundedRect(c[0] - 5.5 * j.h, c[1] - 14.5 * j.h, 11 * j.h, 27 * j.h, 4 * j.h), face);
    pt.poly(bar([c[0], c[1] - 10 * j.h], [c[0], c[1] + 8 * j.h], 2 * j.h), variant.palette.trim);
  } else if (kind === 'kite') {
    const pts = [
      [c[0] - 9 * j.h, c[1] + 10 * j.h],
      [c[0] + 9 * j.h, c[1] + 10 * j.h],
      [c[0] + 7 * j.h, c[1] - 6 * j.h],
      [c[0], c[1] - 16 * j.h],
      [c[0] - 7 * j.h, c[1] - 6 * j.h],
    ];
    pt.poly(pts, rim);
    pt.poly(pts.map(([x, y]) => [c[0] + (x - c[0]) * 0.78, c[1] + (y - c[1]) * 0.8]), face);
  }
  void pose;
}

function drawTorso(pt, j, variant) {
  const { hip, shoulder, hipW, shoulderW } = j;
  const P = variant.palette;
  const bulk = variant.parts.pauldrons ? 1.15 : 1;
  pt.capsule(hip, shoulder, hipW, shoulderW * bulk, P.primary);
  // A belt and a tabard panel in the secondary colour give the torso two tones.
  const mid = [lerp(hip[0], shoulder[0], 0.45), lerp(hip[1], shoulder[1], 0.45)];
  const d = sub(shoulder, hip);
  pt.poly(taper(mid, add(mid, scale(d, 0.52)), hipW * 1.3, shoulderW * 1.5 * bulk), P.secondary);
  pt.poly(bar([hip[0] - hipW * 1.05, hip[1] + 3 * j.h], [hip[0] + hipW * 1.05, hip[1] + 3 * j.h], 3.2 * j.h), P.leather);
  if (variant.parts.scales) {
    for (let i = 0; i < 3; i++) {
      const c = [lerp(hip[0], shoulder[0], 0.25 + i * 0.25), lerp(hip[1], shoulder[1], 0.25 + i * 0.25)];
      pt.ellipse(c, hipW * 0.55, 2.6 * j.h, 0, shade(P.primary, -0.22));
    }
  }
}

function drawHead(pt, j, variant, pose) {
  const P = variant.palette;
  const parts = variant.parts;
  const { head, headR, headTilt, h } = j;
  const fwd = [Math.cos(-headTilt), Math.sin(-headTilt)]; // facing direction in rig space
  const up = [Math.sin(headTilt), Math.cos(headTilt)];
  if (parts.beard) {
    // The beard reads before the face: a broad wedge hanging from the jaw to mid-chest.
    const jaw = add(head, scale(up, -headR * 0.2));
    const pts = [
      add(jaw, scale(fwd, headR * 1.25)),
      add(add(jaw, scale(fwd, headR * 1.35)), scale(up, -headR * 1.4)),
      add(add(jaw, scale(fwd, headR * 0.3)), scale(up, -headR * 2.9)),
      add(add(jaw, scale(fwd, -headR * 0.9)), scale(up, -headR * 1.8)),
      add(jaw, scale(fwd, -headR * 1.1)),
    ];
    pt.poly(pts, P.hair);
    pt.poly(pts.map((p) => add(scale(sub(p, jaw), 0.6), add(jaw, scale(up, -headR * 0.5)))), shade(P.hair, 0.18));
  }
  pt.circle(head, headR, P.skin);
  if (parts.tusks) {
    const jaw = add(head, scale(up, -headR * 0.55));
    pt.poly(spikes(jaw[0] + headR * 0.55, jaw[1], 1, 1.5 * h, 4.5 * h, deg(80)), P.trim);
    pt.poly(spikes(jaw[0] + headR * 0.05, jaw[1], 1, 1.5 * h, 4 * h, deg(80)), P.trim);
  }
  // Eye: one dot, forward.
  pt.circle(add(add(head, scale(fwd, headR * 0.55)), scale(up, headR * 0.12)), 1.6 * h, '#1b1b1b');

  const helmet = parts.helmet;
  if (helmet !== 'none') {
    const crown = add(head, scale(up, headR * 0.15));
    const rx = headR * 1.12;
    const ry = headR * 0.95;
    if (helmet === 'cap' || helmet === 'crest' || helmet === 'horned') {
      // A skull cap over the top half of the head, cut at the brow.
      const cap = [];
      for (let i = 0; i <= 20; i++) {
        const t = Math.PI * (i / 20);
        cap.push(add(add(crown, scale(fwd, Math.cos(t) * rx)), scale(up, Math.sin(t) * ry)));
      }
      pt.poly(cap, P.metal);
      pt.poly(bar(add(crown, scale(fwd, rx)), add(crown, scale(fwd, -rx)), 2.4 * h), P.metalDark);
    }
    if (helmet === 'open') {
      // A tall conical helm with a nasal, the elven read.
      const top = add(crown, scale(up, headR * 2.1));
      pt.poly([add(crown, scale(fwd, rx)), top, add(crown, scale(fwd, -rx))], P.metal);
      pt.poly(bar(add(crown, scale(fwd, rx)), add(crown, scale(fwd, -rx)), 2.4 * h), P.metalDark);
      pt.poly(bar(add(crown, scale(fwd, rx * 0.5)), add(add(crown, scale(fwd, rx * 0.55)), scale(up, -headR * 0.7)), 1.6 * h), P.metalDark);
    }
    if (helmet === 'crest') {
      // A low comb along the crown.
      const a = add(crown, scale(fwd, -rx * 0.8));
      const b = add(add(crown, scale(fwd, rx * 0.5)), scale(up, ry * 1.25));
      pt.poly(taper(a, b, 2 * h, 5 * h), P.secondary);
    }
    if (parts.horns) {
      // Two heavy horns curving up and back: the chaos silhouette.
      for (const side of [-1, 1]) {
        const base = add(add(crown, scale(fwd, side * rx * 0.55)), scale(up, ry * 0.6));
        const mid = add(add(base, scale(fwd, side * headR * 0.75)), scale(up, headR * 0.7));
        const end = add(add(mid, scale(fwd, side * headR * 0.35)), scale(up, headR * 0.95));
        pt.capsule(base, mid, 3.2 * h, 2.3 * h, P.trim);
        pt.capsule(mid, end, 2.3 * h, 1.1 * h, P.trim);
      }
    }
    if (parts.plume) {
      // A tall feather plume rising from the crown and curling back; reads above everything.
      const base = add(crown, scale(up, ry * 0.9));
      let p = base;
      let a = Math.PI / 2 + 0.25 + Math.sin(pose.phase * 0.7) * 0.08;
      let r = 3.6 * h;
      for (let i = 0; i < 4; i++) {
        const q = [p[0] + Math.cos(a) * 8 * h, p[1] + Math.sin(a) * 8 * h];
        pt.capsule(p, q, r, r * 0.9, i % 2 ? P.secondary : P.trim);
        p = q;
        r *= 0.9;
        a += 0.42;
      }
    }
  } else if (parts.scales) {
    // A bony crest from brow to nape.
    const crown = add(head, scale(up, headR * 0.5));
    pt.poly(spikes(crown[0] - headR * 0.3, crown[1], 3, headR * 0.5, headR * 1.15, Math.PI / 2 - 0.5), shade(P.secondary, 0.1));
  }
  void pose;
}

function drawSpear(pt, j, variant) {
  const P = variant.palette;
  const { butt, tip, spearDir, h } = j;
  const headLen = 16 * h;
  const neck = sub(tip, scale(spearDir, headLen));
  pt.poly(taper(butt, neck, 3.2 * h, 2.6 * h), P.wood);
  // A ferrule at the butt and a leaf-shaped head.
  pt.poly(taper(butt, add(butt, scale(spearDir, 5 * h)), 3.4 * h, 3.2 * h), P.metalDark);
  const n = [-spearDir[1], spearDir[0]];
  const headPts = [
    neck,
    add(add(neck, scale(spearDir, headLen * 0.35)), scale(n, 3.6 * h)),
    tip,
    add(add(neck, scale(spearDir, headLen * 0.35)), scale(n, -3.6 * h)),
  ];
  pt.poly(headPts, P.metal);
  pt.poly(bar(neck, add(neck, scale(spearDir, -2 * h)), 4 * h), P.metalDark);
}

/** The team pennant: a swallow-tailed flag below the spearhead, streaming back along the shaft. Pure white. */
function drawPennant(pt, j, pose) {
  const { tip, spearDir, h } = j;
  const n = [-spearDir[1], spearDir[0]];
  const base = sub(tip, scale(spearDir, 19 * h));
  // The flag hangs off the shaft on the side away from the body and streams backwards.
  const stream = lerp(0.35, 1, pose.flutter);
  const wave = Math.sin(pose.phase * 1.3) * 0.12;
  const back = scale(spearDir, -1);
  const out = scale(n, -1);
  const len = 20 * h * stream;
  const wid = 9 * h;
  const pts = [
    base,
    add(base, scale(out, wid)),
    add(add(add(base, scale(out, wid * (0.75 + wave))), scale(back, len)), scale(out, -wid * 0.1)),
    add(add(base, scale(out, wid * 0.45)), scale(back, len * 0.6)),
    add(add(base, scale(out, wid * (0.1 - wave))), scale(back, len * 0.95)),
  ];
  pt.poly(pts, '#ffffff');
}

/**
 * Render one frame. Returns `{ body, accent, pivot }` with both canvases the
 * full authoring size and `pivot` the feet point in canvas pixels; the
 * builder trims and packs them. `frame` is the frame index in the clip.
 */
export function renderFrame(variant, spec, frame) {
  const pose = poseFor(spec, frame);
  const j = solve(variant, pose);
  const body = new Canvas(FRAME.width, FRAME.height);
  const accent = new Canvas(FRAME.width, FRAME.height);
  const origin = [FRAME.centreX, FRAME.baseline];
  const pt = new Painter(body, origin);
  const pa = new Painter(accent, origin);
  const P = variant.palette;
  const legCol = P.legs ?? P.secondary;
  const armCol = P.arms ?? P.primary;
  const legDark = shade(legCol, -0.3);
  const lying = spec.name === 'death' && frame >= spec.frames - 2;

  drawShadow(pt, j, variant, lying);
  drawTail(pt, j, variant, pose);
  // Back limbs first, in the darker tone.
  drawArm(pt, j, j.shB, j.elbowB, j.wristB, j.handB, shade(armCol, -0.25), shade(P.skin, -0.2), variant, false);
  drawShield(pt, j, variant, pose);
  drawLeg(pt, j, j.kneeB, j.ankleB, [j.hip[0] - (3 * variant.proportions.stanceWidth - 3) * j.h, j.hip[1]], shade(legCol, -0.3), legDark, variant);
  drawTorso(pt, j, variant);
  drawLeg(pt, j, j.kneeF, j.ankleF, j.hip, legCol, legDark, variant);
  drawHead(pt, j, variant, pose);
  drawArm(pt, j, j.shF, j.elbowF, j.wristF, j.handF, armCol, P.skin, variant, true);
  drawSpear(pt, j, variant);
  // Gauntlet over the spear hand so the grip reads.
  pt.circle(j.handF, j.handR, variant.parts.bigFists ? shade(P.skin, -0.1) : P.leather);

  drawPennant(pa, j, pose);
  return { body, accent, pivot: [FRAME.centreX, FRAME.baseline] };
}
