import type { ScreenDefinition } from '../../shell/screen';
import { button, heading, row } from '../../ui/placeholder';

export const resultScreen: ScreenDefinition = {
  id: 'result',
  assets: [],
  create: () => ({
    enter(ctx) {
      ctx.setClearColor(0.1, 0.1, 0.04);
      heading(ctx.overlay, 'Battle result');
      const r = row(ctx.overlay);
      button(r, 'Continue', () => void ctx.navigate('continue'), { action: 'continue' });
      button(r, 'Main menu', () => void ctx.navigate('menu'), { action: 'menu' });
    },
  }),
};
