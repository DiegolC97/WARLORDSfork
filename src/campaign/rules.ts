/**
 * Campaign rules — pure functions over the save and the region data. The
 * map screen renders what these return; the battle screen reports a result
 * through them. Nothing here touches storage or the DOM.
 *
 * Ownership lives in the save's `regionOwners`: each region maps to
 * `PLAYER_OWNER`, to the race id defending it, or to `null` for a contested
 * region nobody has taken yet. An empty map means the campaign has not
 * started (no race picked).
 */
import { BLOC_RACES, UNLOCKABLE_RACE, type BlocRaceId, type CampaignSave, type RaceId } from '../save';
import { mixedRoster, raceStartingUpgrades, rosterFor, starterUnits, type UnitId } from '../roster';
import { BLOCS, CONTESTED, REGIONS, isContested, region, type RegionId } from './regions';

export const PLAYER_OWNER = 'player';

/**
 * Multiplier the battle applies to the stats of a contested region's mixed
 * army, making the four contested regions the campaign's hardest battles.
 */
export const CONTESTED_STAT_BONUS = 1.25;

export type RegionOwners = Readonly<Record<string, string | null>>;

/**
 * The bloc a race starts from. The six territory-holding races start in their
 * own bloc. The unlockable race owns no bloc, so it starts from a host bloc
 * and must retake that bloc's holdout like anyone else.
 */
export function startingBloc(race: RaceId): BlocRaceId {
  return isBlocRace(race) ? race : 'race6';
}

function isBlocRace(race: RaceId): race is BlocRaceId {
  return (BLOC_RACES as readonly string[]).includes(race);
}

/** Ownership at campaign start for a chosen race: three regions held, the rest defended. */
export function initialOwners(race: RaceId): Record<RegionId, string | null> {
  const owners = {} as Record<RegionId, string | null>;
  for (const r of REGIONS) owners[r.id] = r.bloc === CONTESTED ? null : r.bloc;
  for (const id of BLOCS[startingBloc(race)].starting) owners[id] = PLAYER_OWNER;
  return owners;
}

/** True when `owners` covers every region — the campaign is under way. */
export function campaignStarted(owners: RegionOwners): boolean {
  return REGIONS.every((r) => r.id in owners);
}

export function playerRegions(owners: RegionOwners): RegionId[] {
  return REGIONS.filter((r) => owners[r.id] === PLAYER_OWNER).map((r) => r.id);
}

export function isHeldByPlayer(owners: RegionOwners, id: RegionId): boolean {
  return owners[id] === PLAYER_OWNER;
}

/**
 * Regions the player may attack: every region not yet held that borders a
 * region the player holds. Contested regions obey the same rule, so they are
 * open from any adjacent holding whichever bloc that holding came from.
 */
export function attackableRegions(owners: RegionOwners): RegionId[] {
  const open = new Set<RegionId>();
  for (const held of playerRegions(owners)) {
    for (const next of region(held).adjacent) if (owners[next] !== PLAYER_OWNER) open.add(next);
  }
  return REGIONS.filter((r) => open.has(r.id)).map((r) => r.id);
}

/** For an attackable region, the held regions it can be attacked from. */
export function attackOrigins(owners: RegionOwners, target: RegionId): RegionId[] {
  return region(target).adjacent.filter((n) => owners[n] === PLAYER_OWNER);
}

export type Defender = { kind: 'race'; race: RaceId } | { kind: 'contested' };

/** Who defends a region that is not held by the player. */
export function defenderOf(owners: RegionOwners, id: RegionId): Defender {
  const owner = owners[id];
  if (owner && owner !== PLAYER_OWNER && (BLOC_RACES as readonly string[]).includes(owner)) {
    return { kind: 'race', race: owner as RaceId };
  }
  return { kind: 'contested' };
}

export interface BattleSetup {
  readonly region: RegionId;
  readonly defender: Defender;
  /** Unit ids the defending army is drawn from (the roster definition). */
  readonly units: readonly UnitId[];
  /** Stat multiplier for the defenders; 1 for a race, `CONTESTED_STAT_BONUS` for a contested region. */
  readonly statBonus: number;
}

/** Everything the battle needs to field the defenders of `id`. */
export function battleSetup(owners: RegionOwners, id: RegionId): BattleSetup {
  const defender = defenderOf(owners, id);
  return defender.kind === 'race'
    ? { region: id, defender, units: rosterFor(defender.race), statBonus: 1 }
    : { region: id, defender, units: mixedRoster(), statBonus: isContested(id) ? CONTESTED_STAT_BONUS : 1 };
}

export function isCampaignComplete(owners: RegionOwners): boolean {
  return campaignStarted(owners) && REGIONS.every((r) => owners[r.id] === PLAYER_OWNER);
}

/** Battles won so far: regions held beyond the three starting ones. */
export function battlesWon(owners: RegionOwners): number {
  return Math.max(0, playerRegions(owners).length - 3);
}

/** Battles still to fight before the map is fully conquered. */
export function battlesRemaining(owners: RegionOwners): number {
  return REGIONS.length - playerRegions(owners).length;
}

export type CampaignPatch = Partial<Omit<CampaignSave, 'schemaVersion'>>;

/**
 * The save changes a victory over `id` produces: the region becomes the
 * player's, the campaign level advances, the pending battle is cleared, and
 * taking the last region unlocks the additional race. Returns `null` if the
 * region is not a legal target, so a stale `battleRegion` cannot hand out
 * territory.
 */
export function applyVictory(save: Readonly<CampaignSave>, id: RegionId): CampaignPatch | null {
  if (!attackableRegions(save.regionOwners).includes(id)) return null;
  const regionOwners = { ...save.regionOwners, [id]: PLAYER_OWNER };
  return {
    regionOwners,
    campaignLevel: battlesWon(regionOwners) + 1,
    battleRegion: null,
    raceUnlocked: save.raceUnlocked || isCampaignComplete(regionOwners),
  };
}

/**
 * The save changes picking `race` for a campaign produces: the race, its
 * three starting regions, no pending battle, and its upgrade tracks at
 * their starting levels — all 0 but the race's handicap at −1 (rules §10).
 */
export function pickRacePatch(race: RaceId): CampaignPatch {
  return {
    chosenRace: race,
    regionOwners: initialOwners(race),
    battleRegion: null,
    upgradeLevels: { ...raceStartingUpgrades(race) },
  };
}

/**
 * Reset the campaign for a new run while keeping settings, the unlock and
 * lifetime kills. The race is unset again so the player picks for the new
 * campaign (and may now pick the unlocked race).
 */
export function newCampaignPatch(save: Readonly<CampaignSave>): CampaignPatch {
  return {
    chosenRace: null,
    regionOwners: {},
    battleRegion: null,
    campaignLevel: 1,
    gold: 500,
    ownedUnits: [...starterUnits()],
    upgradeLevels: {},
    raceUnlocked: save.raceUnlocked,
  };
}
