/**
 * EngineHost — the seam between the screen shell and the rendering engine.
 *
 * The PlayCanvas implementation lives in `playcanvasHost.ts`; tests use
 * `NullEngineHost`. Screens receive `app` and a per-screen root entity through
 * their context, typed against the engine's public API only.
 */
import type * as pc from 'playcanvas';
import type { AssetBackend } from '../assets/loader';

export interface EngineHost {
  /** The running engine application, or `null` when headless. */
  readonly app: pc.AppBase | null;
  readonly assetBackend: AssetBackend;
  /** Create an entity parented to the scene root; the shell destroys it on screen exit. */
  createSceneRoot(name: string): pc.Entity | null;
  /** Placeholder visual per screen while there is no art. */
  setClearColor(r: number, g: number, b: number): void;
}
