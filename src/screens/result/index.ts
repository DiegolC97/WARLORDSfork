import { battlesWon, campaignStarted, isCampaignComplete } from '../../campaign';
import { raceName } from '../../names';
import { UNLOCKABLE_RACE } from '../../save';
import type { ScreenDefinition } from '../../shell/screen';
import { button, heading, note, row } from '../../ui/placeholder';

export const resultScreen: ScreenDefinition = {
  id: 'result',
  assets: [],
  create: () => ({
    enter(ctx) {
      ctx.setClearColor(0.1, 0.1, 0.04);
      heading(ctx.overlay, 'Battle result');
      const save = ctx.campaign.read();
      if (campaignStarted(save.regionOwners)) {
        const progress = note(ctx.overlay, `Campaign: ${battlesWon(save.regionOwners)} of 25 battles won`);
        progress.dataset.role = 'progress';
        if (isCampaignComplete(save.regionOwners)) {
          const unlocked = note(ctx.overlay, `The map is yours. ${raceName(UNLOCKABLE_RACE)} unlocked.`);
          unlocked.dataset.role = 'unlocked';
        }
      }
      const r = row(ctx.overlay);
      button(r, 'Continue', () => void ctx.navigate('continue'), { action: 'continue' });
      button(r, 'Main menu', () => void ctx.navigate('menu'), { action: 'menu' });
    },
  }),
};
