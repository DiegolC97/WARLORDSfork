import { raceName } from '../../names';
import { RACES, type RaceId } from '../../save';
import type { ScreenDefinition } from '../../shell/screen';
import { button, heading, note, row } from '../../ui/placeholder';

/**
 * Campaign map placeholder. Also hosts the one piece of required behaviour in
 * this slice: the player picks a race before the first battle, and the pick is
 * written to the save at that moment.
 */
export const mapScreen: ScreenDefinition = {
  id: 'map',
  assets: [],
  create: () => ({
    enter(ctx) {
      ctx.setClearColor(0.06, 0.08, 0.12);
      heading(ctx.overlay, 'Campaign map');
      const status = note(ctx.overlay, '');
      const races = row(ctx.overlay);
      const actions = row(ctx.overlay);

      const battleButton = button(actions, 'Battle', () => void ctx.navigate('battle'), {
        action: 'battle',
        disabled: true,
      });
      button(actions, 'Shop', () => void ctx.navigate('shop'), { action: 'shop' });
      button(actions, 'Back', () => void ctx.navigate('back'), { action: 'back' });

      const refresh = () => {
        const race = ctx.campaign.read().chosenRace;
        status.textContent = race ? `Race: ${raceName(race)}` : 'Pick a race before your first battle';
        battleButton.disabled = race === null;
      };

      for (const race of RACES) {
        button(races, raceName(race), () => pick(race), { action: `pick-race:${race}` });
      }
      const pick = (race: RaceId) => {
        ctx.campaign.update({ chosenRace: race });
        refresh();
      };
      refresh();
    },
  }),
};
