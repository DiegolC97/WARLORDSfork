import { describe, expect, it } from 'vitest';
import { UNIT_NAMES, unitName } from '../names';
import { BLOC_RACES, RACES, defaultSave } from '../save';
import { CORE_UNITS, RACE_EXCLUSIVES, exclusiveOf, mixedRoster, rosterFor } from './index';

describe('roster seam', () => {
  it('race4 fields its own exclusive and no other race\'s (AC 4)', () => {
    const units = rosterFor('race4');
    expect(units).toContain(RACE_EXCLUSIVES.race4);
    expect(unitName(RACE_EXCLUSIVES.race4)).toBe('Giant Troll');
    for (const race of RACES) {
      if (race === 'race4') continue;
      expect(units, `race4 must not field ${race}'s exclusive`).not.toContain(RACE_EXCLUSIVES[race]);
    }
  });

  it('every race fields the core units plus exactly its own exclusive', () => {
    const exclusives = Object.values(RACE_EXCLUSIVES);
    expect(new Set(exclusives).size).toBe(RACES.length);
    for (const race of RACES) {
      const units = rosterFor(race);
      for (const core of CORE_UNITS) expect(units).toContain(core);
      expect(units.filter((u) => exclusives.includes(u))).toEqual([RACE_EXCLUSIVES[race]]);
      expect(exclusiveOf(RACE_EXCLUSIVES[race])).toBe(race);
    }
    for (const core of CORE_UNITS) expect(exclusiveOf(core)).toBeNull();
  });

  it('the starting army is drawn from the core units', () => {
    for (const unit of defaultSave().ownedUnits) expect(CORE_UNITS).toContain(unit);
  });

  it('the contested mixed army draws one exclusive from every territory-holding race', () => {
    const units = mixedRoster();
    for (const core of CORE_UNITS) expect(units).toContain(core);
    for (const race of BLOC_RACES) expect(units).toContain(RACE_EXCLUSIVES[race]);
    expect(units).toHaveLength(CORE_UNITS.length + BLOC_RACES.length);
  });

  it('every roster unit has a display name', () => {
    for (const race of RACES) for (const unit of rosterFor(race)) expect(UNIT_NAMES[unit], `unit ${unit}`).toBeTruthy();
  });
});
