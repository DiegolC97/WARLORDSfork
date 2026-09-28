import { raceName } from '../../names';
import type { ScreenDefinition } from '../../shell/screen';
import { button, heading, note, row } from '../../ui/placeholder';

/**
 * Battle placeholder. Applies the saved rendering zoom to its scene root so
 * the battle slice inherits the setting: everything it parents under
 * `ctx.root` is scaled by `campaign.zoom`.
 */
export const battleScreen: ScreenDefinition = {
  id: 'battle',
  assets: [],
  create: () => ({
    enter(ctx) {
      const { zoom, chosenRace } = ctx.campaign.read();
      ctx.root?.setLocalScale(zoom, zoom, zoom);
      ctx.overlay.dataset.zoom = String(zoom);

      ctx.setClearColor(0.12, 0.05, 0.05);
      heading(ctx.overlay, 'Battle');
      note(ctx.overlay, `Fighting as ${raceName(chosenRace)} · zoom ×${zoom}`);
      const r = row(ctx.overlay);
      button(r, 'Finish battle', () => void ctx.navigate('finished'), { action: 'finished' });
      button(r, 'Retreat', () => void ctx.navigate('retreat'), { action: 'retreat' });
    },
  }),
};
