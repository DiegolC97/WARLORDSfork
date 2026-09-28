import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, type App } from '../../app';
import { NullEngineHost } from '../../engine/nullHost';
import { GAME_TITLE } from '../../names';
import { MemoryStorage } from '../../save';
import { menuScreen } from './index';
import { BANNER_TRIO_URL } from './banner';

/** Anything on the original's menu that must be gone: its name, publisher line, store promotion. */
const ORIGINAL_MENU_REFERENCES = [
  /warlords/i,
  /call to arms/i,
  /ben olding/i,
  /iphone/i,
  /itunes/i,
  /play more games/i,
  /app store/i,
];

let overlayRoot: HTMLElement;
let app: App;

beforeEach(async () => {
  document.body.innerHTML = '<div id="ui"></div>';
  overlayRoot = document.getElementById('ui')!;
  app = await createApp({ host: new NullEngineHost(), overlayRoot, storage: new MemoryStorage() });
  await app.shell.navigate('ready');
});

describe('main menu', () => {
  it('renders the two-line lockup from the naming file', () => {
    const title = overlayRoot.querySelector('[data-role="title"]')!;
    expect(title.querySelector('.leading')!.textContent).toBe(GAME_TITLE.leading);
    expect(title.querySelector('.primary')!.textContent).toBe(GAME_TITLE.primary);
  });

  it('carries no reference to the original game, its publisher or store promotions (AC 1)', () => {
    const text = overlayRoot.textContent ?? '';
    const assetList = [...menuScreen.assets.map((a) => a.url), BANNER_TRIO_URL, ...[...overlayRoot.querySelectorAll('img')].map((i) => i.getAttribute('src'))];
    for (const ref of ORIGINAL_MENU_REFERENCES) {
      expect(text, `menu text matches ${ref}`).not.toMatch(ref);
      for (const url of assetList) expect(url, `asset ${url} matches ${ref}`).not.toMatch(ref);
    }
    expect(overlayRoot.querySelector('a[href]')).toBeNull();
  });

  it('lists exactly the five entries in order', () => {
    const labels = [...overlayRoot.querySelectorAll('.entries button')].map((b) => b.textContent);
    expect(labels).toEqual(['Campaign', '2 Player Battle', 'Instructions', 'Options', 'Credits']);
  });

  it('shows a version label and the banner slot', () => {
    expect(overlayRoot.querySelector('[data-role="version"]')!.textContent).toMatch(/^v\d+\.\d+\.\d+/);
    expect(overlayRoot.querySelector('img[data-role="banner"]')!.getAttribute('src')).toBe(BANNER_TRIO_URL);
  });
});
