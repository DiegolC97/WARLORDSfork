import { raceName, unitName } from '../../names';
import {
  ARMY_SLOTS,
  UPGRADE_TRACKS,
  hasArmySlot,
  isUnitId,
  killBounty,
  raceVisuals,
  referencedAtlases,
  shopOffers,
  shopPrice,
  unitDisplayName,
  unitStats,
  upgradeCost,
  upgradePanel,
  type RaceId,
  type UnitId,
  type UpgradeTrack,
} from '../../roster';
import type { ScreenDefinition } from '../../shell/screen';
import { button, heading, note } from '../../ui/placeholder';
import { NO_ATLAS, atlasAssetId, atlasFromAssets, buildPortrait, type AtlasSource } from '../../ui/portrait';

/**
 * The shop (rules §9, §11): where the campaign's gold is spent between
 * battles. Every number on the screen is read from the roster definition
 * and the save — the seven upgrade tracks with their level and the cost of
 * the next one (`upgradeCost`), the army rack of `ARMY_SLOTS` unit types,
 * and the "Buy unit" list (`shopOffers`, priced by `shopPrice`).
 *
 * Affordability is decided on every render: a row whose cost exceeds the
 * current gold is greyed and its control disabled; the moment gold
 * suffices again it is buyable. Each purchase goes through
 * `ctx.campaign.update`, which persists at once, so quitting after buying
 * cannot duplicate gold. Nothing here holds a rule: the shop only deducts
 * what the roster says and writes what the simulation reads.
 */
