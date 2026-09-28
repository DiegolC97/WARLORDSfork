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

/** Working race names in roster order (race1…race6). */
export const RACE_NAMES: Readonly<Record<RaceId, string>> = {
  race1: 'Empire',
  race2: 'Dwarfs',
  race3: 'High Elves',
  race4: 'Orcs & Goblins',
  race5: 'Warriors of Chaos',
  race6: 'Lizardmen',
};

/**
 * Working unit names keyed by unit id (the numbers the save's `ownedUnits`
 * holds). 0, 1 and 2 are the starting trio. To be checked against the rules
 * document's unit list as the roster is delivered.
 */
export const UNIT_NAMES: Readonly<Record<number, string>> = {
  0: 'Spearman',
  1: 'Swordsman',
  2: 'Archer',
};

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
