import { describe, expect, it } from 'vitest';
import { EXCLUSIVE_UNIT_NAMES, RACE_UNIT_PREFIX, UNIT_NAMES } from '../names';
import { defaultSave } from '../save';
import {
  BLOC_RACES,
  RACES,
  ROSTER,
  UNIT_IDS,
  availableUnits,
  exclusiveOf,
  exclusiveUnits,
  genericUnits,
  isAvailable,
  killBounty,
  mixedRoster,
  rosterFor,
  shopOffers,
  shopPrice,
  starterUnits,
  twoPlayerArmy,
  unitDisplayName,
  unitStats,
  upgradeCost,
  type RaceId,
  type RosterDefinition,
  type UnitId,
} from './index';

/** Unit ids by base name, so the tests read like the rules document. */
const id = (name: string): UnitId => {
  const found = UNIT_IDS.find((u) => UNIT_NAMES[u] === name);
  if (found === undefined) throw new Error(`no unit named ${name}`);
  return found;
};

const SIX_RACES = BLOC_RACES;

/** A deterministic rng (mulberry32) so the 100 matchups are reproducible. */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

describe('per-race display names (AC 1)', () => {
  it('every unit resolves a distinct, non-blank name for each of the six races — 114 combinations', () => {
    let combinations = 0;
    for (const race of SIX_RACES) {
      const names = new Set<string>();
      for (const unit of UNIT_IDS) {
        const name = unitDisplayName(unit, race);
        expect(name.trim(), `${race} unit ${unit}`).not.toBe('');
        expect(name, `${race} unit ${unit}`).not.toMatch(/Unit \d+/);
        expect(names.has(name), `${race}: "${name}" used twice`).toBe(false);
        names.add(name);
        combinations += 1;
      }
      expect(names.size).toBe(UNIT_IDS.length);
    }
    expect(combinations).toBe(19 * 6);
  });

  it('generic units take the race as a prefix on the shared base name', () => {
    for (const race of SIX_RACES) {
      for (const unit of genericUnits()) {
        expect(unitDisplayName(unit, race)).toBe(`${RACE_UNIT_PREFIX[race]} ${UNIT_NAMES[unit]}`);
      }
    }
    // The work order's example: the race4 Spearman reads as the race4 prefix plus "Spearman".
    expect(unitDisplayName(id('Spearman'), 'race4')).toBe(`${RACE_UNIT_PREFIX.race4} Spearman`);
  });

  it('each exclusive carries its own in-world name for its owner, and the prefix form elsewhere', () => {
    for (const race of SIX_RACES) {
      const exclusive = ROSTER.races[race].exclusive!;
      expect(unitDisplayName(exclusive, race)).toBe(EXCLUSIVE_UNIT_NAMES[race]);
      expect(unitDisplayName(exclusive, race)).not.toContain(UNIT_NAMES[exclusive]!);
      for (const other of SIX_RACES) {
        if (other === race) continue;
        expect(unitDisplayName(exclusive, other)).toBe(`${RACE_UNIT_PREFIX[other]} ${UNIT_NAMES[exclusive]}`);
      }
    }
  });
});