export const shopScreen: ScreenDefinition = {
  id: 'shop',
  assets: referencedAtlases().map((url) => ({ id: atlasAssetId(url), type: 'json' as const, url })),
  create: () => ({
    enter(ctx) {
      ctx.setClearColor(0.05, 0.1, 0.06);
      const { overlay } = ctx;
      overlay.classList.add('shop');

      // ---- header: title, gold and kills
      const header = section(overlay, 'header');
      heading(header, 'Shop');
      const totals = document.createElement('div');
      totals.className = 'totals';
      header.appendChild(totals);
      const gold = stat(totals, 'gold', 'Gold');
      const kills = stat(totals, 'kills', 'Kills');
      const playing = note(header, '');
      playing.className = 'hint';
      playing.dataset.role = 'playing';

      // ---- upgrade panel
      const upgrades = section(overlay, 'upgrades');
      const upgradesTitle = document.createElement('h2');
      upgradesTitle.textContent = 'Upgrades';
      upgrades.appendChild(upgradesTitle);
      const tracks = document.createElement('div');
      tracks.className = 'tracks';
      tracks.dataset.role = 'tracks';
      upgrades.appendChild(tracks);

      // ---- army rack
      const army = section(overlay, 'army');
      const armyTitle = document.createElement('h2');
      armyTitle.textContent = 'Army';
      army.appendChild(armyTitle);
      const rack = document.createElement('div');
      rack.className = 'rack';
      rack.dataset.role = 'rack';
      rack.dataset.slots = String(ARMY_SLOTS);
      army.appendChild(rack);
      const rackNote = note(army, '');
      rackNote.className = 'hint';
      rackNote.dataset.role = 'rack-note';

      // ---- buy-unit panel (opened from the rack's buy slot)
      const offers = section(overlay, 'offers');
      offers.hidden = true;
      const offersTitle = document.createElement('h2');
      offersTitle.textContent = 'Buy unit';
      offers.appendChild(offersTitle);
      const offersNote = note(offers, '');
      offersNote.className = 'hint';
      offersNote.dataset.role = 'offers-note';
      const offerList = document.createElement('div');
      offerList.className = 'offer-list';
      offerList.dataset.role = 'offers';
      offers.appendChild(offerList);
      let offersOpen = false;

      // ---- footer: main menu, the strategy guide and onward to the map
      const footer = section(overlay, 'footer');
      button(footer, 'Main menu', () => void ctx.navigate('menu'), { action: 'menu' });
      button(footer, 'Strategy guide', () => void ctx.navigate('guide'), { action: 'guide' });
      button(footer, 'Continue', () => void ctx.navigate('continue'), { action: 'continue' });

      const nameFor = (unit: UnitId, race: RaceId | null) => (race ? unitDisplayName(unit, race) : unitName(unit));

      // ---- purchases: read, check against the roster, write once, re-render
      const buyUpgrade = (track: UpgradeTrack) => {
        const save = ctx.campaign.read();
        const level = save.upgradeLevels[track] ?? 0;
        const cost = upgradeCost(track, level);
        if (save.gold < cost) return;
        ctx.campaign.update({ gold: save.gold - cost, upgradeLevels: { ...save.upgradeLevels, [track]: level + 1 } });
        render();
      };
      const buyUnit = (unit: UnitId) => {
        const save = ctx.campaign.read();
        const price = shopPrice(unit);
        if (!save.chosenRace || !shopOffers(save.ownedUnits, save.chosenRace).includes(unit)) return;
        if (save.gold < price || !hasArmySlot(save.ownedUnits)) return;
        ctx.campaign.update({ gold: save.gold - price, ownedUnits: [...save.ownedUnits, unit] });
        render();
      };
      const toggleOffers = () => {
        offersOpen = !offersOpen;
        render();
      };

      const render = () => {
        const save = ctx.campaign.read();
        const race = save.chosenRace;
        const owned = save.ownedUnits.filter(isUnitId);
        const atlas: AtlasSource = race ? atlasFromAssets(ctx.assets, raceVisuals(race).atlas) : NO_ATLAS;
        const tint = race ? raceVisuals(race).tint : '#555';

        overlay.dataset.gold = String(save.gold);
        overlay.dataset.kills = String(save.lifetimeKills);
        gold.value.textContent = String(save.gold);
        kills.value.textContent = String(save.lifetimeKills);
        playing.textContent = race
          ? `Buying as ${raceName(race)}: units are named for your race. Every purchase is saved at once.`
          : 'Pick a race on the campaign map to see what you can buy.';

        // Upgrade rows: the roster decides level, cost and text; gold decides affordability.
        tracks.replaceChildren();
        let anyUpgradeAffordable = false;
        for (const { track, level, cost } of upgradePanel(save.upgradeLevels)) {
          const affordable = save.gold >= cost;
          anyUpgradeAffordable ||= affordable;
          const def = UPGRADE_TRACKS[track];
          const rowEl = document.createElement('div');
          rowEl.className = `track${affordable ? '' : ' unaffordable'}`;
          rowEl.dataset.track = track;
          rowEl.dataset.level = String(level);
          rowEl.dataset.cost = String(cost);
          rowEl.dataset.affordable = affordable ? 'yes' : 'no';
          const label = document.createElement('span');
          label.className = 'label';
          label.dataset.role = 'track-label';
          label.textContent = def.label;
          const effect = document.createElement('span');
          effect.className = 'effect';
          effect.dataset.role = 'track-effect';
          effect.textContent = def.effect;
          const levelEl = document.createElement('span');
          levelEl.className = 'level';
          levelEl.dataset.role = 'track-level';
          levelEl.textContent = `Level ${level}`;
          const costEl = document.createElement('span');
          costEl.className = 'cost';
          costEl.dataset.role = 'track-cost';
          costEl.textContent = `${cost} gold`;
          rowEl.append(label, effect, levelEl, costEl);
          const b = button(rowEl, 'Buy', () => buyUpgrade(track), { action: `upgrade:${track}`, disabled: !affordable });
          b.title = affordable ? `Raise ${def.label} to level ${level + 1} for ${cost} gold` : `You cannot afford this upgrade. It costs ${cost}`;
          tracks.appendChild(rowEl);
        }

        // The rack: owned units in the order bought, then the buy slot, then empty slots.
        rack.replaceChildren();
        const available = race ? shopOffers(owned, race) : [];
        const slotFree = hasArmySlot(owned);
        const cheapest = available.length ? Math.min(...available.map((u) => shopPrice(u))) : null;
        const anyUnitAffordable = cheapest !== null && save.gold >= cheapest;
        for (let i = 0; i < ARMY_SLOTS; i++) {
          const unit = owned[i];
          if (unit !== undefined) {
            const slot = document.createElement('div');
            slot.className = 'slot owned';
            slot.dataset.slot = String(i);
            slot.dataset.unit = String(unit);
            const name = nameFor(unit, race);
            slot.title = name;
            const nameEl = document.createElement('span');
            nameEl.className = 'name';
            nameEl.dataset.role = 'unit-name';
            nameEl.textContent = name;
            slot.append(buildPortrait(unit, unitStats(unit).sprite, tint, atlas, name), nameEl);
            rack.appendChild(slot);
          } else if (i === owned.length) {
            const slot = document.createElement('div');
            slot.className = 'slot buy';
            slot.dataset.slot = String(i);
            slot.dataset.role = 'buy-slot';
            const reason = !race ? 'Pick a race first' : available.length === 0 ? 'Nothing left to buy' : null;
            const b = button(slot, offersOpen ? 'Close' : 'Buy unit', toggleOffers, { action: 'buy-unit', disabled: reason !== null });
            if (reason) b.title = reason;
            slot.dataset.reason = reason ?? '';
            rack.appendChild(slot);
          } else {
            const slot = document.createElement('div');
            slot.className = 'slot empty';
            slot.dataset.slot = String(i);
            slot.textContent = 'Empty';
            rack.appendChild(slot);
          }
        }
        if (!slotFree) {
          // Eight owned: no buy slot exists, so the reason is stated on the rack itself.
          rack.dataset.full = 'yes';
          rackNote.dataset.reason = 'full';
          rackNote.textContent = `Army is full: all ${ARMY_SLOTS} slots are taken, so no more unit types can be bought this campaign.`;
          offersOpen = false;
        } else {
          delete rack.dataset.full;
          rackNote.dataset.reason = '';
          rackNote.textContent = `${owned.length} of ${ARMY_SLOTS} slots used.`;
        }

        // Offers: only what the race may field, priced by the roster, greyed when unaffordable.
        offers.hidden = !offersOpen || !race;
        offerList.replaceChildren();
        if (offersOpen && race) {
          offersNote.textContent = anyUnitAffordable
            ? 'Each unit is a one-time purchase and joins your army for the rest of the campaign.'
            : `You cannot afford any unit yet (the cheapest costs ${cheapest ?? 0}). Win battles to earn gold, or continue to the map.`;
          offersNote.dataset.affordable = anyUnitAffordable ? 'yes' : 'no';
          for (const unit of available) {
            const s = unitStats(unit);
            const price = shopPrice(unit);
            const affordable = save.gold >= price;
            const item = document.createElement('div');
            item.className = `offer${affordable ? '' : ' unaffordable'}`;
            item.dataset.offer = String(unit);
            item.dataset.price = String(price);
            item.dataset.bounty = String(killBounty(unit));
            item.dataset.affordable = affordable ? 'yes' : 'no';
            const name = nameFor(unit, race);
            const nameEl = document.createElement('span');
            nameEl.className = 'name';
            nameEl.dataset.role = 'offer-name';
            nameEl.textContent = name;
            const text = document.createElement('span');
            text.className = 'stats';
            text.dataset.role = 'offer-text';
            text.textContent = `Price ${price} · speed ${s.speed} · armour ${s.hitPoints} · range ${s.range} · max damage ${s.shownMaxDamage} · bounty ${killBounty(unit)}`;
            item.append(buildPortrait(unit, s.sprite, tint, atlas, name), nameEl, text);
            const b = button(item, affordable ? `Buy for ${price}` : `Costs ${price}`, () => buyUnit(unit), {
              action: `buy:${unit}`,
              disabled: !affordable,
            });
            if (!affordable) b.title = `You cannot afford this unit. It costs ${price}`;
            offerList.appendChild(item);
          }
        }

        overlay.dataset.canBuy = anyUpgradeAffordable || (slotFree && anyUnitAffordable) ? 'yes' : 'no';
      };
      render();
    },
  }),
};

function section(overlay: HTMLElement, role: string): HTMLElement {
  const el = document.createElement('section');
  el.className = role;
  el.dataset.role = role;
  overlay.appendChild(el);
  return el;
}

function stat(parent: HTMLElement, role: string, label: string): { root: HTMLElement; value: HTMLElement } {
  const root = document.createElement('span');
  root.className = `stat ${role}`;
  root.dataset.role = role;
  const l = document.createElement('span');
  l.className = 'stat-label';
  l.textContent = label;
  const value = document.createElement('span');
  value.className = 'stat-value';
  value.dataset.role = `${role}-value`;
  root.append(l, value);
  parent.appendChild(root);
  return { root, value };
}
