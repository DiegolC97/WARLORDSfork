/**
 * Roster resolvers — every question a screen asks about units and races is
 * answered here by reading the definition in `data.ts`. No statistic is
 * spelled in this file.
 *
 * Every function takes the definition as an optional last argument so tests
 * and the build check can run it over a modified copy; screens use the
 * default, `ROSTER`.
 */
import { EXCLUSIVE_UNIT_NAMES, RACE_UNIT_PREFIX, UNIT_NAMES } from '../names';
import { BLOC_RACES, RACES, type RaceId } from './races';
import {
  ROSTER,
  UNIT_IDS,
  UPGRADE_TRACKS,
  UPGRADE_TRACK_IDS,
  type RosterDefinition,
  type UnitDefinition,
  type UnitId,
  type UpgradeTrack,
} from './data';

export function isUnitId(value: number): value is UnitId {
  return (UNIT_IDS as readonly number[]).includes(value);
}

/** The full statistics of a unit; identical whichever race fields it. */
export function unitStats(unit: UnitId, def: RosterDefinition = ROSTER): UnitDefinition {
  return def.units[unit];
}

/** Race ids the definition knows, in roster order. */
export function definedRaces(def: RosterDefinition = ROSTER): readonly RaceId[] {
  return Object.keys(def.races) as RaceId[];
}

/** Every race that owns `unit` as its exclusive — one for a valid definition, more for a broken one. */
export function ownersOf(unit: UnitId, def: RosterDefinition = ROSTER): RaceId[] {
  return definedRaces(def).filter((race) => def.races[race].exclusive === unit);
}

/** Which race's exclusive a unit is, or `null` for a generic unit. */
export function exclusiveOf(unit: UnitId, def: RosterDefinition = ROSTER): RaceId | null {
  return ownersOf(unit, def)[0] ?? null;
}

export function isGeneric(unit: UnitId, def: RosterDefinition = ROSTER): boolean {
  return ownersOf(unit, def).length === 0;
}

/** Units every race may field, in id order. */
export function genericUnits(def: RosterDefinition = ROSTER): UnitId[] {
  return UNIT_IDS.filter((unit) => isGeneric(unit, def));
}

/** Units owned by some race, in id order. */
export function exclusiveUnits(def: RosterDefinition = ROSTER): UnitId[] {
  return UNIT_IDS.filter((unit) => !isGeneric(unit, def));
}

/** True when `race` may buy and field `unit`: generic, or that race's own exclusive. */
export function isAvailable(unit: UnitId, race: RaceId, def: RosterDefinition = ROSTER): boolean {
  return isGeneric(unit, def) || def.races[race].exclusive === unit;
}

/** Every unit `race` may field, in id order: the generic pool plus its exclusive. */
export function availableUnits(race: RaceId, def: RosterDefinition = ROSTER): UnitId[] {
  return UNIT_IDS.filter((unit) => isAvailable(unit, race, def));
}

/** The three units a new campaign army starts with. */
export function starterUnits(def: RosterDefinition = ROSTER): readonly UnitId[] {
  return def.starters;
}

/**
 * The army a region of `race` defends with: the starting trio plus the
 * race's exclusive. (The rules document's per-region rosters belong to the
 * campaign-difficulty slice.)
 */
export function rosterFor(race: RaceId, def: RosterDefinition = ROSTER): readonly UnitId[] {
  const exclusive = def.races[race].exclusive;
  return exclusive === null ? [...def.starters] : [...def.starters, exclusive];
}

/**
 * The army a contested region fields: the starting trio plus the exclusive
 * of every race that holds territory on the map.
 */
export function mixedRoster(def: RosterDefinition = ROSTER): readonly UnitId[] {
  const exclusives = BLOC_RACES.map((race) => def.races[race].exclusive).filter((u): u is UnitId => u !== null);
  return [...def.starters, ...exclusives];
}

/** A source of uniform floats in [0, 1); `Math.random` in the game, seeded in tests. */
export type Rng = () => number;

/**
 * A two-player side's army (rules §14): the starting trio plus two distinct
 * generic units drawn at random from the rest of the generic pool. Each
 * side draws independently; a race-exclusive unit is never drawn, whichever
 * race the side plays.
 */
