import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as pc from 'playcanvas';
import { loadManifest } from '../assets/loader';
import { HeadlessEngineHost } from './headlessHost';

const readPublic = (url: string): string | null => {
  try {
    return readFileSync(join(process.cwd(), 'public', url), 'utf8');
  } catch {
    return null;
  }
};

describe('the headless engine host', () => {
  it('runs a real application on the null device, delivers frames and renders', () => {
    const host = new HeadlessEngineHost({ width: 800, height: 600 });
    expect(host.app).toBeInstanceOf(pc.Application);
    expect([host.device.width, host.device.height]).toEqual([800, 600]);
    const seen: number[] = [];
    const off = host.onFrame((dt) => seen.push(dt));
    host.tick(3, 24);
    expect(seen).toEqual([1 / 24, 1 / 24, 1 / 24]);
    expect(host.frameListeners).toBe(1);
    off();
    host.tick(1);
    expect(seen).toHaveLength(3);
    expect(host.frameListeners).toBe(0);
    const root = host.createSceneRoot('screen:test');
    expect(root.parent).toBe(host.app.root);
    host.destroy();
  });

  it('loads a race atlas as an engine texture atlas with the file\'s frames over a texture of the declared size', async () => {
    const host = new HeadlessEngineHost({ readText: readPublic });
    const assets = await loadManifest(
      [
        { id: 'sprites', type: 'textureatlas', url: 'assets/units/race1.json' },
        { id: 'doc', type: 'json', url: 'assets/units/race1.json' },
        { id: 'missing', type: 'json', url: 'assets/units/nowhere.json' },
      ],
      host.assetBackend,
    );
    const atlas = assets.get<pc.TextureAtlas>('sprites');
    const doc = assets.get<{ meta: { size: [number, number] }; frames: Record<string, { rect: number[] }> }>('doc');
    expect(atlas).toBeInstanceOf(pc.TextureAtlas);
    expect([atlas.texture.width, atlas.texture.height]).toEqual(doc.meta.size);
    expect(Object.keys(atlas.frames).sort()).toEqual(Object.keys(doc.frames).sort());
    const key = 'spearman/ready/0';
    const frame = (atlas.frames as Record<string, { rect: pc.Vec4 }>)[key]!;
    expect([frame.rect.x, frame.rect.y, frame.rect.z, frame.rect.w]).toEqual(doc.frames[key]!.rect);
    expect(assets.get('missing')).toEqual({ id: 'missing', url: 'assets/units/nowhere.json' });
    host.destroy();
  });
});
