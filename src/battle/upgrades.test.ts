import { describe, expect, it } from 'vitest';
import { RACES, ROSTER, UNIT_IDS, UPGRADE_TRACKS, raceStartingUpgrades, unitStats, upgradeCost, type UpgradeTrack } from '../roster';
import { attackPowers, driftRange, hitPointsAtSpawn, levelOf, speedFactor, strikePower } from './upgrades';

/** Levels the table walks: the handicap, zero, and up to a practical ceiling (the rules set no cap). */
const MIN_LEVEL = -1;
const MAX_LEVEL = 10;
const LEVELS = Array.from({ length: MAX_LEVEL - MIN_LEVEL + 1 }, (_, i) => MIN_LEVEL + i);
const TRACKS = Object.keys(UPGRADE_TRACKS) as UpgradeTrack[];

describe('upgrade formulas (rules §9, §8.1, §8.4; work order AC 5)', () => {
  it('a Spearman with Spear Training at level 3 swings its three spear swipes at power 25, 35 and 25', () => {
    const spearman = unitStats(0);
    const powers = spearman.attacks.slice(0, 3).map((a) => attackPowers(spearman, a, { spear: 3 })[0]);
    expect(powers).toEqual([25, 35, 25]);
  });

  it('every strike of every unit resolves at base + 5 × level on its own track when it scales, and at base otherwise, for every level −1…10', () => {
    let checked = 0;
    for (const id of UNIT_IDS) {
      const unit = unitStats(id);
      for (const track of TRACKS) {
        for (const level of LEVELS) {
          const levels = { [track]: level };
          for (const attack of unit.attacks) {
            const powers = attackPowers(unit, attack, levels);
            attack.power.forEach((base, i) => {
              const scales = attack.kind === 'melee' && attack.upgraded && unit.upgradeTrack === track;
              expect(powers[i], `unit ${id} ${attack.kind} swipe at ${track} ${level}`).toBe(scales ? base + 5 * level : base);
              checked++;
            });
          }
        }
      }
    }
    // 19 units × 7 tracks × 12 levels, with at least one strike each.
    expect(checked).toBeGreaterThanOrEqual(19 * 7 * 12);
  });

  it('projectiles never gain power from any track, and the stat bonus scales base power before the level is added', () => {
    for (const id of UNIT_IDS) {
      const unit = unitStats(id);
      for (const attack of unit.attacks) {
        if (attack.kind !== 'projectile') continue;
        for (const track of TRACKS) expect(attackPowers(unit, attack, { [track]: 10 })).toEqual([...attack.power]);
      }
    }
    expect(strikePower(20, true, 3, 1.25)).toBe(20 * 1.25 + 15);
    expect(strikePower(20, false, 3, 1.25)).toBe(25);
  });

  it('Speed multiplies movement by 1 + level/10 and Armour adds 10 hit points per level, both signed', () => {
    for (const level of LEVELS) {
      expect(speedFactor(level)).toBeCloseTo(1 + level / 10, 10);
      for (const id of UNIT_IDS) {
        expect(hitPointsAtSpawn(unitStats(id).hitPoints, level)).toBe(unitStats(id).hitPoints + 10 * level);
      }
    }
    expect(speedFactor(-1)).toBeCloseTo(0.9, 10);
    expect(hitPointsAtSpawn(40, -1)).toBe(30);
    expect(hitPointsAtSpawn(40, 2, 1.25)).toBe(75);
  });

  it('Archery narrows the drift of arrows, axes and javelins by one per level, and widens it at −1; magic ignores it', () => {
    for (const id of UNIT_IDS) {
      for (const attack of unitStats(id).attacks) {
        if (attack.kind !== 'projectile') continue;
        for (const level of LEVELS) {
          const expected = attack.archeryAffectsDrift ? attack.driftBase - level : attack.driftBase;
          expect(driftRange(attack.driftBase, attack.archeryAffectsDrift, level)).toBe(expected);
        }
      }
    }
    expect(driftRange(7, true, -1)).toBe(8);
    expect(driftRange(4, false, 7)).toBe(4);
  });

  it('a missing track is level 0 and a null track never scales', () => {
    expect(levelOf(undefined, 'spear')).toBe(0);
    expect(levelOf({ spear: -1 }, 'spear')).toBe(-1);
    expect(levelOf({ spear: 4 }, 'sword')).toBe(0);
    expect(levelOf({ spear: 4 }, null)).toBe(0);
  });
});

describe('race handicaps (rules §10 adapted; work order)', () => {
  it('every race starts exactly one track at −1, a different track for each race, and never the track its exclusive scales with', () => {
    const seen = new Set<UpgradeTrack>();
    for (const race of RACES) {
      const start = raceStartingUpgrades(race);
      const entries = Object.entries(start);
      expect(entries).toHaveLength(1);
      const [track, level] = entries[0]!;
      expect(level).toBe(-1);
      expect(TRACKS).toContain(track);
      expect(seen.has(track as UpgradeTrack), `${race} shares the ${track} handicap`).toBe(false);
      seen.add(track as UpgradeTrack);
      const exclusive = ROSTER.races[race].exclusive;
      if (exclusive !== null) expect(unitStats(exclusive).upgradeTrack).not.toBe(track);
    }
    expect(seen.size).toBe(RACES.length);
  });

  it('climbing out of the handicap costs base × 2, the first positive level base × 1', () => {
    for (const track of TRACKS) {
      expect(upgradeCost(track, -1)).toBe(UPGRADE_TRACKS[track].baseCost * 2);
      expect(upgradeCost(track, 0)).toBe(UPGRADE_TRACKS[track].baseCost);
    }
  });
});
