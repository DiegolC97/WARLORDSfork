import { describe, expect, it, vi } from 'vitest';
import { AssetLoadError, loadManifest, type AssetBackend, type AssetSpec } from './loader';

const specs: AssetSpec[] = [
  { id: 'atlas', type: 'textureatlas', url: 'assets/ui/atlas.json' },
  { id: 'bg', type: 'texture', url: 'assets/ui/bg.png' },
];

const fakeBackend = (failing?: string): AssetBackend & { unloaded: string[] } => {
  const unloaded: string[] = [];
  return {
    unloaded,
    load: async (spec) => {
      if (spec.id === failing) throw new Error('404');
      return { resource: spec.url };
    },
    unload: (spec) => {
      unloaded.push(spec.id);
    },
  };
};

describe('loadManifest', () => {
  it('loads every spec and exposes resources by id', async () => {
    const assets = await loadManifest(specs, fakeBackend());
    expect(assets.has('atlas')).toBe(true);
    expect(assets.get<{ resource: string }>('bg').resource).toBe('assets/ui/bg.png');
    expect(() => assets.get('missing')).toThrow(/not in this screen's manifest/);
  });

  it('rejects duplicate ids before touching the backend', async () => {
    const backend = fakeBackend();
    const spy = vi.spyOn(backend, 'load');
    await expect(loadManifest([specs[0]!, specs[0]!], backend)).rejects.toThrow(/duplicate asset id/);
    expect(spy).not.toHaveBeenCalled();
  });

  it('names the failing asset and unloads what did load', async () => {
    const backend = fakeBackend('bg');
    const err = await loadManifest(specs, backend).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AssetLoadError);
    expect((err as Error).message).toMatch(/"bg".*assets\/ui\/bg\.png/);
    expect(backend.unloaded).toEqual(['atlas']);
  });

  it('release unloads every spec in the manifest', async () => {
    const backend = fakeBackend();
    const assets = await loadManifest(specs, backend);
    assets.release();
    expect(backend.unloaded.sort()).toEqual(['atlas', 'bg']);
    expect(assets.has('atlas')).toBe(false);
  });
});
