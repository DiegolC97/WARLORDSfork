import { describe, expect, it } from 'vitest';
import { RACES, defaultSave } from '../save';
import { GAME_TITLE, RACE_NAMES, UNIT_NAMES, raceName, unitName } from './index';

describe('display names', () => {
  it('has a display name for every race id, and race ids are opaque', () => {
    for (const id of RACES) {
      expect(RACE_NAMES[id], `race ${id}`).toBeTruthy();
      expect(id).toMatch(/^race\d+$/);
      expect(RACE_NAMES[id].toLowerCase()).not.toContain(id);
    }
  });

  it('has a display name for every starting unit', () => {
    for (const unit of defaultSave().ownedUnits) expect(UNIT_NAMES[unit], `unit ${unit}`).toBeTruthy();
  });

  it('never returns a blank name', () => {
    expect(raceName(null)).toBeTruthy();
    expect(unitName(999)).toMatch(/999/);
  });

  it('title lockup has both lines', () => {
    expect(GAME_TITLE.leading.trim()).not.toBe('');
    expect(GAME_TITLE.primary.trim()).not.toBe('');
  });
});
