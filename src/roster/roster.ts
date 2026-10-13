/**
 * Roster seam — which units each race can field. The campaign map asks this
 * module for a region's defending army by race id; no unit statistics live
 * here or on the map.
 *
 * Unit ids are opaque numbers (names in `src/names/displayNames.ts`). 0–2
 * are the starting trio every race shares. Ids 10+ are each race's exclusive
 * unit. The shared roster beyond the starting trio (ids 3–9 are reserved for
 * it) and the exclusives other than race4's are still to be confirmed
 * against the rules document; only the structure is settled here.
 */
import { BLOC_RACES, RACES, type BlocRaceId, type RaceId } from '../save';

/** Units every race can field. */
export const CORE_UNITS: readonly number[] = [0, 1, 2];

/** The one unit only that race fields. */
export const RACE_EXCLUSIVES: Readonly<Record<RaceId, number>> = {
  race1: 10,
  race2: 11,
  race3: 12,
  race4: 13,
  race5: 14,
  race6: 15,
  race7: 16,
};

/** Every unit id a race may field, core first, then its exclusive. */
export function rosterFor(race: RaceId): readonly number[] {
  return [...CORE_UNITS, RACE_EXCLUSIVES[race]];
}

/**
 * The army a contested region fields: the shared core plus the exclusive of
 * every race that holds territory on the map — drawn from across the races,
 * as the work order puts it.
 */
export function mixedRoster(): readonly number[] {
  return [...CORE_UNITS, ...BLOC_RACES.map((race) => RACE_EXCLUSIVES[race])];
}

/** Which race's exclusive a unit is, or `null` for a shared unit. */
export function exclusiveOf(unit: number): RaceId | null {
  return RACES.find((race) => RACE_EXCLUSIVES[race] === unit) ?? null;
}

export type { BlocRaceId };
