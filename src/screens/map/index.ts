import {
  CONTESTED,
  CONTESTED_COLOUR,
  RACE_COLOURS,
  attackableRegions,
  battlesRemaining,
  battlesWon,
  campaignStarted,
  initialOwners,
  isCampaignComplete,
  newCampaignPatch,
  type RegionId,
} from '../../campaign';
import { CONTESTED_LABEL, raceName, regionName } from '../../names';
import { BLOC_RACES, RACES, UNLOCKABLE_RACE, selectableRaces, type RaceId } from '../../save';
import type { ScreenDefinition } from '../../shell/screen';
import { button, heading, note, row } from '../../ui/placeholder';
import { buildMap } from './hexMap';

/**
 * Campaign map. Before the first battle the player picks a race; the pick
 * starts the campaign (three regions held, every other region defended) and
 * is written to the save at once. From then on the map draws the 28 regions
 * coloured by bloc, the player's holdings, and an arrow to every region that
 * can legally be attacked. Clicking one records the target in the save and
 * goes to battle.
 */
export const mapScreen: ScreenDefinition = {
  id: 'map',
  assets: [],
  create: () => ({
    enter(ctx) {
      ctx.setClearColor(0.06, 0.08, 0.12);
      const { overlay } = ctx;
      overlay.classList.add('map');
      heading(overlay, 'Campaign map');
      const status = note(overlay, '');
      status.dataset.role = 'status';
      const hint = note(overlay, '');
      hint.className = 'hint';
      hint.dataset.role = 'hint';
      const picker = row(overlay);
      picker.dataset.role = 'race-picker';
      const mapSlot = document.createElement('div');
      mapSlot.className = 'map-slot';
      overlay.appendChild(mapSlot);
      const legend = document.createElement('div');
      legend.className = 'legend';
      legend.dataset.role = 'legend';
      overlay.appendChild(legend);
      const targets = row(overlay);
      targets.dataset.role = 'targets';
      const actions = row(overlay);

      // A battle left pending (the player quit mid-battle) is dropped on return to the map.
      if (ctx.campaign.read().battleRegion !== null) ctx.campaign.update({ battleRegion: null });
      // A save with a race but no territory (written before the map existed) starts now.
      {
        const s = ctx.campaign.read();
        if (s.chosenRace && !campaignStarted(s.regionOwners)) {
          ctx.campaign.update({ regionOwners: initialOwners(s.chosenRace) });
        }
      }

      const pick = (race: RaceId) => {
        ctx.campaign.update({ chosenRace: race, regionOwners: initialOwners(race), battleRegion: null });
        render();
      };
      const attack = (id: RegionId) => {
        if (!attackableRegions(ctx.campaign.read().regionOwners).includes(id)) return;
        ctx.campaign.update({ battleRegion: id });
        void ctx.navigate('battle');
      };
      const startNewCampaign = () => {
        ctx.campaign.update(newCampaignPatch(ctx.campaign.read()));
        render();
      };

      const render = () => {
        const save = ctx.campaign.read();
        const race = save.chosenRace;
        const started = race !== null && campaignStarted(save.regionOwners);
        const open = started ? attackableRegions(save.regionOwners) : [];
        const complete = started && isCampaignComplete(save.regionOwners);

        picker.replaceChildren();
        if (!started) {
          const allowed = selectableRaces(save.raceUnlocked);
          for (const r of RACES) {
            const locked = !allowed.includes(r);
            button(picker, locked ? `${raceName(r)} (locked)` : raceName(r), () => pick(r), {
              action: `pick-race:${r}`,
              disabled: locked,
            });
          }
        }

        mapSlot.replaceChildren(buildMap({ owners: save.regionOwners, playerRace: race, onAttack: attack }));

        legend.replaceChildren();
        for (const r of BLOC_RACES) legend.appendChild(swatch(RACE_COLOURS[r], raceName(r), r));
        legend.appendChild(swatch(CONTESTED_COLOUR, CONTESTED_LABEL, CONTESTED, true));
        if (race) legend.appendChild(swatch(RACE_COLOURS[race], `Your holdings (${raceName(race)})`, 'player'));

        targets.replaceChildren();
        for (const id of open) {
          button(targets, `Attack ${regionName(id)}`, () => attack(id), { action: `attack:${id}` });
        }

        actions.replaceChildren();
        if (started && open.length === 0) {
          button(actions, 'New campaign', startNewCampaign, { action: 'new-campaign' });
        }
        button(actions, 'Shop', () => void ctx.navigate('shop'), { action: 'shop' });
        button(actions, 'Back', () => void ctx.navigate('back'), { action: 'back' });

        if (!started) {
          status.textContent = 'Pick a race before your first battle';
          hint.textContent =
            'Your race starts with three regions. Each other region is held by the race whose colour it wears; ' +
            `the hatched regions in the centre are ${CONTESTED_LABEL.toLowerCase()} and held by a mixed host that fights harder.`;
        } else if (complete) {
          status.textContent = `Playing as ${raceName(race)} · every region is yours · gold ${save.gold}`;
          hint.textContent =
            `Campaign complete: no region is left to attack. ${raceName(UNLOCKABLE_RACE)} is unlocked for your next campaign. ` +
            'Start a new campaign to play again as any race you have unlocked.';
        } else if (open.length === 0) {
          status.textContent = `Playing as ${raceName(race)} · ${battlesWon(save.regionOwners)} of 25 battles won · gold ${save.gold}`;
          hint.textContent = 'No region can be attacked from your holdings. Start a new campaign to continue.';
        } else {
          status.textContent =
            `Playing as ${raceName(race)} · ${battlesWon(save.regionOwners)} of 25 battles won · ` +
            `${battlesRemaining(save.regionOwners)} regions remain · gold ${save.gold}`;
          hint.textContent =
            'Arrows mark the regions you can attack from your territory. Click one to go to battle; ' +
            'each region shows the race that defends it. Visit the shop to spend your gold before you march.';
        }
      };
      render();
    },
  }),
};

function swatch(colour: string, label: string, key: string, hatched = false): HTMLElement {
  const item = document.createElement('span');
  item.className = 'swatch';
  item.dataset.legend = key;
  const box = document.createElement('i');
  box.style.background = hatched
    ? `repeating-linear-gradient(45deg, ${colour}, ${colour} 3px, #8a8a8a 3px, #8a8a8a 5px)`
    : colour;
  if (key === 'player') box.className = 'player';
  item.append(box, document.createTextNode(label));
  return item;
}
