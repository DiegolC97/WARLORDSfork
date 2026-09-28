/**
 * Campaign save schema — the single-slot save described in the rules
 * document (section 15), adapted to the six-race roster.
 *
 * This file owns the *shape* of a save: the field list, the defaults applied
 * when no save exists, and validation of untrusted data. Reading and writing
 * stored bytes is the job of `saveStore.ts`.
 */

/**
 * Bump when the shape of `CampaignSave` changes; add a step to `migrations.ts`.
 * History: 1 — initial; 2 — added `zoom`.
 */
export const SAVE_SCHEMA_VERSION = 2;

/**
 * The six playable races in roster order. Ids are deliberately opaque so a
 * display-name change never touches code, data or saves; the names live in
 * `src/names/displayNames.ts`.
 */
export const RACES = ['race1', 'race2', 'race3', 'race4', 'race5', 'race6'] as const;

export type RaceId = (typeof RACES)[number];

export const QUALITIES = ['low', 'medium', 'high'] as const;
export type Quality = (typeof QUALITIES)[number];

/** Rendering zoom for the battlefield: scale factors the options screen offers. */
export const ZOOM_LEVELS = [0.75, 1, 1.25] as const;
export type ZoomLevel = (typeof ZOOM_LEVELS)[number];
export const DEFAULT_ZOOM: ZoomLevel = 1;

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
  /** Owner of each region, keyed by region id. `null` means unowned. */
  regionOwners: Record<string, string | null>;
}

/**
 * Defaults from the rules document when no save exists: sound on, music on,
 * auto-send off, quality medium, gold 500, kills 0, starting units 0, 1 and 2.
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
    ownedUnits: [0, 1, 2],
    upgradeLevels: {},
    regionOwners: {},
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
    return fail('chosenRace is not null or one of the six races');
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
  };
  return { ok: true, save };
}

function fail(reason: string): ValidationResult {
  return { ok: false, reason };
}
