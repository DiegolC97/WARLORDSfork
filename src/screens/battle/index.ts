import { applyVictory, battleSetup, isRegionId, type BattleSetup } from '../../campaign';
import { CONTESTED_LABEL, raceName, regionName, unitName } from '../../names';
import { BLOC_RACES, isUnitId, killBounty, raceVisuals, twoPlayerArmy, unitDisplayName, type UnitId } from '../../roster';
import type { RaceId } from '../../save';
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
 * `battleRegion` (the two-player entry) each side receives the roster's
 * two-player army: the starting trio plus two random generic units.
 *
 * Every unit name, bounty and visual on this screen is resolved through the
 * roster definition; nothing here knows a statistic.
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

      const target = save.battleRegion;
      const setup: BattleSetup | null = target !== null && isRegionId(target) ? battleSetup(save.regionOwners, target) : null;

      if (setup) {
        note(ctx.overlay, `Fighting as ${raceName(chosenRace)} · zoom ×${zoom}`);
        ctx.overlay.dataset.region = setup.region;
        ctx.overlay.dataset.defender = setup.defender.kind === 'race' ? setup.defender.race : 'contested';
        const defenderRace = setup.defender.kind === 'race' ? setup.defender.race : null;
        const defenderName = defenderRace ? raceName(defenderRace) : `${CONTESTED_LABEL} host`;
        const attacking = note(ctx.overlay, `Attacking ${regionName(setup.region)} · defended by ${defenderName}`);
        attacking.dataset.role = 'defender';
        const units = note(ctx.overlay, `Defending units: ${setup.units.map((u) => describe(u, defenderRace)).join(', ')}`);
        units.dataset.role = 'defending-units';
        units.dataset.units = setup.units.join(',');
        if (defenderRace) {
          const visuals = raceVisuals(defenderRace);
          units.dataset.atlas = visuals.atlas;
          units.dataset.tint = visuals.tint;
        }
        if (setup.statBonus !== 1) {
          const bonus = note(ctx.overlay, `Defender stats ×${setup.statBonus}`);
          bonus.dataset.role = 'stat-bonus';
          bonus.dataset.bonus = String(setup.statBonus);
        }
        const own = save.ownedUnits.filter(isUnitId);
        const army = note(ctx.overlay, `Your army: ${own.map((u) => describe(u, chosenRace)).join(', ')}`);
        army.dataset.role = 'army';
        army.dataset.units = own.join(',');
        if (chosenRace) {
          const visuals = raceVisuals(chosenRace);
          army.dataset.atlas = visuals.atlas;
          army.dataset.tint = visuals.tint;
        }
      } else {
        // Two-player skirmish: no setup screen yet, so the left side plays the
        // saved race (or the first bloc race) and the right a random bloc race.
        const left: RaceId = chosenRace ?? BLOC_RACES[0];
        const right: RaceId = BLOC_RACES[Math.floor(Math.random() * BLOC_RACES.length)] ?? BLOC_RACES[0];
        ctx.overlay.dataset.mode = 'two-player';
        note(ctx.overlay, `Two-player battle · zoom ×${zoom}`);
        for (const [side, race] of [['left', left], ['right', right]] as const) {
          const army = twoPlayerArmy(race);
          const line = note(ctx.overlay, `${side === 'left' ? 'Left' : 'Right'} (${raceName(race)}): ${army.map((u) => describe(u, race)).join(', ')}`);
          line.dataset.role = `two-player-${side}`;
          line.dataset.race = race;
          line.dataset.units = army.join(',');
          const visuals = raceVisuals(race);
          line.dataset.atlas = visuals.atlas;
          line.dataset.tint = visuals.tint;
        }
      }

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

/** "<name> (bounty N)": the name the fielding race gives the unit, or the base name for the mixed host. */
function describe(unit: UnitId, race: RaceId | null): string {
  return `${race ? unitDisplayName(unit, race) : unitName(unit)} (bounty ${killBounty(unit)})`;
}
