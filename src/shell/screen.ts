/**
 * The contract every screen implements. Screens get a context and nothing
 * else: no reference to the shell, to other screens, or to storage.
 */
import type * as pc from 'playcanvas';
import type { AssetManifest, LoadedAssets } from '../assets/loader';
import type { CampaignAccess, LoadResult } from '../save';
import type { ScreenId } from './routes';

export interface ScreenContext {
  /** This screen's DOM container. Removed by the shell on exit. */
  readonly overlay: HTMLElement;
  /** The engine app, or `null` when running headless. */
  readonly app: pc.AppBase | null;
  /** This screen's entity root, destroyed by the shell on exit. `null` when headless. */
  readonly root: pc.Entity | null;
  /** The assets this screen's manifest declared, already loaded. */
  readonly assets: LoadedAssets;
  /** The live campaign; every update is persisted. */
  readonly campaign: CampaignAccess;
  /** How the save was loaded at boot (absent, loaded, corrupt…). */
  readonly saveOutcome: LoadResult;
  /** Placeholder background colour while there is no art. */
  setClearColor(r: number, g: number, b: number): void;
  /** Emit a navigation event; the route table decides the destination. */
  navigate(event: string): Promise<void>;
  /**
   * Run `cb` every rendered frame with the elapsed seconds until the returned
   * function is called or the screen exits, whichever comes first.
   */
  onFrame(cb: (dtSeconds: number) => void): () => void;
}

export interface Screen {
  enter(ctx: ScreenContext): void;
  exit?(): void;
}

export interface ScreenDefinition {
  readonly id: ScreenId;
  readonly assets: AssetManifest;
  create(): Screen;
}
