import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { UNIT_NAMES, raceName } from '../names';
import { ROSTER, UNIT_IDS, referencedAtlases, type RosterDefinition, type UnitId } from './index';
import { validateRoster, type AtlasDocuments } from './validate';

const id = (name: string): UnitId => UNIT_IDS.find((u) => UNIT_NAMES[u] === name)!;

/** The atlases as the build check reads them from public/. */
const atlases = (): AtlasDocuments =>
  Object.fromEntries(
    referencedAtlases().map((url) => {
      // Vitest runs from the project root, where the build check also reads public/.
      return [url, JSON.parse(readFileSync(join(process.cwd(), 'public', url), 'utf8')) as AtlasDocuments[string]];
    }),
  );

const withRace = (race: keyof RosterDefinition['races'], patch: Partial<RosterDefinition['races'][typeof race]>): RosterDefinition => ({
  ...ROSTER,
  races: { ...ROSTER.races, [race]: { ...ROSTER.races[race], ...patch } },
});

describe('roster validation (AC 6)', () => {
  it('the shipped definition and its atlases are consistent', () => {
    expect(validateRoster(ROSTER, atlases())).toEqual([]);
  });

  it('two races owning the Giant Troll fails, naming the unit and both races', () => {
    const troll = id('Giant Troll');
    const errors = validateRoster(withRace('race5', { exclusive: troll }), atlases());
    expect(errors.length).toBeGreaterThan(0);
    const message = errors.map((e) => e.message).join('\n');
    expect(message).toContain('Giant Troll');
    expect(message).toContain(`unit ${troll}`);
    expect(message).toContain('race4');
    expect(message).toContain('race5');
    expect(message).toContain(raceName('race4'));
    expect(message).toContain(raceName('race5'));
    expect(message).toMatch(/more than one race/);
  });

  it('an exclusive owned by no race simply becomes generic; a starter that is an exclusive fails', () => {
    // Ownership is the only thing that makes a unit exclusive, so "owned by no race" is the generic pool.
    const generic = withRace('race4', { exclusive: null });
    expect(validateRoster(generic, atlases())).toEqual([]);
    const bad: RosterDefinition = { ...ROSTER, starters: [0, 1, id('Giant Troll')] };
    expect(validateRoster(bad, atlases()).map((e) => e.message).join('\n')).toMatch(/starter .*Giant Troll.* is a race exclusive/);
  });

  it('a strike frame at or beyond its clip length fails, naming the unit and swipe', () => {
    const axeman = id('Battle Axeman');
    const unit = ROSTER.units[axeman];
    const attack = unit.attacks[0]!;
    const broken: RosterDefinition = {
      ...ROSTER,
      units: { ...ROSTER.units, [axeman]: { ...unit, attacks: [{ ...attack, strikeFrames: [attack.clip] }] } },
    };
    const message = validateRoster(broken, atlases()).map((e) => e.message).join('\n');
    expect(message).toMatch(/Battle Axeman .*swipe 1 strikes at frame 28, beyond its 28-frame clip/);
  });

  it('an atlas reference that does not exist fails, naming the race and the url', () => {
    const message = validateRoster(withRace('race2', { atlas: 'assets/units/nowhere.json' }), atlases())
      .map((e) => e.message)
      .join('\n');
    expect(message).toContain('assets/units/nowhere.json');
    expect(message).toContain('race2');
    expect(message).toMatch(/does not exist/);
  });

  it('an atlas missing a frame for a unit the race fields fails', () => {
    const docs = atlases();
    const url = ROSTER.races.race7.atlas;
    const { [ROSTER.units[1].sprite]: _dropped, ...frames } = docs[url]!.frames;
    const errors = validateRoster(ROSTER, { ...docs, [url]: { ...docs[url]!, frames } });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.message).toMatch(/has no frame "swordsman"/);
  });

  it('a unit missing a per-race name fails', () => {
    // Names come from the naming file; a race whose prefix is blank cannot name its generic units.
    const message = validateRoster(withRace('race9' as never, { id: 'race9' as never, exclusive: null, palette: 'blue', atlas: ROSTER.races.race1.atlas }), atlases())
      .map((e) => e.message)
      .join('\n');
    expect(message).toMatch(/race9.* has no unit-name prefix/);
  });
});
