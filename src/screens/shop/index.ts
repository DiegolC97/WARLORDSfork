import { unitName } from '../../names';
import type { ScreenDefinition } from '../../shell/screen';
import { button, heading, note } from '../../ui/placeholder';

export const shopScreen: ScreenDefinition = {
  id: 'shop',
  assets: [],
  create: () => ({
    enter(ctx) {
      ctx.setClearColor(0.05, 0.1, 0.06);
      heading(ctx.overlay, 'Shop');
      note(ctx.overlay, `Owned units: ${ctx.campaign.read().ownedUnits.map(unitName).join(', ')}`);
      button(ctx.overlay, 'Back', () => void ctx.navigate('back'), { action: 'back' });
    },
  }),
};
