import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, type App } from '../../app';
import { NullEngineHost } from '../../engine/nullHost';
import {
  BLOCS,
  CONTESTED_REGIONS,
  CONTESTED_STAT_BONUS,
  PLAYER_OWNER,
  RACE_COLOURS,
  REGIONS,
  attackableRegions,
  region,
  startingBloc,
  type RegionId,
} from '../../campaign';
import { ROSTER, mixedRoster, rosterFor, unitDisplayName } from '../../roster';
import { MemoryStorage, RACES, SaveStore, UNLOCKABLE_RACE } from '../../save';

let overlayRoot: HTMLElement;
let storage: MemoryStorage;
let app: App;

const boot = async () => {
  document.body.innerHTML = '<div id="ui"></div>';
  overlayRoot = document.getElementById('ui')!;
  app = await createApp({ host: new NullEngineHost(), overlayRoot, storage });
  await app.shell.navigate('ready');
};

const click = async (action: string) => {
  const btn = overlayRoot.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`);
  if (!btn) throw new Error(`no button "${action}" on ${app.shell.activeScreenId}`);
  if (btn.disabled) throw new Error(`button "${action}" is disabled`);
  btn.click();
  await app.shell.settled();
};

const regionNode = (id: RegionId) => overlayRoot.querySelector<SVGGElement>(`[data-region="${id}"]`)!;
const arrowTargets = () => [...overlayRoot.querySelectorAll<SVGLineElement>('[data-arrow-to]')].map((a) => a.dataset.arrowTo as RegionId).sort();
const attackableNodes = () => [...overlayRoot.querySelectorAll<SVGGElement>('[data-region][data-attackable]')].map((g) => g.dataset.region!).sort();
const saved = () => new SaveStore({ storage }).load().save;

beforeEach(async () => {
  storage = new MemoryStorage();
  await boot();
  await click('campaign');
});

describe('campaign map rendering (AC 1)', () => {
  it('draws all 28 regions, each with its bloc, before and after the race pick', async () => {
    expect(overlayRoot.querySelectorAll('[data-region]')).toHaveLength(28);
    expect(arrowTargets()).toEqual([]);
    await click('pick-race:race1');
    const nodes = [...overlayRoot.querySelectorAll<SVGGElement>('[data-region]')];
    expect(nodes).toHaveLength(28);
    for (const r of REGIONS) expect(regionNode(r.id).dataset.bloc).toBe(r.bloc);
    expect(nodes.filter((n) => n.dataset.bloc === 'contested')).toHaveLength(4);
    expect(nodes.filter((n) => n.dataset.owner === PLAYER_OWNER)).toHaveLength(3);
  });
});

describe('attack arrows (AC 3)', () => {
  it('appear only for regions adjacent to the player\'s territory, one per attackable region', async () => {
    await click('pick-race:race1');
    const owners = saved().regionOwners;
    const expected = [...attackableRegions(owners)].sort();
    expect(arrowTargets()).toEqual(expected);
    expect(attackableNodes()).toEqual(expected);
    for (const target of expected) {
      const arrow = overlayRoot.querySelector<SVGLineElement>(`[data-arrow-to="${target}"]`)!;
      expect(owners[arrow.dataset.arrowFrom as RegionId]).toBe(PLAYER_OWNER);
      expect(region(target).adjacent).toContain(arrow.dataset.arrowFrom);
    }
    // Regions two steps away have no arrow.
    for (const r of REGIONS) {
      const adjacentToHolding = r.adjacent.some((n) => owners[n] === PLAYER_OWNER);
      if (!adjacentToHolding) expect(arrowTargets(), r.id).not.toContain(r.id);
    }
    expect(expected.length).toBeLessThan(10);
    expect(BLOCS.race1.starting.every((id) => !expected.includes(id))).toBe(true);
  });
});

/** From the map, attack `target`, win, and come back to the map. */
const conquer = async (target: RegionId) => {
  await click(`attack:${target}`);
  expect(app.shell.activeScreenId).toBe('battle');
  await click('finished');
  expect(app.shell.activeScreenId).toBe('result');
  await click('continue');
  expect(app.shell.activeScreenId).toBe('map');
};

describe('launching a battle (AC 3, AC 4)', () => {
  it('clicking an arrowed region launches a battle against that region\'s defending race and roster', async () => {
    await click('pick-race:race1');
    // r15 belongs to race4 and borders race1's starting r03.
    const target: RegionId = 'r15';
    expect(region(target).bloc).toBe('race4');
    expect(arrowTargets()).toContain(target);
    expect(regionNode(target).dataset.defender).toBe('race4');

    regionNode(target).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await app.shell.settled();
    expect(app.shell.activeScreenId).toBe('battle');
    expect(saved().battleRegion).toBe(target);

    const battle = overlayRoot.querySelector<HTMLElement>('[data-screen="battle"]')!;
    expect(battle.dataset.region).toBe(target);
    expect(battle.dataset.defender).toBe('race4');
    const units = battle.querySelector<HTMLElement>('[data-role="defending-units"]')!.dataset.units!.split(',').map(Number);
    expect(units).toEqual([...rosterFor('race4')]);
    expect(units).toContain(ROSTER.races.race4.exclusive);
    expect(battle.textContent).toContain(unitDisplayName(ROSTER.races.race4.exclusive!, 'race4'));
    for (const race of RACES) if (race !== 'race4') expect(units).not.toContain(ROSTER.races[race].exclusive);
    expect(battle.querySelector('[data-role="stat-bonus"]')).toBeNull();
  });

  it('a region that is not attackable cannot launch a battle', async () => {
    await click('pick-race:race1');
    const far: RegionId = 'r22';
    expect(regionNode(far).dataset.attackable).toBeUndefined();
    regionNode(far).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await app.shell.settled();
    expect(app.shell.activeScreenId).toBe('map');
    expect(saved().battleRegion).toBeNull();
  });

  it('a contested region fields the mixed host with the stat bonus and opens from any adjacent holding', async () => {
    await click('pick-race:race1');
    const target: RegionId = 'r25'; // borders race1's starting r02
    expect(regionNode(target).dataset.defender).toBe('contested');
    expect(regionNode(target).textContent).toMatch(/Contested/);
    expect(arrowTargets()).toContain(target);
    await click(`attack:${target}`);
    const battle = overlayRoot.querySelector<HTMLElement>('[data-screen="battle"]')!;
    expect(battle.dataset.defender).toBe('contested');
    const units = battle.querySelector<HTMLElement>('[data-role="defending-units"]')!.dataset.units!.split(',').map(Number);
    expect(units).toEqual([...mixedRoster()]);
    expect(battle.querySelector<HTMLElement>('[data-role="stat-bonus"]')!.dataset.bonus).toBe(String(CONTESTED_STAT_BONUS));
  });

  it('retreating clears the pending battle and changes no territory', async () => {
    await click('pick-race:race2');
    const before = saved().regionOwners;
    await click('attack:r08');
    await click('retreat');
    expect(app.shell.activeScreenId).toBe('map');
    expect(saved().battleRegion).toBeNull();
    expect(saved().regionOwners).toEqual(before);
  });

  it('the two-player battle is a skirmish over no region', async () => {
    await click('back');
    await click('twoPlayer');
    const battle = overlayRoot.querySelector<HTMLElement>('[data-screen="battle"]')!;
    expect(battle.dataset.region).toBeUndefined();
    await click('finished');
    expect(saved().regionOwners).toEqual({});
  });
});

describe('conquest on the map (AC 5)', () => {
  it('recolours the conquered region to the player\'s bloc and updates the arrows', async () => {
    await click('pick-race:race3');
    const target: RegionId = 'r24'; // race6's holdout, bordering race3's r11
    const fillBefore = regionNode(target).querySelector('polygon')!.getAttribute('fill');
    expect(fillBefore).toBe(RACE_COLOURS.race6);
    const arrowsBefore = arrowTargets();
    expect(arrowsBefore).toContain(target);
    expect(arrowsBefore).not.toContain('r28');

    await conquer(target);

    const node = regionNode(target);
    expect(node.dataset.owner).toBe(PLAYER_OWNER);
    expect(node.classList.contains('held')).toBe(true);
    expect(node.querySelector('polygon')!.getAttribute('fill')).toBe(RACE_COLOURS.race3);
    expect(node.textContent).toMatch(/Yours/);
    const arrowsAfter = arrowTargets();
    expect(arrowsAfter).not.toContain(target);
    expect(arrowsAfter).toEqual([...attackableRegions(saved().regionOwners)].sort());
    // Contested r28 opened through the newly taken race6 region, not through race3's own bloc.
    expect(arrowsAfter).toContain('r28');
    expect(overlayRoot.querySelector<SVGLineElement>('[data-arrow-to="r28"]')!.dataset.arrowFrom).toBe(target);
    expect(overlayRoot.textContent).toMatch(/1 of 25 battles won/);
    expect(saved().campaignLevel).toBe(2);
  });
});

describe('persistence (AC 6)', () => {
  it('quitting after a battle and reopening restores the map, gold, army and upgrades', async () => {
    // The shop and battle slices will change these; stand in for them in the stored save.
    new SaveStore({ storage }).write({ ...saved(), gold: 1375, ownedUnits: [0, 1, 2, 13], upgradeLevels: { attack: 2, armour: 1 } });
    await boot();
    await click('campaign');
    await click('pick-race:race4');
    await conquer('r16');
    await conquer('r26');
    const before = saved();
    const mapBefore = [...overlayRoot.querySelectorAll<SVGGElement>('[data-region]')].map((g) => [g.dataset.region, g.dataset.owner, g.querySelector('polygon')!.getAttribute('fill')]);
    const arrowsBefore = arrowTargets();

    await boot(); // fresh app over the same storage = quit and reopen
    expect(app.store.load().outcome).toBe('loaded');
    await click('campaign');

    const after = saved();
    expect(after.regionOwners).toEqual(before.regionOwners);
    expect(after.gold).toBe(1375);
    expect(after.ownedUnits).toEqual([0, 1, 2, 13]);
    expect(after.upgradeLevels).toEqual({ attack: 2, armour: 1 });
    expect(after.chosenRace).toBe('race4');
    expect(after.campaignLevel).toBe(3);
    const mapAfter = [...overlayRoot.querySelectorAll<SVGGElement>('[data-region]')].map((g) => [g.dataset.region, g.dataset.owner, g.querySelector('polygon')!.getAttribute('fill')]);
    expect(mapAfter).toEqual(mapBefore);
    expect(arrowTargets()).toEqual(arrowsBefore);
    expect(overlayRoot.querySelector('button[data-action^="pick-race:"]')).toBeNull();
    expect(overlayRoot.textContent).toMatch(/gold 1375/);
  });

  it('a battle left pending is dropped when the map is reopened', async () => {
    await click('pick-race:race5');
    await click('attack:r20');
    expect(saved().battleRegion).toBe('r20');
    await boot();
    await click('campaign');
    expect(saved().battleRegion).toBeNull();
    expect(saved().regionOwners.r20).toBe('race5');
  });
});

describe('full campaign and the unlock (AC 2, AC 7)', () => {
  it('takes exactly 25 battles through the screens, unlocks the additional race, and offers it in a new campaign', async () => {
    expect(overlayRoot.querySelector<HTMLButtonElement>(`button[data-action="pick-race:${UNLOCKABLE_RACE}"]`)!.disabled).toBe(true);
    await click('pick-race:race6');
    let battles = 0;
    while (arrowTargets().length > 0) {
      await conquer(arrowTargets()[0]!);
      battles++;
      if (battles > 30) throw new Error('campaign does not end');
    }
    expect(battles).toBe(25);
    for (const r of REGIONS) expect(regionNode(r.id).dataset.owner, r.id).toBe(PLAYER_OWNER);
    for (const id of CONTESTED_REGIONS) expect(regionNode(id).querySelector('polygon')!.getAttribute('fill')).toBe(RACE_COLOURS.race6);
    expect(saved().raceUnlocked).toBe(true);
    expect(saved().campaignLevel).toBe(26);

    // No legal attack: the map says so and offers a new campaign instead of going dead.
    expect(overlayRoot.querySelectorAll('button[data-action^="attack:"]')).toHaveLength(0);
    expect(overlayRoot.textContent).toMatch(/Campaign complete/);
    expect(overlayRoot.querySelector('button[data-action="shop"]')).not.toBeNull();
    expect(overlayRoot.querySelector('button[data-action="back"]')).not.toBeNull();

    await boot(); // the unlock survives a restart
    await click('campaign');
    await click('new-campaign');
    const unlockedButton = overlayRoot.querySelector<HTMLButtonElement>(`button[data-action="pick-race:${UNLOCKABLE_RACE}"]`)!;
    expect(unlockedButton.disabled).toBe(false);
    expect(unlockedButton.textContent).not.toMatch(/locked/);
    await click(`pick-race:${UNLOCKABLE_RACE}`);
    const s = saved();
    expect(s.chosenRace).toBe(UNLOCKABLE_RACE);
    expect(s.raceUnlocked).toBe(true);
    expect(s.campaignLevel).toBe(1);
    expect(s.gold).toBe(500);
    const host = startingBloc(UNLOCKABLE_RACE);
    for (const id of BLOCS[host].starting) expect(regionNode(id).dataset.owner).toBe(PLAYER_OWNER);
    expect(regionNode(BLOCS[host].starting[0]!).querySelector('polygon')!.getAttribute('fill')).toBe(RACE_COLOURS[UNLOCKABLE_RACE]);
    expect(arrowTargets().length).toBeGreaterThan(0);
  });

  it('the new-campaign control is absent while attacks remain', async () => {
    await click('pick-race:race1');
    expect(overlayRoot.querySelector('button[data-action="new-campaign"]')).toBeNull();
  });
});
