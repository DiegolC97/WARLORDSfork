import { applyVictory, battleSetup, isRegionId, type BattleSetup } from '../../campaign';
import { CONTESTED_LABEL, raceName, regionName, unitName } from '../../names';
import type { ScreenDefinition } from '../../shell/screen';
import { button, heading, note, row } from '../../ui/placeholder';

/**
 * Battle placeholder. Applies the saved rendering zoom to its scene root so
 * the battle slice inherits the setting: everything it parents under
 * `ctx.root` is scaled by `campaign.zoom`.
 *
 * In a campaign the save's `battleRegion` names the region under attack; the
 * defenders come from the campaign rules (that region's race and its roster,
 * or the contested mixed host with its stat bonus). "Finish battle" stands
 * in for a victory and hands the region to the player. With no
 * `battleRegion` (the two-player entry) the battle is a plain skirmish.
 */
export const battleScreen: ScreenDefinition = {
  id: 'battle',
  assets: [],
  create: () => ({
    enter(ctx) {
      const save = ctx.campaign.read();
      const { zoom, chosenRace } = save;
      ctx.root?.setLocalScale(zoom, zoom, zoom);
      ctx.overlay.dataset.zoom = String(zoom);

      ctx.setClearColor(0.12, 0.05, 0.05);
      heading(ctx.overlay, 'Battle');
      note(ctx.overlay, `Fighting as ${raceName(chosenRace)} · zoom ×${zoom}`);

      const target = save.battleRegion;
      const setup: BattleSetup | null = target !== null && isRegionId(target) ? battleSetup(save.regionOwners, target) : null;
      if (setup) {
        ctx.overlay.dataset.region = setup.region;
        ctx.overlay.dataset.defender = setup.defender.kind === 'race' ? setup.defender.race : 'contested';
        const defenderName = setup.defender.kind === 'race' ? raceName(setup.defender.race) : `${CONTESTED_LABEL} host`;
        const attacking = note(ctx.overlay, `Attacking ${regionName(setup.region)} · defended by ${defenderName}`);
        attacking.dataset.role = 'defender';
        const units = note(ctx.overlay, `Defending units: ${setup.units.map(unitName).join(', ')}`);
        units.dataset.role = 'defending-units';
        units.dataset.units = setup.units.join(',');
        if (setup.statBonus !== 1) {
          const bonus = note(ctx.overlay, `Defender stats ×${setup.statBonus}`);
          bonus.dataset.role = 'stat-bonus';
          bonus.dataset.bonus = String(setup.statBonus);
        }
      }
      const army = note(ctx.overlay, `Your army: ${save.ownedUnits.map(unitName).join(', ')}`);
      army.dataset.role = 'army';

      const r = row(ctx.overlay);
      button(
        r,
        'Finish battle',
        () => {
          if (setup) {
            const patch = applyVictory(ctx.campaign.read(), setup.region);
            ctx.campaign.update(patch ?? { battleRegion: null });
          }
          void ctx.navigate('finished');
        },
        { action: 'finished' },
      );
      button(
        r,
        'Retreat',
        () => {
          if (setup) ctx.campaign.update({ battleRegion: null });
          void ctx.navigate('retreat');
        },
        { action: 'retreat' },
      );
    },
  }),
};