describe('statistics are identical whichever race fields a unit (AC 2, AC 4)', () => {
  it('a Spearman fielded by race4 and by race3 resolves identical statistics', () => {
    const spearman = id('Spearman');
    const a = unitStats(spearman);
    const b = unitStats(spearman);
    // Names differ, statistics are the same object: there is exactly one definition.
    expect(unitDisplayName(spearman, 'race4')).not.toBe(unitDisplayName(spearman, 'race3'));
    expect(a).toBe(b);
    expect([a.speed, a.hitPoints, a.recharge, a.range, a.cost]).toEqual([b.speed, b.hitPoints, b.recharge, b.range, b.cost]);
    expect(a.attacks.map((x) => x.power)).toEqual(b.attacks.map((x) => x.power));
  });

  it('the Spearman matches the rules document: speed 5, 40 HP, 50 recharge, 130 range, 250 cost, swipes at 10/20/10', () => {
    const s = unitStats(id('Spearman'));
    expect(s.speed).toBe(5);
    expect(s.hitPoints).toBe(40);
    expect(s.recharge).toBe(50);
    expect(s.range).toBe(130);
    expect(s.cost).toBe(250);
    expect(s.attacks).toHaveLength(3);
    expect(s.attacks.map((a) => a.power)).toEqual([[10], [20], [10]]);
    expect(s.attacks.every((a) => a.kind === 'melee' && a.clip === 15 && a.strikeFrames[0] === 4 && a.reach === 130)).toBe(true);
    expect(s.upgradeTrack).toBe('spear');
  });

  it('every unit is defined with the rules document\'s table values', () => {
    // #, speed, HP, recharge, range, cost — rules §6.1.
    const table: Record<string, [number, number, number, number, number]> = {
      Spearman: [5, 40, 50, 130, 250],
      Swordsman: [3, 100, 70, 100, 600],
      Archer: [2, 15, 70, 1500, 500],
      Mage: [3, 10, 180, 1000, 900],
      'Mounted Spearman': [6, 100, 180, 200, 1400],
      Halberdier: [2, 40, 60, 130, 500],
      'Mounted Halberdier': [8, 60, 150, 200, 1100],
      Scout: [10, 10, 60, 60, 400],
      Longswordsman: [3, 100, 130, 100, 1000],
      'Battle Axeman': [3, 40, 60, 100, 900],
      Whirler: [5, 100, 160, 160, 1600],
      'Axe Thrower': [3, 40, 70, 750, 600],
      Ranger: [2, 50, 120, 1700, 1300],
      'Javelin Thrower': [4, 50, 130, 750, 800],
      Spearmaster: [6, 130, 130, 130, 1200],
      Axeman: [5, 80, 100, 110, 500],
      'Giant Troll': [5, 220, 400, 250, 3200],
      Flailer: [3, 100, 180, 165, 1300],
      "King's Guard": [4, 120, 180, 130, 1600],
    };
    expect(Object.keys(table)).toHaveLength(19);
    for (const [name, [speed, hp, recharge, range, cost]] of Object.entries(table)) {
      const s = unitStats(id(name));
      expect([s.speed, s.hitPoints, s.recharge, s.range, s.cost], name).toEqual([speed, hp, recharge, range, cost]);
    }
  });
});

describe('availability (AC 3)', () => {
  it('exactly six units are exclusive, each to one race, and each race owns exactly one', () => {
    expect(exclusiveUnits()).toHaveLength(6);
    expect(genericUnits()).toHaveLength(13);
    const owners = exclusiveUnits().map((u) => exclusiveOf(u));
    expect(new Set(owners).size).toBe(6);
    expect([...owners].sort()).toEqual([...SIX_RACES].sort());
    for (const race of SIX_RACES) {
      const own = ROSTER.races[race].exclusive!;
      expect(exclusiveOf(own)).toBe(race);
      for (const other of RACES) expect(isAvailable(own, other), `${other} fielding ${race}'s exclusive`).toBe(other === race);
    }
  });

  it('maps each race to the exclusive the work order names', () => {
    expect(exclusiveOf(id("King's Guard"))).toBe('race1');
    expect(exclusiveOf(id('Battle Axeman'))).toBe('race2');
    expect(exclusiveOf(id('Whirler'))).toBe('race3');
    expect(exclusiveOf(id('Giant Troll'))).toBe('race4');
    expect(exclusiveOf(id('Flailer'))).toBe('race5');
    expect(exclusiveOf(id('Javelin Thrower'))).toBe('race6');
  });

  it('Axe Thrower, Ranger and Spearmaster are generic and available to all six races', () => {
    for (const name of ['Axe Thrower', 'Ranger', 'Spearmaster']) {
      const unit = id(name);
      expect(exclusiveOf(unit), name).toBeNull();
      for (const race of SIX_RACES) {
        expect(isAvailable(unit, race), `${name} for ${race}`).toBe(true);
        expect(availableUnits(race)).toContain(unit);
      }
    }
  });

  it('every race may field the 13 generics plus its own exclusive, and nothing else', () => {
    for (const race of SIX_RACES) {
      const units = availableUnits(race);
      expect(units).toHaveLength(14);
      expect(units.filter((u) => exclusiveOf(u) !== null)).toEqual([ROSTER.races[race].exclusive]);
    }
  });
});

describe('a seventh race with no exclusive (AC 5)', () => {
  it('race7, defined in the data with no exclusive, gets the full generic pool and no exclusive', () => {
    expect(ROSTER.races.race7.exclusive).toBeNull();
    expect(availableUnits('race7')).toEqual(genericUnits());
    expect(availableUnits('race7')).toHaveLength(13);
    for (const unit of exclusiveUnits()) expect(isAvailable(unit, 'race7')).toBe(false);
    expect(rosterFor('race7')).toEqual([...starterUnits()]);
    for (const unit of UNIT_IDS) expect(unitDisplayName(unit, 'race7')).toBe(`${RACE_UNIT_PREFIX.race7} ${UNIT_NAMES[unit]}`);
  });

  it('an extra race added to a copy of the definition resolves through the same functions with no code change', () => {
    const extra = 'race8' as RaceId;
    const def: RosterDefinition = {
      ...ROSTER,
      races: { ...ROSTER.races, [extra]: { id: extra, exclusive: null, palette: 'vermilion', atlas: ROSTER.races.race1.atlas } },
    };
    expect(availableUnits(extra, def)).toEqual(genericUnits(def));
    expect(exclusiveUnits(def)).toEqual(exclusiveUnits());
    expect(twoPlayerArmy(extra, seeded(1), def)).toHaveLength(5);
    for (const unit of UNIT_IDS) expect(isAvailable(unit, extra, def)).toBe(exclusiveOf(unit, def) === null);
  });
});

