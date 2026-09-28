/**
 * Composition root: wires save store, engine host, screens and shell.
 * `main.ts` calls this in the browser; tests call it with a null host.
 */
import type { EngineHost } from './engine/host';
import { SaveStore, createCampaignAccess, type StorageLike } from './save';
import { SCREENS } from './screens';
import { ROUTES } from './shell/routes';
import { ScreenShell } from './shell/screenShell';

export interface AppOptions {
  host: EngineHost;
  overlayRoot: HTMLElement;
  storage: StorageLike;
}

export interface App {
  shell: ScreenShell;
  store: SaveStore;
}

export async function createApp(options: AppOptions): Promise<App> {
  const store = new SaveStore({ storage: options.storage });
  const loaded = store.load();
  const campaign = createCampaignAccess(store, loaded.save);

  const shell = new ScreenShell({
    screens: SCREENS,
    routes: ROUTES,
    host: options.host,
    overlayRoot: options.overlayRoot,
    campaign,
    saveOutcome: loaded,
  });
  await shell.start();
  return { shell, store };
}
