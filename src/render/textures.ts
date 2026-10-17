/**
 * Flat sprites generated in code — no file, no art: a white quad the
 * renderer tints (lane lines, the placeholder block and pennant for a unit
 * without art, projectiles) and a soft ellipse for the ground shadow under
 * every unit. Both are sized so one sprite unit is one field unit; an
 * entity's scale gives the final size.
 */
import * as pc from 'playcanvas';

export interface FlatSprites {
  /** A 1 × 1 field-unit white square with its pivot at the centre. */
  readonly quad: pc.Sprite;
  /** The same square with its pivot at the bottom centre, for things standing on a baseline. */
  readonly quadStanding: pc.Sprite;
  /** A 1 × 0.5 field-unit soft black ellipse, pivot at the centre: the ground shadow. */
  readonly shadow: pc.Sprite;
  /** Releases the textures. */
  destroy(): void;
}

const SHADOW_WIDTH = 64;
const SHADOW_HEIGHT = 32;

export function createFlatSprites(device: pc.GraphicsDevice): FlatSprites {
  const white = texture(device, 'flat-white', 4, 4, () => [255, 255, 255, 255]);
  const whiteAtlas = atlasOf(white, {
    quad: { rect: [0, 0, 4, 4], pivot: [0.5, 0.5] },
    standing: { rect: [0, 0, 4, 4], pivot: [0.5, 0] },
  });
  // Alpha falls off smoothly from the ellipse's centre to its edge: solid black, soft rim.
  const shadowTexture = texture(device, 'flat-shadow', SHADOW_WIDTH, SHADOW_HEIGHT, (x, y) => {
    const nx = ((x + 0.5) / SHADOW_WIDTH) * 2 - 1;
    const ny = ((y + 0.5) / SHADOW_HEIGHT) * 2 - 1;
    const d = Math.sqrt(nx * nx + ny * ny);
    const a = d >= 1 ? 0 : d <= 0.6 ? 1 : 1 - (d - 0.6) / 0.4;
    return [0, 0, 0, Math.round(a * 255)];
  });
  const shadowAtlas = atlasOf(shadowTexture, { shadow: { rect: [0, 0, SHADOW_WIDTH, SHADOW_HEIGHT], pivot: [0.5, 0.5] } });
  return {
    quad: new pc.Sprite(device, { atlas: whiteAtlas, frameKeys: ['quad'], pixelsPerUnit: 4, renderMode: pc.SPRITE_RENDERMODE_SIMPLE }),
    quadStanding: new pc.Sprite(device, { atlas: whiteAtlas, frameKeys: ['standing'], pixelsPerUnit: 4, renderMode: pc.SPRITE_RENDERMODE_SIMPLE }),
    shadow: new pc.Sprite(device, { atlas: shadowAtlas, frameKeys: ['shadow'], pixelsPerUnit: SHADOW_WIDTH, renderMode: pc.SPRITE_RENDERMODE_SIMPLE }),
    destroy() {
      white.destroy();
      shadowTexture.destroy();
    },
  };
}

function texture(device: pc.GraphicsDevice, name: string, width: number, height: number, pixel: (x: number, y: number) => [number, number, number, number]): pc.Texture {
  const tex = new pc.Texture(device, {
    name,
    width,
    height,
    format: pc.PIXELFORMAT_RGBA8,
    mipmaps: false,
    minFilter: pc.FILTER_LINEAR,
    magFilter: pc.FILTER_LINEAR,
    addressU: pc.ADDRESS_CLAMP_TO_EDGE,
    addressV: pc.ADDRESS_CLAMP_TO_EDGE,
  });
  const data = tex.lock() as Uint8Array;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixel(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  tex.unlock();
  return tex;
}

function atlasOf(tex: pc.Texture, frames: Record<string, { rect: [number, number, number, number]; pivot: [number, number] }>): pc.TextureAtlas {
  const atlas = new pc.TextureAtlas();
  atlas.texture = tex;
  const built: Record<string, { rect: pc.Vec4; pivot: pc.Vec2; border: pc.Vec4 }> = {};
  for (const [key, f] of Object.entries(frames)) built[key] = { rect: new pc.Vec4(...f.rect), pivot: new pc.Vec2(...f.pivot), border: new pc.Vec4() };
  atlas.frames = built;
  return atlas;
}