describe('armies (AC 7)', () => {
  it('a new campaign army is the starting trio from the data, shared by the save defaults', () => {
    expect(starterUnits()).toEqual([0, 1, 2]);
    expect(defaultSave().ownedUnits).toEqual([...starterUnits()]);
    for (const unit of starterUnits()) expect(exclusiveOf(unit)).toBeNull();
  });

  it('100 two-player matchups: each side gets the trio plus exactly two generics, never a foreign exclusive', () => {
    const rng = seeded(2024);
    const seenExtras = new Set<UnitId>();
    for (let i = 0; i < 100; i++) {
      const left = SIX_RACES[Math.floor(rng() * SIX_RACES.length)]!;
      const right = SIX_RACES[Math.floor(rng() * SIX_RACES.length)]!;
      for (const race of [left, right]) {
        const army = twoPlayerArmy(race, rng);
        expect(army).toHaveLength(5);
        expect(army.slice(0, 3)).toEqual([...starterUnits()]);
        const extras = army.slice(3);
        expect(new Set(extras).size).toBe(2);
        for (const unit of extras) {
          expect(starterUnits()).not.toContain(unit);
          expect(exclusiveOf(unit), `${race} drew exclusive unit ${unit}`).toBeNull();
          expect(isAvailable(unit, race)).toBe(true);
          seenExtras.add(unit);
        }
      }
    }
    // The draw covers the generic pool beyond the trio (13 − 3 = 10 units).
    expect(seenExtras.size).toBe(10);
  });

  it('a race\'s defending army is the trio plus its exclusive; the contested host adds every bloc exclusive', () => {
    for (const race of SIX_RACES) expect(rosterFor(race)).toEqual([...starterUnits(), ROSTER.races[race].exclusive]);
    const mixed = mixedRoster();
    expect(mixed.slice(0, 3)).toEqual([...starterUnits()]);
    expect([...mixed.slice(3)].sort()).toEqual([...exclusiveUnits()].sort());
  });
});

describe('economy — one source of truth for cost (AC 8)', () => {
  it('shop price and kill bounty both derive from the unit\'s cost in the data', () => {
    for (const unit of UNIT_IDS) {
      expect(shopPrice(unit)).toBe(ROSTER.units[unit].cost);
      expect(killBounty(unit)).toBe(Math.ceil(ROSTER.units[unit].cost / 50));
    }
    // The rules document's bounty column.
    expect(killBounty(id('Spearman'))).toBe(5);
    expect(killBounty(id('Giant Troll'))).toBe(64);
    expect(killBounty(id('Swordsman'))).toBe(12);
  });

  it('changing a unit\'s cost in the definition changes the shop price and the bounty together', () => {
    const spearman = id('Spearman');
    const changed: RosterDefinition = {
      ...ROSTER,
      units: { ...ROSTER.units, [spearman]: { ...ROSTER.units[spearman], cost: 310 } },
    };
    expect(shopPrice(spearman, changed)).toBe(310);
    expect(killBounty(spearman, changed)).toBe(7);
    // The production definition is untouched.
    expect(shopPrice(spearman)).toBe(250);
    expect(killBounty(spearman)).toBe(5);
  });

  it('the shop offers the unowned units a race may field, in id order, at most eight', () => {
    const offers = shopOffers(defaultSave().ownedUnits, 'race1');
    expect(offers).toHaveLength(8);
    expect(offers).toEqual([...offers].sort((a, b) => a - b));
    for (const unit of offers) {
      expect(defaultSave().ownedUnits).not.toContain(unit);
      expect(isAvailable(unit, 'race1')).toBe(true);
    }
    const everything = shopOffers([], 'race1');
    expect(everything).toHaveLength(8);
    const nearlyAll = shopOffers(availableUnits('race1').slice(0, 12), 'race1');
    expect(nearlyAll).toHaveLength(2);
    expect(nearlyAll).toContain(ROSTER.races.race1.exclusive);
  });

  it('upgrade levels cost base × (1 + |level|)', () => {
    expect(upgradeCost('spear', 0)).toBe(300);
    expect(upgradeCost('spear', -1)).toBe(600);
    expect(upgradeCost('spear', 2)).toBe(900);
    expect(upgradeCost('speed', 0)).toBe(600);
  });
});
