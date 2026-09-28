import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, type App } from '../app';
import { NullEngineHost } from '../engine/nullHost';
import { MemoryStorage, SaveStore } from '../save';
import { HOME_SCREEN, ROUTES, SCREEN_IDS, pathBetween, type ScreenId } from './routes';

let host: NullEngineHost;
let overlayRoot: HTMLElement;
let storage: MemoryStorage;
let app: App;

const assertExactlyOneActive = (expected: ScreenId) => {
  expect(app.shell.activeScreenId).toBe(expected);
  expect(app.shell.mountedCount).toBe(1);
  expect(app.shell.overlayCount).toBe(1);
  expect(overlayRoot.firstElementChild?.getAttribute('data-screen')).toBe(expected);
};

/** Click the placeholder button wired to `action` on the active overlay. */
const click = async (action: string) => {
  const btn = overlayRoot.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`);
  if (!btn) throw new Error(`no button for action "${action}" on ${app.shell.activeScreenId}`);
  expect(btn.disabled, `button "${action}" is disabled`).toBe(false);
  btn.click();
  await app.shell.settled();
};

beforeEach(async () => {
  document.body.innerHTML = '<div id="ui"></div>';
  overlayRoot = document.getElementById('ui')!;
  host = new NullEngineHost();
  storage = new MemoryStorage();
  app = await createApp({ host, overlayRoot, storage });
});

describe('ScreenShell', () => {
  it('boots to the boot screen with exactly one screen active', () => {
    assertExactlyOneActive('boot');
    expect(host.rootsCreated).toEqual(['screen:boot']);
  });

  it('scripted pass: from the main menu, every screen is reached and returned from (AC 2, AC 3)', async () => {
    await app.shell.navigate('ready');
    assertExactlyOneActive(HOME_SCREEN);

    for (const target of SCREEN_IDS) {
      if (target === 'boot' || target === HOME_SCREEN) continue;

      const there = pathBetween(ROUTES, HOME_SCREEN, target)!;
      for (const event of there) {
        const before = app.shell.activeScreenId!;
        await app.shell.navigate(event);
        assertExactlyOneActive(ROUTES[before][event]!);
      }
      assertExactlyOneActive(target);

      const back = pathBetween(ROUTES, target, HOME_SCREEN)!;
      for (const event of back) {
        const before = app.shell.activeScreenId!;
        await app.shell.navigate(event);
        assertExactlyOneActive(ROUTES[before][event]!);
      }
      assertExactlyOneActive(HOME_SCREEN);
    }

    const visited = new Set(app.shell.history);
    for (const id of SCREEN_IDS) expect(visited.has(id), `never visited "${id}"`).toBe(true);
    expect(app.shell.history.at(-1)).toBe(HOME_SCREEN);
  });

  it('every menu entry navigates to its screen and returns (no dead entry)', async () => {
    await click('ready');
    assertExactlyOneActive('menu');
    for (const [entry, target] of Object.entries(ROUTES.menu)) {
      await click(entry);
      assertExactlyOneActive(target);
      const back = pathBetween(ROUTES, target, HOME_SCREEN)!;
      for (const event of back) await app.shell.navigate(event);
      assertExactlyOneActive('menu');
    }
  });

  it('the placeholder buttons drive the same routes (no dead button)', async () => {
    await click('ready');
    assertExactlyOneActive('menu');
    for (const entry of ['instructions', 'options', 'credits']) {
      await click(entry);
      assertExactlyOneActive(entry as ScreenId);
      await click('back');
      assertExactlyOneActive('menu');
    }
    await click('campaign');
    assertExactlyOneActive('map');
    await click('shop');
    assertExactlyOneActive('shop');
    await click('back');
    assertExactlyOneActive('map');
    await click('pick-race:race3');
    await click('battle');
    assertExactlyOneActive('battle');
    await click('retreat');
    assertExactlyOneActive('map');
    await click('battle');
    await click('finished');
    assertExactlyOneActive('result');
    await click('continue');
    assertExactlyOneActive('map');
    await click('back');
    assertExactlyOneActive('menu');
    await click('twoPlayer');
    assertExactlyOneActive('battle');
    await click('finished');
    await click('menu');
    assertExactlyOneActive('menu');
  });

  it('rejects an event the route table does not know, naming screen and event', async () => {
    await expect(app.shell.navigate('teleport')).rejects.toThrow(/no route from "boot" for event "teleport"/);
    assertExactlyOneActive('boot');
  });

  it('tears the previous screen down: exit hook, overlay removed, assets released', async () => {
    const bootOverlay = overlayRoot.firstElementChild!;
    await app.shell.navigate('ready');
    expect(bootOverlay.isConnected).toBe(false);
    expect(host.rootsCreated).toEqual(['screen:boot', 'screen:menu']);
  });
});

describe('race pick before the first battle', () => {
  it('battle is disabled until a race is chosen; the pick is written to the save', async () => {
    await click('ready');
    await click('campaign');
    const battle = overlayRoot.querySelector<HTMLButtonElement>('button[data-action="battle"]')!;
    expect(battle.disabled).toBe(true);
    expect(new SaveStore({ storage }).load().save.chosenRace).toBeNull();

    await click('pick-race:race5');
    expect(battle.disabled).toBe(false);
    expect(new SaveStore({ storage }).load().save.chosenRace).toBe('race5');
  });

  it('a save with a race already chosen skips the pick', async () => {
    document.body.innerHTML = '<div id="ui"></div>';
    overlayRoot = document.getElementById('ui')!;
    const store = new SaveStore({ storage });
    store.write({ ...store.load().save, chosenRace: 'race1', gold: 999 });
    app = await createApp({ host: new NullEngineHost(), overlayRoot, storage });
    await click('ready');
    await click('campaign');
    expect(overlayRoot.querySelector<HTMLButtonElement>('button[data-action="battle"]')!.disabled).toBe(false);
  });
});

describe('save reload through the application (AC 5)', () => {
  it('a campaign written in one app instance is read back by a fresh one', async () => {
    await click('ready');
    await click('campaign');
    await click('pick-race:race2');

    document.body.innerHTML = '<div id="ui"></div>';
    overlayRoot = document.getElementById('ui')!;
    const second = await createApp({ host: new NullEngineHost(), overlayRoot, storage });
    expect(second.store.load().outcome).toBe('loaded');
    expect(second.store.load().save.chosenRace).toBe('race2');
    expect(overlayRoot.textContent).toMatch(/Save: loaded/);
  });
});
