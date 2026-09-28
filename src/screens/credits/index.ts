import { GAME_TITLE_TEXT, ORIGINAL_GAME } from '../../names';
import type { ScreenDefinition } from '../../shell/screen';
import { button, heading, note } from '../../ui/placeholder';

export const creditsScreen: ScreenDefinition = {
  id: 'credits',
  assets: [],
  create: () => ({
    enter(ctx) {
      ctx.setClearColor(0.23, 0.23, 0.23);
      heading(ctx.overlay, 'Credits');
      const prose = document.createElement('div');
      prose.className = 'prose';
      ctx.overlay.appendChild(prose);
      note(prose, `${GAME_TITLE_TEXT} is an unofficial fan remake.`).dataset.role = 'relationship';
      note(
        prose,
        `Original game: ${ORIGINAL_GAME.title} (${ORIGINAL_GAME.year}) by ${ORIGINAL_GAME.author}.`,
      ).dataset.role = 'original';
      note(
        prose,
        'The remake re-implements the original’s rules with new art, new races and its own code. ' +
          'It is not affiliated with or endorsed by the original author.',
      );
      note(prose, 'Built on the PlayCanvas engine.');
      button(ctx.overlay, 'Back', () => void ctx.navigate('back'), { action: 'back' });
    },
  }),
};
