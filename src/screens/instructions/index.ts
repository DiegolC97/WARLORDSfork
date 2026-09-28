import type { ScreenDefinition } from '../../shell/screen';
import { button, heading } from '../../ui/placeholder';
import { INSTRUCTIONS } from './copy';

export const instructionsScreen: ScreenDefinition = {
  id: 'instructions',
  assets: [],
  create: () => ({
    enter(ctx) {
      ctx.setClearColor(0.23, 0.23, 0.23);
      heading(ctx.overlay, 'Instructions');
      const prose = document.createElement('div');
      prose.className = 'prose';
      for (const section of INSTRUCTIONS) {
        const h = document.createElement('h2');
        h.textContent = section.title;
        h.dataset.topic = section.topic;
        const p = document.createElement('p');
        p.textContent = section.body;
        prose.append(h, p);
      }
      ctx.overlay.appendChild(prose);
      button(ctx.overlay, 'Back', () => void ctx.navigate('back'), { action: 'back' });
    },
  }),
};
