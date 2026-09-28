/**
 * Asset loading — screens declare what they need as a manifest; the shell
 * loads it before the screen is entered.
 *
 * The loader is backend-agnostic: `playcanvasBackend` (engine/playcanvasHost)
 * turns a spec into a `pc.Asset`; tests use an in-memory backend. Adding a
 * new screen's assets means adding a manifest, never changing this file.
 */

export type AssetType = 'texture' | 'textureatlas' | 'json' | 'audio' | 'font' | 'text';

export interface AssetSpec {
  /** Unique within one manifest; screens look assets up by this id. */
  id: string;
  type: AssetType;
  /** Relative to the site root, e.g. `assets/ui/menu-atlas.png`. */
  url: string;
}

export type AssetManifest = readonly AssetSpec[];

export interface LoadedAssets {
  has(id: string): boolean;
  get<T = unknown>(id: string): T;
  /** Release every asset in this set (called when the screen exits). */
  release(): void;
}

export interface AssetBackend {
  /** Load one spec and resolve with the engine-side resource. */
  load(spec: AssetSpec): Promise<unknown>;
  /** Free one spec's resource. */
  unload(spec: AssetSpec): void;
}

export class AssetLoadError extends Error {
  constructor(
    readonly spec: AssetSpec,
    cause: unknown,
  ) {
    super(`failed to load asset "${spec.id}" (${spec.type}) from ${spec.url}: ${String(cause)}`);
    this.name = 'AssetLoadError';
  }
}

export function validateManifest(manifest: AssetManifest): void {
  const seen = new Set<string>();
  for (const spec of manifest) {
    if (!spec.id) throw new Error('asset spec has an empty id');
    if (seen.has(spec.id)) throw new Error(`duplicate asset id "${spec.id}" in manifest`);
    seen.add(spec.id);
  }
}

export async function loadManifest(manifest: AssetManifest, backend: AssetBackend): Promise<LoadedAssets> {
  validateManifest(manifest);
  const resources = new Map<string, unknown>();
  const loaded: AssetSpec[] = [];

  try {
    await Promise.all(
      manifest.map(async (spec) => {
        try {
          resources.set(spec.id, await backend.load(spec));
          loaded.push(spec);
        } catch (err) {
          throw err instanceof AssetLoadError ? err : new AssetLoadError(spec, err);
        }
      }),
    );
  } catch (err) {
    for (const spec of loaded) backend.unload(spec);
    throw err;
  }

  return {
    has: (id) => resources.has(id),
    get<T>(id: string): T {
      if (!resources.has(id)) throw new Error(`asset "${id}" is not in this screen's manifest`);
      return resources.get(id) as T;
    },
    release() {
      for (const spec of manifest) backend.unload(spec);
      resources.clear();
    },
  };
}

/** Backend that resolves nothing — for headless tests and the null engine host. */
export const nullAssetBackend: AssetBackend = {
  load: async (spec) => ({ id: spec.id, url: spec.url }),
  unload: () => {},
};
