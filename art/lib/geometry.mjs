/**
 * Polygon builders for the rasteriser: everything the rig draws is a
 * polygon — ellipses, capsules (limbs), tapered strokes (spear shafts),
 * rotated quads. Coordinates are plain `[x, y]` pairs in canvas pixels,
 * y down.
 */

export const TAU = Math.PI * 2;

export function add(a, b) {
  return [a[0] + b[0], a[1] + b[1]];
}

export function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1]];
}

export function scale(a, k) {
  return [a[0] * k, a[1] * k];
}

export function length(a) {
  return Math.hypot(a[0], a[1]);
}

export function normalize(a) {
  const l = length(a) || 1;
  return [a[0] / l, a[1] / l];
}

/** The point `d` along the direction `angle` (radians, 0 = +x, π/2 = +y which is down) from `p`. */
export function polar(p, angle, d) {
  return [p[0] + Math.cos(angle) * d, p[1] + Math.sin(angle) * d];
}

export function rotateAround(points, origin, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return points.map(([x, y]) => {
    const dx = x - origin[0];
    const dy = y - origin[1];
    return [origin[0] + dx * c - dy * s, origin[1] + dx * s + dy * c];
  });
}

export function translate(points, [dx, dy]) {
  return points.map(([x, y]) => [x + dx, y + dy]);
}

/** Mirror a polygon horizontally about `x = axis`. */
export function mirrorX(points, axis) {
  return points.map(([x, y]) => [2 * axis - x, y]).reverse();
}

export function ellipse(cx, cy, rx, ry, rotation = 0, segments = 40) {
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * TAU;
    pts.push([Math.cos(t) * rx, Math.sin(t) * ry]);
  }
  return translate(rotateAround(pts, [0, 0], rotation), [cx, cy]);
}

export function circle(cx, cy, r, segments = 32) {
  return ellipse(cx, cy, r, r, 0, segments);
}

/**
 * A capsule from `a` (radius `ra`) to `b` (radius `rb`): the limb primitive.
 * Round ends, straight tangents, so two capsules sharing a joint overlap
 * without a seam.
 */
export function capsule(a, b, ra, rb = ra, segments = 10) {
  const d = sub(b, a);
  const angle = Math.atan2(d[1], d[0]);
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = angle - Math.PI / 2 + (i / segments) * Math.PI;
    pts.push(polar(b, t, rb));
  }
  for (let i = 0; i <= segments; i++) {
    const t = angle + Math.PI / 2 + (i / segments) * Math.PI;
    pts.push(polar(a, t, ra));
  }
  return pts;
}

/** A straight stroke from `a` to `b` with square ends, `w` wide. */
export function bar(a, b, w) {
  const d = normalize(sub(b, a));
  const n = [-d[1] * (w / 2), d[0] * (w / 2)];
  return [add(a, n), add(b, n), sub(b, n), sub(a, n)];
}

/** A quad tapering from width `wa` at `a` to `wb` at `b`. */
export function taper(a, b, wa, wb) {
  const d = normalize(sub(b, a));
  const na = [-d[1] * (wa / 2), d[0] * (wa / 2)];
  const nb = [-d[1] * (wb / 2), d[0] * (wb / 2)];
  return [add(a, na), add(b, nb), sub(b, nb), sub(a, na)];
}

/** An axis-aligned rectangle. */
export function rect(x, y, w, h) {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}

/** A rounded rectangle (corner radius `r`). */
export function roundedRect(x, y, w, h, r, segments = 6) {
  const pts = [];
  const corners = [
    [x + w - r, y + r, -Math.PI / 2],
    [x + w - r, y + h - r, 0],
    [x + r, y + h - r, Math.PI / 2],
    [x + r, y + r, Math.PI],
  ];
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= segments; i++) {
      const t = start + (i / segments) * (Math.PI / 2);
      pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
    }
  }
  return pts;
}

/** A regular star / spike fan: `n` spikes of outer radius `ro` on a core of radius `ri`. */
export function spikes(cx, cy, n, ri, ro, rotation = 0) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const t = rotation + (i / (n * 2)) * TAU;
    const r = i % 2 === 0 ? ro : ri;
    pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
  }
  return pts;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Ease in-out on 0…1. */
export function smooth(t) {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

export const deg = (d) => (d * Math.PI) / 180;
