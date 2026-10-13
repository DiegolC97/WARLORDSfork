/**
 * Display names — THE single place every user-visible name lives.
 *
 * The working title and the working race names collide with a live
 * commercial setting. Development proceeds on them; the shipping names are
 * decided later and applied as ONE edit to this file. Nothing else in the
 * code, the data or the assets may spell these names: `npm run check:names`
 * fails the build if they leak anywhere else.
 *
 * Internal identifiers (`RaceId` = race1…race6, unit ids = numbers) are
 * deliberately opaque so they never change when a display name does.
 */
import type { RaceId } from '../save';
import type { RegionId } from '../campaign/regions';

export interface TitleLockup {
  /** Small line above the primary word, e.g. "Battle for the". */
  leading: string;
  /** Large primary line, e.g. "Old World". */
  primary: string;
}

/** The game's working title as a two-line lockup. */
export const GAME_TITLE: TitleLockup = {
  leading: 'Battle for the',
  primary: 'Old World',
};

/** Single-line form, for the document title and prose. */
export const GAME_TITLE_TEXT = `${GAME_TITLE.leading} ${GAME_TITLE.primary}`;

/**
 * Working race names in roster order (race1…race7). race7 is the race the
 * campaign awards on full conquest; its name is a placeholder until the
 * roster for it is decided.
 */
export const RACE_NAMES: Readonly<Record<RaceId, string>> = {
  race1: 'Empire',
  race2: 'Dwarfs',
  race3: 'High Elves',
  race4: 'Orcs & Goblins',
  race5: 'Warriors of Chaos',
  race6: 'Lizardmen',
  race7: 'Undead Legion',
};

/**
 * Working unit names keyed by unit id (the numbers the save's `ownedUnits`
 * holds). 0, 1 and 2 are the starting trio; 10–16 are each race's exclusive
 * unit in roster order (`src/roster`). Only race4's exclusive, the Giant
 * Troll, is confirmed from the work order; the rest are working names to be
 * checked against the rules document's unit list as the roster is delivered.
 */
export const UNIT_NAMES: Readonly<Record<number, string>> = {
  0: 'Spearman',
  1: 'Swordsman',
  2: 'Archer',
  10: 'Knight',
  11: 'Rune Guard',
  12: 'Dragon Rider',
  13: 'Giant Troll',
  14: 'Dread Champion',
  15: 'Thunder Lizard',
  16: 'Grave Colossus',
};

/**
 * Campaign region names keyed by region id (`src/campaign/regions.ts`).
 * Original names drafted to evoke a grim, old-world fantasy setting; none is
 * taken from a published setting. Grouped by the bloc that holds them.
 */
export const REGION_NAMES: Readonly<Record<RegionId, string>> = {
  // race1 bloc
  r01: 'Greywater Ford',
  r02: 'Hallowmere',
  r03: 'Kettlebrook Vale',
  r04: 'Ashenmark',
  // race2 bloc
  r05: 'Ironcleft Hold',
  r06: 'Coldanvil Pass',
  r07: 'Thornspire Peaks',
  r08: 'Deepcut Mines',
  // race3 bloc
  r09: 'Silverglade',
  r10: 'Starfall Shore',
  r11: 'The Whisperwood',
  r12: 'Moonreach Strand',
  // race4 bloc
  r13: 'Cragtooth Hills',
  r14: 'Mudspit Hollow',
  r15: 'Rustspear Gulch',
  r16: 'Bonepile Flats',
  // race5 bloc
  r17: 'The Howling Waste',
  r18: 'Blackfrost Tundra',
  r19: 'Skullmarch Ridge',
  r20: 'Thrallgate',
  // race6 bloc
  r21: 'Sunken Causeway',
  r22: 'Serpent Mire',
  r23: 'Emberstone Steps',
  r24: 'Vinewall Basin',
  // contested
  r25: 'The Pale Barrows',
  r26: 'Mistwrack Moor',
  r27: 'Ruins of Vellhaim',
  r28: 'Gallowsfen',
};

/** Shown on the map for the four regions no race holds. */
export const CONTESTED_LABEL = 'Contested';

/** The original game this project remakes; shown on the credits screen only. */
export const ORIGINAL_GAME = {
  title: 'Warlords: Call to Arms',
  author: 'Ben Olding',
  year: 2008,
} as const;

/** Shown when a name is asked for an id that has no entry (never silently blank). */
export function raceName(id: RaceId | null): string {
  return id === null ? 'No race chosen' : (RACE_NAMES[id] ?? id);
}

export function unitName(id: number): string {
  return UNIT_NAMES[id] ?? `Unit ${id}`;
}

export function regionName(id: RegionId): string {
  return REGION_NAMES[id] ?? id;
}