export function twoPlayerArmy(race: RaceId, rng: Rng = Math.random, def: RosterDefinition = ROSTER): UnitId[] {
  const pool = genericUnits(def).filter((unit) => !def.starters.includes(unit) && isAvailable(unit, race, def));
  const extras: UnitId[] = [];
  while (extras.length < def.twoPlayerExtras && pool.length > 0) {
    const index = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
    extras.push(...pool.splice(index, 1));
  }
  return [...def.starters, ...extras];
}

/**
 * The name a unit shows when `race` fields it. A race's own exclusive
 * carries its in-world name; every other unit takes the race's prefix on
 * the shared base name. Never blank: an unnamed unit falls back to its id.
 */
export function unitDisplayName(unit: UnitId, race: RaceId, def: RosterDefinition = ROSTER): string {
  if (def.races[race].exclusive === unit) {
    const own = EXCLUSIVE_UNIT_NAMES[race];
    if (own) return own;
  }
  const prefix = RACE_UNIT_PREFIX[race] ?? race;
  const base = UNIT_NAMES[unit] ?? `Unit ${unit}`;
  return `${prefix} ${base}`;
}

/** Gold the shop charges for a unit. */
export function shopPrice(unit: UnitId, def: RosterDefinition = ROSTER): number {
  return def.units[unit].cost;
}

/** Gold the killer's owner receives for a kill: `ceil(cost / 50)` (rules §8.3). */
export function killBounty(unit: UnitId, def: RosterDefinition = ROSTER): number {
  return Math.ceil(def.units[unit].cost / 50);
}

/**
 * The shop's "Buy Unit" list (rules §11): in id order, every unit the
 * player does not own yet and may field as `race`. The document caps the
 * panel at eight entries, which with its ten generics always left room for
 * the race's exclusive; with thirteen generics that cap would hide the
 * exclusive from a new player, so the list is not cut.
 */
export function shopOffers(owned: readonly number[], race: RaceId, def: RosterDefinition = ROSTER): UnitId[] {
  return availableUnits(race, def).filter((unit) => !owned.includes(unit));
}

/** Slots on the army rack: the campaign army never exceeds this many unit types. */
export const ARMY_SLOTS = 8;

/** True when the army has a free rack slot for one more unit type. */
export function hasArmySlot(owned: readonly number[]): boolean {
  return owned.length < ARMY_SLOTS;
}

/** The level every race starts each upgrade track at: 0, except its handicap track at −1 (rules §10). */
export const HANDICAP_LEVEL = -1;

/**
 * The upgrade levels a side playing `race` starts a campaign or a
 * two-player battle with: only the race's handicap track, at −1. Tracks
 * absent from the record are level 0.
 */
export function raceStartingUpgrades(race: RaceId, def: RosterDefinition = ROSTER): Partial<Record<UpgradeTrack, number>> {
  return { [def.races[race].handicap]: HANDICAP_LEVEL };
}

/** Gold the next level of an upgrade track costs: `base × (1 + |level|)` (rules §9). No level cap. */
export function upgradeCost(track: UpgradeTrack, currentLevel: number): number {
  return UPGRADE_TRACKS[track].baseCost * (1 + Math.abs(currentLevel));
}

/** The seven tracks in shop order, each with its level in `levels` (missing = 0) and the cost of the next level. */
export function upgradePanel(levels: Readonly<Partial<Record<string, number>>> | undefined): { track: UpgradeTrack; level: number; cost: number }[] {
  return UPGRADE_TRACK_IDS.map((track) => {
    const level = levels?.[track] ?? 0;
    return { track, level, cost: upgradeCost(track, level) };
  });
}

export interface RaceVisuals {
  /** Sprite tint and map colour. */
  readonly tint: string;
  /** Atlas url, relative to the site root, for the screen's asset manifest. */
  readonly atlas: string;
  /** Atlas frame that draws `unit` for this race. */
  frame(unit: UnitId): string;
}

/** What the renderer needs to draw `race`'s units, resolved from the definition. */
export function raceVisuals(race: RaceId, def: RosterDefinition = ROSTER): RaceVisuals {
  const { palette, atlas } = def.races[race];
  return {
    tint: def.palettes[palette].tint,
    atlas,
    frame: (unit) => def.units[unit].sprite,
  };
}

/** Every atlas url the definition references, each once. */
export function referencedAtlases(def: RosterDefinition = ROSTER): string[] {
  return [...new Set(definedRaces(def).map((race) => def.races[race].atlas))];
}

export { RACES };
