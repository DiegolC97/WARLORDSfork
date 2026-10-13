/**
 * Race identifiers — the leaf of the roster definition, imported by both
 * `src/save` (the save stores a race id) and `data.ts` (which defines what
 * each race fields). Ids are deliberately opaque: every display name lives
 * in `src/names/displayNames.ts`, so a rename never touches code or saves.
 *
 * race1…race6 each own a bloc of the campaign map and can be picked for a
 * new campaign from the start. race7 owns no territory: it is the race the
 * campaign awards, selectable only once the save's `raceUnlocked` is true.
 * Adding a race: append its id here, define it in `data.ts`, name it in the
 * naming file, and give it a map colour through its palette.
 */
export const RACES = ['race1', 'race2', 'race3', 'race4', 'race5', 'race6', 'race7'] as const;
export type RaceId = (typeof RACES)[number];

/** The six races that hold territory on the campaign map and are always selectable. */
export const BLOC_RACES = ['race1', 'race2', 'race3', 'race4', 'race5', 'race6'] as const;
export type BlocRaceId = (typeof BLOC_RACES)[number];

/** The race awarded by conquering the whole map. */
export const UNLOCKABLE_RACE: RaceId = 'race7';
