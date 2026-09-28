/**
 * ScreenShell — holds exactly one active screen and moves between screens by
 * resolving navigation events against the route table.
 *
 * Transition order: load the next screen's assets → exit the current screen
 * (exit hook, remove overlay, destroy entity root, release assets) → mount the
 * next one. Assets load *before* teardown, so there is never a moment with
 * zero active screens after start.
 */
import { loadManifest, type LoadedAssets } from '../assets/loader';
import type { EngineHost } from '../engine/host';
import type { CampaignAccess, LoadResult } from '../save';
import { INITIAL_SCREEN, resolveRoute, type RouteTable, type ScreenId } from './routes';
import type { Screen, ScreenDefinition } from './screen';

export interface ScreenShellOptions {
  screens: readonly ScreenDefinition[];
  routes: RouteTable;
  host: EngineHost;
  /** Parent element for screen overlays (`#ui` in index.html). */
  overlayRoot: HTMLElement;
  campaign: CampaignAccess;
  saveOutcome: LoadResult;
}

interface Mounted {
  id: ScreenId;
  screen: Screen;
  overlay: HTMLElement;
  root: ReturnType<EngineHost['createSceneRoot']>;
  assets: LoadedAssets;
}

export class ScreenShell {
  private readonly definitions: ReadonlyMap<ScreenId, ScreenDefinition>;
  private readonly routes: RouteTable;
  private readonly host: EngineHost;
  private readonly overlayRoot: HTMLElement;
  private readonly campaign: CampaignAccess;
  private readonly saveOutcome: LoadResult;
  private mounted: Mounted | null = null;
  private transition: Promise<void> = Promise.resolve();
  private readonly visited: ScreenId[] = [];

  constructor(options: ScreenShellOptions) {
    const defs = new Map<ScreenId, ScreenDefinition>();
    for (const def of options.screens) {
      if (defs.has(def.id)) throw new Error(`screen "${def.id}" registered twice`);
      defs.set(def.id, def);
    }
    for (const id of Object.keys(options.routes) as ScreenId[]) {
      if (!defs.has(id)) throw new Error(`route table names screen "${id}" but no screen is registered for it`);
    }
    this.definitions = defs;
    this.routes = options.routes;
    this.host = options.host;
    this.overlayRoot = options.overlayRoot;
    this.campaign = options.campaign;
    this.saveOutcome = options.saveOutcome;
  }

  /** Id of the active screen, or `null` before `start()`. */
  get activeScreenId(): ScreenId | null {
    return this.mounted?.id ?? null;
  }

  /** Number of screens currently mounted. Must be 0 before start and 1 afterwards. */
  get mountedCount(): number {
    return this.mounted ? 1 : 0;
  }

  /** Number of overlay elements under the overlay root — a DOM-side check of the same invariant. */
  get overlayCount(): number {
    return this.overlayRoot.childElementCount;
  }

  /** Screens visited so far, in order (for scripted navigation checks). */
  get history(): readonly ScreenId[] {
    return this.visited;
  }

  start(initial: ScreenId = INITIAL_SCREEN): Promise<void> {
    if (this.mounted) throw new Error('shell already started');
    return this.enqueue(() => this.switchTo(initial));
  }

  /** Resolve `event` from the active screen through the route table and go there. */
  navigate(event: string): Promise<void> {
    return this.enqueue(() => {
      const from = this.mounted?.id;
      if (!from) throw new Error(`cannot navigate "${event}": shell not started`);
      const to = resolveRoute(this.routes, from, event);
      if (!to) throw new Error(`no route from "${from}" for event "${event}"`);
      return this.switchTo(to);
    });
  }

  /** Wait for any in-flight transition. */
  settled(): Promise<void> {
    return this.transition;
  }

  private enqueue(step: () => Promise<void>): Promise<void> {
    const next = this.transition.then(step);
    this.transition = next.catch(() => {});
    return next;
  }

  private async switchTo(id: ScreenId): Promise<void> {
    const def = this.definitions.get(id);
    if (!def) throw new Error(`no screen registered for "${id}"`);

    const assets = await loadManifest(def.assets, this.host.assetBackend);

    this.unmount();

    const overlay = document.createElement('div');
    overlay.className = 'screen';
    overlay.dataset.screen = id;
    this.overlayRoot.appendChild(overlay);
    const root = this.host.createSceneRoot(`screen:${id}`);
    const screen = def.create();
    this.mounted = { id, screen, overlay, root, assets };
    this.visited.push(id);

    screen.enter({
      overlay,
      app: this.host.app,
      root,
      assets,
      campaign: this.campaign,
      saveOutcome: this.saveOutcome,
      setClearColor: (r, g, b) => this.host.setClearColor(r, g, b),
      navigate: (event) => this.navigate(event),
    });
  }

  private unmount(): void {
    const current = this.mounted;
    if (!current) return;
    this.mounted = null;
    current.screen.exit?.();
    current.overlay.remove();
    current.root?.destroy();
    current.assets.release();
  }
}
