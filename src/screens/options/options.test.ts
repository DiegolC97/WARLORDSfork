import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, type App } from '../../app';
import { HeadlessEngineHost } from '../../engine/headlessHost';
import { NullEngineHost } from '../../engine/nullHost';
import { fieldBandOnScreen, fieldHandle } from '../../render';
import { MemoryStorage, SaveStore } from '../../save';

let overlayRoot: HTMLElement;
let storage: MemoryStorage;
let app: App;

const boot = async () => {
  document.body.innerHTML = '<div id="ui"></div>';
  overlayRoot = document.getElementById('ui')!;
  app = await createApp({ host: new NullEngineHost(), overlayRoot, storage });
  await app.shell.navigate('ready');
};

const click = async (action: string) => {
  const btn = overlayRoot.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`);
  if (!btn) throw new Error(`no button "${action}" on ${app.shell.activeScreenId}`);
  btn.click();
  await app.shell.settled();
};

beforeEach(async () => {
  storage = new MemoryStorage();
  await boot();
});

describe('options', () => {
  it('toggles sound and music and writes them to the save', async () => {
    await click('options');
    await click('toggle-sound');
    await click('toggle-music');
    const save = new SaveStore({ storage }).load().save;
    expect(save.soundOn).toBe(false);
    expect(save.musicOn).toBe(false);
    expect(overlayRoot.textContent).toMatch(/Sound: Off/);
  });

  it('zoom persists across a restart and is applied by the battle screen (AC 7)', async () => {
    await click('options');
    await click('zoom:1.25');
    expect(new SaveStore({ storage }).load().save.zoom).toBe(1.25);

    await boot(); // fresh app over the same storage = restart
    expect(app.store.load().outcome).toBe('loaded');
    await click('twoPlayer');
    expect(app.shell.activeScreenId).toBe('battle');
    expect(overlayRoot.querySelector('[data-screen="battle"]')!.getAttribute('data-zoom')).toBe('1.25');
    const stage = overlayRoot.querySelector<HTMLElement>('[data-role="stage"]')!;
    expect(stage.style.transform).toBe('scale(1.25)');
  });

  it('the battle screen renders its field at the saved zoom', async () => {
    const readPublic = (url: string) => {
      try {
        return readFileSync(join(process.cwd(), 'public', url), 'utf8');
      } catch {
        return null;
      }
    };
    const host = new HeadlessEngineHost({ width: 1400, height: 900, readText: readPublic });
    document.body.innerHTML = '<div id="ui"></div>';
    overlayRoot = document.getElementById('ui')!;
    const store = new SaveStore({ storage });
    store.write({ ...store.load().save, zoom: 0.75 });
    app = await createApp({ host, overlayRoot, storage });
    await app.shell.navigate('ready');
    await app.shell.navigate('twoPlayer');
    const field = fieldHandle(overlayRoot.querySelector<HTMLElement>('[data-screen="battle"]')!)!;
    expect(field.view.zoom).toBe(0.75);
    // The engine camera's viewport is the field band at that zoom: 525 px wide on the canvas.
    const band = fieldBandOnScreen(0.75, 1400, 900);
    expect(field.view.camera.camera!.rect.z * 1400).toBeCloseTo(band.width, 6);
    expect(band.width).toBeCloseTo(0.75 * 700.53, 1);
    host.destroy();
  });
});
