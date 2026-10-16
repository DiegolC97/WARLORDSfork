import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, type App } from '../../app';
import { BATTLE_LENGTH_FRAMES, attackPowers, battleHandle } from '../../battle';
import { attackableRegions, initialOwners } from '../../campaign';
import { NullEngineHost } from '../../engine/nullHost';
import {
  ARMY_SLOTS,
  ROSTER,
  UPGRADE_TRACKS,
  UPGRADE_TRACK_IDS,
  availableUnits,
  killBounty,
  shopOffers,
  shopPrice,
  unitDisplayName,
  unitStats,
  upgradeCost,
  type RaceId,
  type UnitId,
  type UpgradeTrack,
} from '../../roster';
import { MemoryStorage, SaveStore, defaultSave, type CampaignSave } from '../../save';

/** mulberry32, so a battle in this file replays exactly. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let overlayRoot: HTMLElement;
let storage: MemoryStorage;
let host: NullEngineHost;
let app: App;

/** A campaign save as `race`, started on the map, with `extra` on top. */
const campaignSave = (race: RaceId, extra: Partial<CampaignSave> = {}): CampaignSave => ({
  ...defaultSave(),
  chosenRace: race,
  regionOwners: initialOwners(race),
  upgradeLevels: { [ROSTER.races[race].handicap]: -1 },
  ...extra,
});

/** Boot the app over `storage` (a fresh one unless a test reopens an existing campaign). */
const boot = async (save?: CampaignSave) => {
  if (save) new SaveStore({ storage }).write(save);
  document.body.innerHTML = '<div id="ui"></div>';
  overlayRoot = document.getElementById('ui')!;
  host = new NullEngineHost();
  app = await createApp({ host, overlayRoot, storage });
  await app.shell.navigate('ready');
};

