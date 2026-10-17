/**
 * Shelf packing of trimmed frames into one texture, widest-first rows,
 * with a gutter so linear filtering never bleeds a neighbour in. Frames
 * with identical pixels share one rect.
 */
import { createHash } from 'node:crypto';

export const GUTTER = 2;

/**
 * `frames`: `[{ key, canvas, pivot: [px, py] }]` where `pivot` is in canvas
 * pixels. Returns `{ width, height, placed: Map<key, { rect, pivot, canvas, shared }> }`,
 * or throws when the frames do not fit in `maxWidth × maxHeight`.
 */
export function packFrames(frames, maxWidth = 1024, maxHeight = 1024) {
  const unique = new Map();
  const order = [];
  for (const f of frames) {
    const hash = createHash('sha1').update(Buffer.from(f.canvas.data.buffer)).update(`${f.canvas.width}x${f.canvas.height}`).digest('hex');
    const seen = unique.get(hash);
    if (seen) {
      seen.keys.push(f.key);
      continue;
    }
    const entry = { hash, keys: [f.key], canvas: f.canvas, pivot: f.pivot };
    unique.set(hash, entry);
    order.push(entry);
  }
  // Tallest first, then widest: shelves stay dense.
  order.sort((a, b) => b.canvas.height - a.canvas.height || b.canvas.width - a.canvas.width);

  let shelfY = GUTTER;
  let shelfX = GUTTER;
  let shelfH = 0;
  let usedWidth = 0;
  for (const e of order) {
    const w = e.canvas.width;
    const h = e.canvas.height;
    if (w + 2 * GUTTER > maxWidth) throw new Error(`frame "${e.keys[0]}" is ${w} px wide; the texture is ${maxWidth}`);
    if (shelfX + w + GUTTER > maxWidth) {
      shelfY += shelfH + GUTTER;
      shelfX = GUTTER;
      shelfH = 0;
    }
    if (shelfY + h + GUTTER > maxHeight) {
      throw new Error(`frames do not fit in ${maxWidth}×${maxHeight}: "${e.keys[0]}" would start at row ${shelfY}`);
    }
    e.x = shelfX;
    e.y = shelfY;
    shelfX += w + GUTTER;
    shelfH = Math.max(shelfH, h);
    usedWidth = Math.max(usedWidth, shelfX);
  }
  const height = shelfY + shelfH + GUTTER;
  const placed = new Map();
  for (const e of order) {
    for (const key of e.keys) {
      placed.set(key, {
        rect: [e.x, e.y, e.canvas.width, e.canvas.height],
        pivot: [e.canvas.width > 0 ? e.pivot[0] / e.canvas.width : 0, e.canvas.height > 0 ? e.pivot[1] / e.canvas.height : 0],
        canvas: e.canvas,
        shared: e.keys.length > 1,
      });
    }
  }
  return { width: maxWidth, height: Math.min(maxHeight, height), placed, unique: order.length };
}
