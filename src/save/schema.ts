/**
 * Campaign save schema — the single-slot save described in the rules
 * document (section 15), adapted to the six-race roster.
 *
 * This file owns the *shape* of a save: the field list, the defaults applied
 * when no save exists, and validation of untrusted data. Reading and writing
 * stored bytes is the job of `saveStore.ts`.
 */
import { ROSTER } from '../roster/data';
import { BLOC_RACES, RACES, type RaceId } from '../roster/races';

/**
 * Bump when the shape of `CampaignSave` changes; add a step to `migrations.ts`.
 * History: 1 — initial; 2 — added `zoom`; 3 — added `battleRegion`, race7;
 * 4 — added `lastBattle`.
 */
export const SAVE_SCHEMA_VERSION = 4;

/**
 * Race ids come from the roster definition (`src/roster/races.ts`) and are
 * re-exported here because the save stores one. They are opaque on purpose.
 */
export { RACES, BLOC_RACES, UNLOCKABLE_RACE, type RaceId, type BlocRaceId } from '../roster/races';

/** Races the player may pick for a new campaign given the unlock flag. */
export function selectableRaces(raceUnlocked: boolean): readonly RaceId[] {
  return raceUnlocked ? RACES : BLOC_RACES;
}

export const QUALITIES = ['low', 'medium', 'high'] as const;
export type Quality = (typeof QUALITIES)[number];

/** Rendering zoom for the battlefield: scale factors the options screen offers. */
export const ZOOM_LEVELS = [0.75, 1, 1.25] as const;
export type ZoomLevel = (typeof ZOOM_LEVELS)[number];
export const DEFAULT_ZOOM: ZoomLevel = 1;

export const BATTLE_SIDES = ['left', 'right'] as const;
export type BattleSide = (typeof BATTLE_SIDES)[number];

/**
 * How the last battle ended, written by the battle screen when a winner is
 * decided and read by the result screen (schema 4+). The left side is the
 * campaign player; in a two-player battle it is the first player.
 */
export interface BattleResult {
  winner: BattleSide;
  leftScore: number;
  rightScore: number;
  /** `'campaign'` when fought over a region, `'two-player'` otherwise. */
  mode: 'campaign' | 'two-player';
}

/** Every field the rules document lists for the single save slot. */
export interface CampaignSave {
  schemaVersion: number;
  /** Graphics quality setting. */
  quality: Quality;
  /** Rendering zoom applied to the battlefield (schema 2+). */
  zoom: ZoomLevel;
  /** Current campaign level. */
  campaignLevel: number;
  /** The unlocked-race flag. */
  raceUnlocked: boolean;
  soundOn: boolean;
  musicOn: boolean;
  autoSendOn: boolean;
  gold: number;
  lifetimeKills: number;
  /** Chosen race. `null` until the player picks one before the first battle. */
  chosenRace: RaceId | null;
  /** Ids of the units the player owns. */
  ownedUnits: number[];
  /** Level of each upgrade, keyed by upgrade id. */
  upgradeLevels: Record<string, number>;
  /**
   * Owner of each region, keyed by region id: `'player'`, a race id, or
   * `null` for an unconquered contested region. Empty until the player picks
   * a race, which starts the campaign (schema 3 semantics; see src/campaign).
   */
  regionOwners: Record<string, string | null>;
  /**
   * Region the player is currently attacking, written by the map when a
   * battle is launched and cleared when it ends (schema 3+). `null` outside a
   * campaign battle, e.g. a two-player skirmish.
   */
  battleRegion: string | null;
  /** The last battle's outcome, or `null` before any battle has been fought (schema 4+). */
  lastBattle: BattleResult | null;
}

/**
 * Defaults from the rules document when no save exists: sound on, music on,
 * auto-send off, quality medium, gold 500, kills 0, and the roster's starting
 * trio as the army.
 * The document says "a random race"; this project instead leaves the race
 * unset and lets the player pick one before the first battle.
 */
export function defaultSave(): CampaignSave {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    quality: 'medium',
    zoom: DEFAULT_ZOOM,
    campaignLevel: 1,
    raceUnlocked: false,
    soundOn: true,
    musicOn: true,
    autoSendOn: false,
    gold: 500,
    lifetimeKills: 0,
    chosenRace: null,
    ownedUnits: [...ROSTER.starters],
    upgradeLevels: {},
    regionOwners: {},
    battleRegion: null,
    lastBattle: null,
  };
}