const click = async (action: string) => {
  const btn = overlayRoot.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`);
  if (!btn) throw new Error(`no button "${action}" on ${app.shell.activeScreenId}`);
  if (btn.disabled) throw new Error(`button "${action}" is disabled`);
  btn.click();
  await app.shell.settled();
};

const openShop = async (save?: CampaignSave) => {
  await boot(save);
  await click('campaign');
  await click('shop');
  expect(app.shell.activeScreenId).toBe('shop');
};

const saved = () => new SaveStore({ storage }).load().save;
const shop = () => overlayRoot.querySelector<HTMLElement>('[data-screen="shop"]')!;
const trackRow = (track: UpgradeTrack) => shop().querySelector<HTMLElement>(`[data-track="${track}"]`)!;
const trackButton = (track: UpgradeTrack) => shop().querySelector<HTMLButtonElement>(`button[data-action="upgrade:${track}"]`)!;
const offerNode = (unit: UnitId) => shop().querySelector<HTMLElement>(`[data-offer="${unit}"]`);
const offeredUnits = () => [...shop().querySelectorAll<HTMLElement>('[data-offer]')].map((n) => Number(n.dataset.offer) as UnitId);
const rackSlots = () => [...shop().querySelectorAll<HTMLElement>('[data-role="rack"] .slot')];
const goldShown = () => Number(shop().querySelector<HTMLElement>('[data-role="gold-value"]')!.textContent);
const killsShown = () => Number(shop().querySelector<HTMLElement>('[data-role="kills-value"]')!.textContent);

/** Every row's greying must match cost > gold, and the disabled state must follow the greying. */
const expectAffordabilityConsistent = () => {
  const gold = saved().gold;
  for (const track of UPGRADE_TRACK_IDS) {
    const row = trackRow(track);
    const cost = Number(row.dataset.cost);
    const unaffordable = cost > gold;
    expect(row.dataset.affordable, track).toBe(unaffordable ? 'no' : 'yes');
    expect(row.classList.contains('unaffordable'), track).toBe(unaffordable);
    expect(trackButton(track).disabled, track).toBe(unaffordable);
  }
};

beforeEach(() => {
  storage = new MemoryStorage();
  vi.spyOn(Math, 'random').mockImplementation(seeded(11));
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('upgrade panel affordability (AC 1)', () => {
  it('with 500 gold greys exactly the tracks costing 600, 600, 1000 and 600 and leaves 450, 400 and 400 buyable', async () => {
    // The reference screenshot: Spear at level 1 (next 600) and Archery at −1 (next 1000), everything else at 0.
    await openShop(campaignSave('race4', { gold: 500, upgradeLevels: { archery: -1, spear: 1 } }));
    expect(goldShown()).toBe(500);
    const rows = UPGRADE_TRACK_IDS.map((track) => trackRow(track));
    expect(rows.map((r) => r.dataset.track)).toEqual(['speed', 'armour', 'archery', 'spear', 'sword', 'halberd', 'axe']);
    expect(rows.map((r) => Number(r.dataset.cost))).toEqual([600, 600, 1000, 600, 450, 400, 400]);
    expect(rows.map((r) => r.dataset.affordable)).toEqual(['no', 'no', 'no', 'no', 'yes', 'yes', 'yes']);
    expect(rows.map((r) => r.classList.contains('unaffordable'))).toEqual([true, true, true, true, false, false, false]);
    expect(rows.map((r) => trackButton(r.dataset.track as UpgradeTrack).disabled)).toEqual([true, true, true, true, false, false, false]);
    for (const track of UPGRADE_TRACK_IDS) {
      const row = trackRow(track);
      expect(row.querySelector('[data-role="track-label"]')!.textContent).toBe(UPGRADE_TRACKS[track].label);
      expect(row.querySelector('[data-role="track-effect"]')!.textContent).toBe(UPGRADE_TRACKS[track].effect);
      expect(row.querySelector('[data-role="track-level"]')!.textContent).toBe(`Level ${saved().upgradeLevels[track] ?? 0}`);
      expect(Number(row.dataset.cost)).toBe(upgradeCost(track, saved().upgradeLevels[track] ?? 0));
    }
    expect(trackRow('spear').dataset.level).toBe('1');
    expect(trackRow('archery').dataset.level).toBe('-1');
  });
});

describe('buying an upgrade (AC 2)', () => {
  it('Swordsmanship at 450 leaves 50 gold, raises the level, shows the next cost and greys every track now out of reach', async () => {
    await openShop(campaignSave('race4', { gold: 500, upgradeLevels: { archery: -1, spear: 1 } }));
    expect(Number(trackRow('sword').dataset.cost)).toBe(450);
    await click('upgrade:sword');
    expect(saved().gold).toBe(50);
    expect(goldShown()).toBe(50);
    expect(saved().upgradeLevels.sword).toBe(1);
    const sword = trackRow('sword');
    expect(sword.dataset.level).toBe('1');
    expect(sword.querySelector('[data-role="track-level"]')!.textContent).toBe('Level 1');
    expect(Number(sword.dataset.cost)).toBe(upgradeCost('sword', 1));
    expect(Number(sword.dataset.cost)).toBe(900);
    for (const track of UPGRADE_TRACK_IDS) {
      expect(trackRow(track).dataset.affordable, track).toBe('no');
      expect(trackButton(track).disabled, track).toBe(true);
    }
    expectAffordabilityConsistent();
    // The other tracks' levels did not move.
    expect(saved().upgradeLevels).toEqual({ archery: -1, spear: 1, sword: 1 });
  });

  it('a track becomes buyable again the moment gold suffices, and never sells what gold cannot cover', async () => {
    await openShop(campaignSave('race1', { gold: 1000, upgradeLevels: { spear: -1 } }));
    expectAffordabilityConsistent();
    await click('upgrade:halberd'); // 400 → 600 left
    expectAffordabilityConsistent();
    expect(trackButton('spear').disabled).toBe(false); // climbing out of the handicap costs 600, exactly affordable
    await click('upgrade:spear'); // 600 → 0 left
    expect(saved().gold).toBe(0);
    expect(saved().upgradeLevels.spear).toBe(0);
    expect(Number(trackRow('spear').dataset.cost)).toBe(300);
    expectAffordabilityConsistent();
    // A disabled control does nothing even if forced.
    trackButton('spear').click();
    await app.shell.settled();
    expect(saved().gold).toBe(0);
    expect(saved().upgradeLevels.spear).toBe(0);
  });
});

describe('an upgrade reaches the next battle (AC 3)', () => {
  it('buying Spear Training raises the resolved power of all three Spearman spear swipes by 5 and leaves the shield bash alone', async () => {
    await openShop(campaignSave('race4', { gold: 500 }));
    const spearman = unitStats(0);
    const before = spearman.attacks.map((attack) => attackPowers(spearman, attack, saved().upgradeLevels));
    expect(before).toEqual([[10], [20], [10], [20]]);
    await click('upgrade:spear');
    expect(saved().upgradeLevels.spear).toBe(1);
    await click('continue');
    expect(app.shell.activeScreenId).toBe('map');
    await click(`attack:${attackableRegions(saved().regionOwners)[0]!}`);
    expect(app.shell.activeScreenId).toBe('battle');
    const battle = overlayRoot.querySelector<HTMLElement>('[data-screen="battle"]')!;
    const side = battleHandle(battle)!.simulation.snapshot().sides.left;
    expect(side.upgrades.spear).toBe(1);
    const after = spearman.attacks.map((attack) => attackPowers(spearman, attack, side.upgrades, side.statBonus));
    expect(after).toEqual([[15], [25], [15], [20]]);
    for (let i = 0; i < 3; i++) expect(after[i]![0]! - before[i]![0]!).toBe(5);
    expect(after[3]).toEqual(before[3]);
  });
});

describe('unit offers follow the roster (AC 4)', () => {
  it('a race4 player is offered the Giant Troll and never another race\'s exclusive', async () => {
    await openShop(campaignSave('race4', { gold: 5000 }));
    await click('buy-unit');
    const offered = offeredUnits();
    expect(offered).toEqual(shopOffers(saved().ownedUnits, 'race4'));
    expect(offered).toContain(16); // Giant Troll — race4's exclusive
    expect(offered).toContain(ROSTER.races.race4.exclusive);
    for (const foreign of [18, 10, 17, 13] as const) expect(offered).not.toContain(foreign); // King's Guard, Whirler, Flailer, Javelin Thrower
    for (const race of ['race1', 'race2', 'race3', 'race5', 'race6'] as const) expect(offered).not.toContain(ROSTER.races[race].exclusive);
    for (const unit of offered) {
      expect(availableUnits('race4')).toContain(unit);
      expect(saved().ownedUnits).not.toContain(unit);
      const node = offerNode(unit)!;
      expect(node.dataset.price).toBe(String(shopPrice(unit)));
      expect(node.dataset.price).toBe(String(unitStats(unit).cost));
      expect(node.dataset.bounty).toBe(String(killBounty(unit)));
      expect(node.querySelector('[data-role="offer-name"]')!.textContent).toBe(unitDisplayName(unit, 'race4'));
    }
    expect(offerNode(16)!.querySelector('[data-role="offer-name"]')!.textContent).toBe(unitDisplayName(16, 'race4'));
  });

  it('owned units show in the rack by portrait and per-race name, with the buy slot next and empty slots after', async () => {
    await openShop(campaignSave('race2'));
    const slots = rackSlots();
    expect(slots).toHaveLength(ARMY_SLOTS);
    const owned = saved().ownedUnits as UnitId[];
    owned.forEach((unit, i) => {
      expect(slots[i]!.dataset.unit).toBe(String(unit));
      expect(slots[i]!.querySelector('[data-role="unit-name"]')!.textContent).toBe(unitDisplayName(unit, 'race2'));
      expect(slots[i]!.querySelector<HTMLElement>('[data-role="portrait"]')!.dataset.frame).toBe(unitStats(unit).sprite);
    });
    expect(slots[owned.length]!.dataset.role).toBe('buy-slot');
    expect(slots.slice(owned.length + 1).every((s) => s.classList.contains('empty'))).toBe(true);
  });
});

describe('a full army rack (AC 5)', () => {
  it('with eight units owned there is no buy control, the rack states why, and nothing can be bought', async () => {
    const eight: UnitId[] = [0, 1, 2, 3, 4, 5, 6, 16];
    await openShop(campaignSave('race4', { gold: 9000, ownedUnits: eight }));
    const slots = rackSlots();
    expect(slots).toHaveLength(ARMY_SLOTS);
    expect(slots.every((s) => s.classList.contains('owned'))).toBe(true);
    expect(shop().querySelector('[data-role="buy-slot"]')).toBeNull();
    expect(shop().querySelector('button[data-action="buy-unit"]')).toBeNull();
    const rack = shop().querySelector<HTMLElement>('[data-role="rack"]')!;
    expect(rack.dataset.full).toBe('yes');
    const reason = shop().querySelector<HTMLElement>('[data-role="rack-note"]')!;
    expect(reason.dataset.reason).toBe('full');
    expect(reason.textContent).toMatch(/Army is full/);
    expect(shop().querySelectorAll('[data-offer]')).toHaveLength(0);
    expect(saved().ownedUnits).toEqual(eight);
    // Upgrades are still for sale.
    expect(trackButton('sword').disabled).toBe(false);
  });

  it('the seventh purchase fills the rack and removes the buy slot', async () => {
    await openShop(campaignSave('race4', { gold: 99000, ownedUnits: [0, 1, 2, 3, 4, 5, 6] }));
    await click('buy-unit');
    await click('buy:7');
    expect(saved().ownedUnits).toHaveLength(ARMY_SLOTS);
    expect(shop().querySelector('button[data-action="buy-unit"]')).toBeNull();
    expect(shop().querySelector<HTMLElement>('[data-role="rack-note"]')!.dataset.reason).toBe('full');
  });
});

describe('purchases persist at once (AC 6)', () => {
  it('buying a unit, quitting without continuing and reopening the campaign shows the unit owned and the gold spent', async () => {
    await openShop(campaignSave('race4', { gold: 1000 }));
    await click('buy-unit');
    const unit: UnitId = 5; // Halberdier, 500
    const price = shopPrice(unit);
    expect(offerNode(unit)!.querySelector('button')!.textContent).toBe(`Buy for ${price}`);
    await click(`buy:${unit}`);
    expect(saved().gold).toBe(1000 - price);
    expect(saved().ownedUnits).toContain(unit);
    expect(offerNode(unit)).toBeNull();
    expect(rackSlots()[3]!.dataset.unit).toBe(String(unit));

    // Quit: a new app boots over the same storage without any further write.
    await boot();
    await click('campaign');
    await click('shop');
    expect(saved().gold).toBe(1000 - price);
    expect(goldShown()).toBe(1000 - price);
    expect(saved().ownedUnits).toEqual([0, 1, 2, unit]);
    expect(rackSlots()[3]!.dataset.unit).toBe(String(unit));
    expect(rackSlots()[3]!.querySelector('[data-role="unit-name"]')!.textContent).toBe(unitDisplayName(unit, 'race4'));
    await click('buy-unit');
    expect(offerNode(unit)).toBeNull();
  });

  it('an upgrade bought and then abandoned is still there on reopening', async () => {
    await openShop(campaignSave('race1', { gold: 500 }));
    await click('upgrade:halberd');
    await boot();
    await click('campaign');
    await click('shop');
    expect(saved().upgradeLevels.halberd).toBe(1);
    expect(goldShown()).toBe(100);
    expect(trackRow('halberd').dataset.level).toBe('1');
  });
});

describe('gold and kills carried in from battle (AC 7)', () => {
  it('on entering the shop after a battle the totals match what the battle produced', async () => {
    // Heavily upgraded, the player's spearmen roll over the defenders; holding Space spawns one per recharge.
    await boot(campaignSave('race1', { ownedUnits: [0, 1, 2], upgradeLevels: { speed: 10, armour: 10, spear: 10 }, gold: 500, lifetimeKills: 7 }));
    await click('campaign');
    await click('attack:r15');
    expect(app.shell.activeScreenId).toBe('battle');
    const battle = overlayRoot.querySelector<HTMLElement>('[data-screen="battle"]')!;
    const sim = battleHandle(battle)!.simulation;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', cancelable: true }));
    let t = 0;
    while (sim.snapshot().winner === null && t < BATTLE_LENGTH_FRAMES) {
      host.tick(1);
      t++;
    }
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
    const s = sim.snapshot();
    expect(s.winner).toBe('left');
    expect(s.spawners.left.kills).toBeGreaterThan(0);
    expect(s.spawners.left.gold).toBeGreaterThan(0);
    await click('finished');
    await click('continue');
    expect(app.shell.activeScreenId).toBe('map');
    await click('shop');
    expect(goldShown()).toBe(500 + s.spawners.left.gold);
    expect(killsShown()).toBe(7 + s.spawners.left.kills);
    expect(goldShown()).toBe(saved().gold);
    expect(killsShown()).toBe(saved().lifetimeKills);
    expectAffordabilityConsistent();
  }, 60000);
});

describe('a player who can afford nothing (AC 8)', () => {
  it('sees every upgrade greyed, is told why no unit is buyable, and can still reach the map and the menu', async () => {
    await openShop(campaignSave('race3', { gold: 0 }));
    expect(shop().dataset.canBuy).toBe('no');
    for (const track of UPGRADE_TRACK_IDS) expect(trackButton(track).disabled).toBe(true);
    // The buy-unit control still answers: it opens the list with every offer greyed and a stated reason.
    const buy = shop().querySelector<HTMLButtonElement>('button[data-action="buy-unit"]')!;
    expect(buy.disabled).toBe(false);
    await click('buy-unit');
    const offers = offeredUnits();
    expect(offers.length).toBeGreaterThan(0);
    for (const unit of offers) {
      const node = offerNode(unit)!;
      expect(node.dataset.affordable).toBe('no');
      expect(node.querySelector('button')!.disabled).toBe(true);
    }
    const note = shop().querySelector<HTMLElement>('[data-role="offers-note"]')!;
    expect(note.dataset.affordable).toBe('no');
    expect(note.textContent).toMatch(/cannot afford any unit/);
    expect(note.textContent).toContain(String(Math.min(...offers.map((u) => shopPrice(u)))));
    // Every navigation control is live.
    for (const action of ['continue', 'menu', 'guide']) expect(shop().querySelector<HTMLButtonElement>(`button[data-action="${action}"]`)!.disabled).toBe(false);
    await click('guide');
    expect(app.shell.activeScreenId).toBe('instructions');
    await click('back');
    await click('campaign');
    await click('shop');
    await click('menu');
    expect(app.shell.activeScreenId).toBe('menu');
    await click('campaign');
    await click('shop');
    await click('continue');
    expect(app.shell.activeScreenId).toBe('map');
    expect(saved().gold).toBe(0);
  });

  it('before a race is picked the shop explains itself and still continues', async () => {
    await boot();
    await click('campaign');
    await click('shop');
    expect(shop().querySelector('[data-role="playing"]')!.textContent).toMatch(/Pick a race/);
    const buy = shop().querySelector<HTMLButtonElement>('button[data-action="buy-unit"]')!;
    expect(buy.disabled).toBe(true);
    expect(buy.title).toBe('Pick a race first');
    await click('continue');
    expect(app.shell.activeScreenId).toBe('map');
  });
});
