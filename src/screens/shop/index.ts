import { raceName, unitName } from '../../names';
import {
  isUnitId,
  killBounty,
  shopOffers,
  shopPrice,
  unitDisplayName,
  unitStats,
  type UnitId,
} from '../../roster';
import type { RaceId } from '../../save';
import type { ScreenDefinition } from '../../shell/screen';
import { button, heading, note, row } from '../../ui/placeholder';

/**
 * Shop placeholder. Every price, statistic and name on this screen is read
 * from the roster definition: the offer list is `shopOffers` (rules §11),
 * the price `shopPrice`, the bounty `killBounty`. Buying deducts the price
 * and adds the unit to the owned army; the upgrade panel belongs to the
 * shop slice.
 */
export const shopScreen: ScreenDefinition = {
  id: 'shop',
  assets: [],
  create: () => ({
    enter(ctx) {
      ctx.setClearColor(0.05, 0.1, 0.06);
      const { overlay } = ctx;
      heading(overlay, 'Shop');
      const gold = note(overlay, '');
      gold.dataset.role = 'gold';
      const owned = note(overlay, '');
      owned.dataset.role = 'owned';
      const offers = row(overlay);
      offers.dataset.role = 'offers';
      button(overlay, 'Back', () => void ctx.navigate('back'), { action: 'back' });

      const nameFor = (unit: UnitId, race: RaceId | null) => (race ? unitDisplayName(unit, race) : unitName(unit));

      const buy = (unit: UnitId) => {
        const save = ctx.campaign.read();
        const price = shopPrice(unit);
        if (save.gold < price || save.ownedUnits.includes(unit)) return;
        ctx.campaign.update({ gold: save.gold - price, ownedUnits: [...save.ownedUnits, unit] });
        render();
      };

      const render = () => {
        const save = ctx.campaign.read();
        const race = save.chosenRace;
        gold.textContent = `Gold: ${save.gold}`;
        gold.dataset.gold = String(save.gold);
        owned.textContent = `Owned units: ${save.ownedUnits
          .filter(isUnitId)
          .map((u) => nameFor(u, race))
          .join(', ')}`;

        offers.replaceChildren();
        if (!race) {
          const hint = note(offers, 'Pick a race on the campaign map to see what you can buy.');
          hint.dataset.role = 'no-race';
          return;
        }
        for (const unit of shopOffers(save.ownedUnits, race)) {
          const s = unitStats(unit);
          const price = shopPrice(unit);
          const item = document.createElement('div');
          item.className = 'offer';
          item.dataset.offer = String(unit);
          item.dataset.price = String(price);
          item.dataset.bounty = String(killBounty(unit));
          const text = note(item, `${nameFor(unit, race)} — ${price} gold · speed ${s.speed} · armour ${s.hitPoints} · range ${s.range} · max damage ${s.shownMaxDamage} · bounty ${killBounty(unit)}`);
          text.dataset.role = 'offer-text';
          button(item, save.gold >= price ? `Buy for ${price}` : `Costs ${price}`, () => buy(unit), {
            action: `buy:${unit}`,
            disabled: save.gold < price,
          });
          offers.appendChild(item);
        }
        const army = note(offers, `Buying as ${raceName(race)}: units are named for your race.`);
        army.className = 'hint';
      };
      render();
    },
  }),
};
