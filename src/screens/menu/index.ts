import { GAME_TITLE } from '../../names';
import type { ScreenDefinition } from '../../shell/screen';
import { BANNER_TRIO_URL } from './banner';

/**
 * Main menu. Layout follows the original's: a white band carrying the title
 * lockup (small leading line over a large primary line, decorative face) and
 * the starter-trio banner on its right, a vertical entry list below, and a
 * version label top-right. No publisher line, no store promotion.
 *
 * The lockup is text, so a title change in `names/displayNames.ts` needs no
 * new art. The banner is an image at a fixed path (see `banner.ts`).
 */
const ENTRIES: readonly { label: string; event: string }[] = [
  { label: 'Campaign', event: 'campaign' },
  { label: '2 Player Battle', event: 'twoPlayer' },
  { label: 'Instructions', event: 'instructions' },
  { label: 'Options', event: 'options' },
  { label: 'Credits', event: 'credits' },
];

export const menuScreen: ScreenDefinition = {
  id: 'menu',
  assets: [],
  create: () => ({
    enter(ctx) {
      ctx.setClearColor(0.23, 0.23, 0.23);
      const { overlay } = ctx;
      overlay.classList.add('menu');

      const version = document.createElement('div');
      version.className = 'version gothic outlined';
      version.dataset.role = 'version';
      version.textContent = `v${__APP_VERSION__}`;
      overlay.appendChild(version);

      const band = document.createElement('div');
      band.className = 'band';
      overlay.appendChild(band);

      const lockup = document.createElement('h1');
      lockup.className = 'lockup gothic outlined';
      lockup.dataset.role = 'title';
      const leading = document.createElement('span');
      leading.className = 'leading';
      leading.textContent = GAME_TITLE.leading;
      const primary = document.createElement('span');
      primary.className = 'primary';
      primary.textContent = GAME_TITLE.primary;
      lockup.append(leading, primary);
      overlay.appendChild(lockup);

      const banner = document.createElement('div');
      banner.className = 'banner';
      const img = document.createElement('img');
      img.src = BANNER_TRIO_URL;
      img.alt = '';
      img.dataset.role = 'banner';
      banner.appendChild(img);
      overlay.appendChild(banner);

      const entries = document.createElement('nav');
      entries.className = 'entries';
      for (const entry of ENTRIES) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'gothic outlined';
        b.dataset.action = entry.event;
        b.textContent = entry.label;
        b.addEventListener('click', () => void ctx.navigate(entry.event));
        entries.appendChild(b);
      }
      overlay.appendChild(entries);
    },
  }),
};
