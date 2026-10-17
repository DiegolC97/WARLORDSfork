/**
 * A tiny flat-vector rasteriser: polygons filled with anti-aliasing into a
 * premultiplied float RGBA canvas. It is all the art pipeline needs for the
 * original's flat look (solid fills, no gradients) and it keeps the
 * generator free of native dependencies, so `npm run build:atlases` works
 * on any machine with Node.
 *
 * Coverage is exact horizontally (fractional span ends) and sampled on
 * `SUBSAMPLES` sub-scanlines vertically, with the non-zero winding rule.
 */

export const SUBSAMPLES = 5;

export class Canvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    /** Premultiplied RGBA, 0…1, row-major. */
    this.data = new Float32Array(width * height * 4);
  }

  clone() {
    const c = new Canvas(this.width, this.height);
    c.data.set(this.data);
    return c;
  }

  /** Fill a polygon (`[[x, y], …]`, any winding) with `[r, g, b, a]` in 0…1. */
  fillPolygon(points, color) {
    if (points.length < 3) return;
    const [r, g, b, a] = color;
    if (a <= 0) return;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of points) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const y0 = Math.max(0, Math.floor(minY));
    const y1 = Math.min(this.height - 1, Math.ceil(maxY));
    const n = points.length;
    const coverage = new Float32Array(this.width);
    const crossings = [];
    for (let py = y0; py <= y1; py++) {
      coverage.fill(0);
      let touched = false;
      for (let s = 0; s < SUBSAMPLES; s++) {
        const sy = py + (s + 0.5) / SUBSAMPLES;
        crossings.length = 0;
        for (let i = 0; i < n; i++) {
          const [ax, ay] = points[i];
          const [bx, by] = points[(i + 1) % n];
          if (ay === by) continue;
          const up = ay < by;
          const top = up ? ay : by;
          const bottom = up ? by : ay;
          if (sy < top || sy >= bottom) continue;
          const x = ax + ((sy - ay) * (bx - ax)) / (by - ay);
          crossings.push({ x, dir: up ? 1 : -1 });
        }
        if (crossings.length < 2) continue;
        crossings.sort((p, q) => p.x - q.x);
        let winding = 0;
        for (let i = 0; i < crossings.length - 1; i++) {
          winding += crossings[i].dir;
          if (winding === 0) continue;
          const xa = Math.max(0, crossings[i].x);
          const xb = Math.min(this.width, crossings[i + 1].x);
          if (xb <= xa) continue;
          touched = true;
          const first = Math.floor(xa);
          const last = Math.ceil(xb) - 1;
          if (first === last) {
            coverage[first] += (xb - xa) / SUBSAMPLES;
          } else {
            coverage[first] += (first + 1 - xa) / SUBSAMPLES;
            for (let px = first + 1; px < last; px++) coverage[px] += 1 / SUBSAMPLES;
            coverage[last] += (xb - last) / SUBSAMPLES;
          }
        }
      }
      if (!touched) continue;
      const row = py * this.width * 4;
      for (let px = 0; px < this.width; px++) {
        const c = coverage[px];
        if (c <= 0) continue;
        const alpha = Math.min(1, c) * a;
        const k = row + px * 4;
        const keep = 1 - alpha;
        this.data[k] = r * alpha + this.data[k] * keep;
        this.data[k + 1] = g * alpha + this.data[k + 1] * keep;
        this.data[k + 2] = b * alpha + this.data[k + 2] * keep;
        this.data[k + 3] = alpha + this.data[k + 3] * keep;
      }
    }
  }

  /** Draw `src` over this canvas with its top-left at (`dx`, `dy`), optionally scaled by `alpha`. */
  blit(src, dx, dy, alpha = 1) {
    for (let y = 0; y < src.height; y++) {
      const ty = dy + y;
      if (ty < 0 || ty >= this.height) continue;
      for (let x = 0; x < src.width; x++) {
        const tx = dx + x;
        if (tx < 0 || tx >= this.width) continue;
        const s = (y * src.width + x) * 4;
        const sa = src.data[s + 3] * alpha;
        if (sa <= 0) continue;
        const d = (ty * this.width + tx) * 4;
        const keep = 1 - sa;
        this.data[d] = src.data[s] * alpha + this.data[d] * keep;
        this.data[d + 1] = src.data[s + 1] * alpha + this.data[d + 1] * keep;
        this.data[d + 2] = src.data[s + 2] * alpha + this.data[d + 2] * keep;
        this.data[d + 3] = sa + this.data[d + 3] * keep;
      }
    }
  }

  /** The smallest rect holding every pixel with alpha above `threshold`, or `null` when empty. */
  bounds(threshold = 1 / 255) {
    let minX = this.width;
    let minY = this.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.data[(y * this.width + x) * 4 + 3] > threshold) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  crop(x, y, w, h) {
    const c = new Canvas(w, h);
    for (let row = 0; row < h; row++) {
      const sy = y + row;
      if (sy < 0 || sy >= this.height) continue;
      for (let col = 0; col < w; col++) {
        const sx = x + col;
        if (sx < 0 || sx >= this.width) continue;
        const s = (sy * this.width + sx) * 4;
        const d = (row * w + col) * 4;
        c.data[d] = this.data[s];
        c.data[d + 1] = this.data[s + 1];
        c.data[d + 2] = this.data[s + 2];
        c.data[d + 3] = this.data[s + 3];
      }
    }
    return c;
  }

  /** Box-filter downsample by an integer `factor` (premultiplied, so edges stay clean). */
  downsample(factor) {
    const w = Math.ceil(this.width / factor);
    const h = Math.ceil(this.height / factor);
    const c = new Canvas(w, h);
    const inv = 1 / (factor * factor);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        for (let yy = 0; yy < factor; yy++) {
          const sy = y * factor + yy;
          if (sy >= this.height) continue;
          for (let xx = 0; xx < factor; xx++) {
            const sx = x * factor + xx;
            if (sx >= this.width) continue;
            const s = (sy * this.width + sx) * 4;
            r += this.data[s];
            g += this.data[s + 1];
            b += this.data[s + 2];
            a += this.data[s + 3];
          }
        }
        const d = (y * w + x) * 4;
        c.data[d] = r * inv;
        c.data[d + 1] = g * inv;
        c.data[d + 2] = b * inv;
        c.data[d + 3] = a * inv;
      }
    }
    return c;
  }

  /** Every covered pixel to one flat colour (a silhouette), keeping alpha. */
  silhouette(color) {
    const c = new Canvas(this.width, this.height);
    const [r, g, b] = color;
    for (let i = 0; i < this.data.length; i += 4) {
      const a = this.data[i + 3];
      c.data[i] = r * a;
      c.data[i + 1] = g * a;
      c.data[i + 2] = b * a;
      c.data[i + 3] = a;
    }
    return c;
  }

  /** Straight (un-premultiplied) 8-bit RGBA bytes, row-major. */
  toRGBA8() {
    const out = new Uint8Array(this.width * this.height * 4);
    for (let i = 0; i < this.data.length; i += 4) {
      const a = this.data[i + 3];
      if (a <= 0) continue;
      out[i] = Math.round(Math.min(1, this.data[i] / a) * 255);
      out[i + 1] = Math.round(Math.min(1, this.data[i + 1] / a) * 255);
      out[i + 2] = Math.round(Math.min(1, this.data[i + 2] / a) * 255);
      out[i + 3] = Math.round(Math.min(1, a) * 255);
    }
    return out;
  }
}

/** `#rrggbb` (or `#rrggbbaa`) to `[r, g, b, a]` in 0…1. */
export function rgba(hex, alpha = 1) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : alpha;
  return [r, g, b, a];
}

/** A darker or lighter version of a hex colour (`amount` −1…1). */
export function shade(hex, amount) {
  const [r, g, b] = rgba(hex);
  const f = (v) => {
    const out = amount < 0 ? v * (1 + amount) : v + (1 - v) * amount;
    return Math.round(Math.max(0, Math.min(1, out)) * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(r)}${f(g)}${f(b)}`;
}