export type ValidationResult =
  | { ok: true; save: CampaignSave }
  | { ok: false; reason: string };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isNonNegativeInt = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0;

const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

/**
 * Validate an untrusted value against the current schema (or the version a
 * caller expects). Migrations must have already run; a mismatched version is
 * rejected here.
 */
export function validateSave(
  value: unknown,
  expectedVersion: number = SAVE_SCHEMA_VERSION,
): ValidationResult {
  if (!isRecord(value)) return fail('save is not an object');
  if (value.schemaVersion !== expectedVersion) {
    return fail(`schemaVersion ${String(value.schemaVersion)} is not ${expectedVersion}`);
  }
  if (!QUALITIES.includes(value.quality as Quality)) return fail('quality is not low|medium|high');
  if (!ZOOM_LEVELS.includes(value.zoom as ZoomLevel)) return fail(`zoom is not one of ${ZOOM_LEVELS.join('|')}`);
  if (!isNonNegativeInt(value.campaignLevel)) return fail('campaignLevel is not a non-negative integer');
  if (!isBool(value.raceUnlocked)) return fail('raceUnlocked is not a boolean');
  if (!isBool(value.soundOn)) return fail('soundOn is not a boolean');
  if (!isBool(value.musicOn)) return fail('musicOn is not a boolean');
  if (!isBool(value.autoSendOn)) return fail('autoSendOn is not a boolean');
  if (!isNonNegativeInt(value.gold)) return fail('gold is not a non-negative integer');
  if (!isNonNegativeInt(value.lifetimeKills)) return fail('lifetimeKills is not a non-negative integer');
  if (value.chosenRace !== null && !RACES.includes(value.chosenRace as RaceId)) {
    return fail('chosenRace is not null or a known race');
  }
  if (!Array.isArray(value.ownedUnits) || !value.ownedUnits.every(isNonNegativeInt)) {
    return fail('ownedUnits is not an array of non-negative integers');
  }
  if (!isRecord(value.upgradeLevels) || !Object.values(value.upgradeLevels).every(isNonNegativeInt)) {
    return fail('upgradeLevels is not a map of non-negative integers');
  }
  if (
    !isRecord(value.regionOwners) ||
    !Object.values(value.regionOwners).every((o) => o === null || typeof o === 'string')
  ) {
    return fail('regionOwners is not a map of string|null');
  }
  if (value.battleRegion !== null && typeof value.battleRegion !== 'string') {
    return fail('battleRegion is not a string or null');
  }
  if (value.lastBattle !== null && !isBattleResult(value.lastBattle)) {
    return fail('lastBattle is not a battle result or null');
  }

  const save: CampaignSave = {
    schemaVersion: expectedVersion,
    quality: value.quality as Quality,
    zoom: value.zoom as ZoomLevel,
    campaignLevel: value.campaignLevel,
    raceUnlocked: value.raceUnlocked,
    soundOn: value.soundOn,
    musicOn: value.musicOn,
    autoSendOn: value.autoSendOn,
    gold: value.gold,
    lifetimeKills: value.lifetimeKills,
    chosenRace: value.chosenRace as RaceId | null,
    ownedUnits: [...value.ownedUnits],
    upgradeLevels: { ...(value.upgradeLevels as Record<string, number>) },
    regionOwners: { ...(value.regionOwners as Record<string, string | null>) },
    battleRegion: value.battleRegion as string | null,
    lastBattle: value.lastBattle === null ? null : { ...(value.lastBattle as BattleResult) },
  };
  return { ok: true, save };
}

function isBattleResult(v: unknown): v is BattleResult {
  return (
    isRecord(v) &&
    BATTLE_SIDES.includes(v.winner as BattleSide) &&
    isNonNegativeInt(v.leftScore) &&
    isNonNegativeInt(v.rightScore) &&
    (v.mode === 'campaign' || v.mode === 'two-player')
  );
}

function fail(reason: string): ValidationResult {
  return { ok: false, reason };
}
