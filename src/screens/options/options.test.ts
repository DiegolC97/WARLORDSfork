import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, type App } from '../../app';
import { NullEngineHost } from '../../engine/nullHost';
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
    expect(overlayRoot.textContent).toMatch(/zoom ×1\.25/);
  });

  it('the battle screen scales its scene root by the zoom', async () => {
    const scales: number[][] = [];
    const host = new NullEngineHost();
    host.createSceneRoot = () => ({ setLocalScale: (x: number, y: number, z: number) => void scales.push([x, y, z]), destroy() {} }) as never;
    document.body.innerHTML = '<div id="ui"></div>';
    overlayRoot = document.getElementById('ui')!;
    const store = new SaveStore({ storage });
    store.write({ ...store.load().save, zoom: 0.75 });
    app = await createApp({ host, overlayRoot, storage });
    await app.shell.navigate('ready');
    await app.shell.navigate('twoPlayer');
    expect(scales).toEqual([[0.75, 0.75, 0.75]]);
  });
});
