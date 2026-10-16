/**
 * Roster validation — the checks that make the definition trustworthy.
 * `scripts/check-roster.mjs` runs this during `npm run build` and fails the
 * build on any error; tests run it over deliberately broken copies.
 *
 * Pure: the atlases the definition references are passed in as a map from
 * atlas url to the frame names it contains (the script reads them from
 * `public/`), so the check never touches the file system itself.
 */
import { EXCLUSIVE_UNIT_NAMES, RACE_UNIT_PREFIX, UNIT_NAMES, raceName, unitName } from '../names';
import { ROSTER, UNIT_IDS, UPGRADE_TRACKS, type RosterDefinition, type UnitId } from './data';
import { definedRaces, ownersOf, unitDisplayName } from './roster';

export interface RosterError {
  /** What the error is about, for grouping: a unit id, a race id or an atlas url. */
  readonly subject: string;
  readonly message: string;
}

export type AtlasFrames = Readonly<Record<string, readonly string[]>>;

export function validateRoster(def: RosterDefinition = ROSTER, atlases: AtlasFrames = {}): RosterError[] {
  const errors: RosterError[] = [];
  const err = (subject: string, message: string) => errors.push({ subject, message });
  const races = definedRaces(def);
  const label = (unit: UnitId) => `${unitName(unit)} (unit ${unit})`;

  // Exclusives: each owned by exactly one race.
  for (const race of races) {
    const exclusive = def.races[race].exclusive;
    if (exclusive !== null && !(exclusive in def.units)) {
      err(race, `${raceName(race)} (${race}) owns unit ${exclusive}, which is not defined`);
    }
  }
  for (const unit of UNIT_IDS) {
    const owners = ownersOf(unit, def);
    if (owners.length > 1) {
      const names = owners.map((race) => `${raceName(race)} (${race})`).join(' and ');
      err(String(unit), `${label(unit)} is exclusive to more than one race: ${names}`);
    }
  }

  // Handicaps: a known track, and a different one for every race.
  const handicapOwners = new Map<string, string>();
  for (const race of races) {
    const track = def.races[race].handicap;
    if (!(track in UPGRADE_TRACKS)) err(race, `${raceName(race)} (${race}) has an unknown handicap track "${track}"`);
    const prior = handicapOwners.get(track);
    if (prior) err(race, `${raceName(race)} (${race}) and ${raceName(prior as typeof race)} (${prior}) share the handicap track "${track}"`);
    handicapOwners.set(track, race);
  }

  // Starters: defined, distinct and generic.
  const seenStarters = new Set<UnitId>();
  for (const unit of def.starters) {
    if (!(unit in def.units)) err(String(unit), `starter unit ${unit} is not defined`);
    else if (ownersOf(unit, def).length > 0) err(String(unit), `starter ${label(unit)} is a race exclusive`);
    if (seenStarters.has(unit)) err(String(unit), `starter ${label(unit)} is listed twice`);
    seenStarters.add(unit);
  }

  // Names: a base name per unit, a prefix per race, an in-world name per exclusive, all distinct within a race.
  for (const unit of UNIT_IDS) {
    if (!UNIT_NAMES[unit]?.trim()) err(String(unit), `unit ${unit} has no base name`);
  }
  for (const race of races) {
    if (!RACE_UNIT_PREFIX[race]?.trim()) err(race, `${raceName(race)} (${race}) has no unit-name prefix`);
    const exclusive = def.races[race].exclusive;
    if (exclusive !== null && !EXCLUSIVE_UNIT_NAMES[race]?.trim()) {
      err(race, `${raceName(race)} (${race}) has no in-world name for its exclusive ${label(exclusive)}`);
    }
    const seen = new Map<string, UnitId>();
    for (const unit of UNIT_IDS) {
      const name = unitDisplayName(unit, race, def);
      if (!name.trim()) err(String(unit), `${label(unit)} has a blank name for ${raceName(race)} (${race})`);
      const other = seen.get(name);
      if (other !== undefined) {
        err(String(unit), `${label(unit)} and ${label(other)} share the name "${name}" for ${raceName(race)} (${race})`);
      }
      seen.set(name, unit);
    }
  }

  // Statistics: positive numbers, and every strike inside its clip.
  for (const unit of UNIT_IDS) {
    const u = def.units[unit];
    if (u.id !== unit) err(String(unit), `${label(unit)} is stored under id ${unit} but declares id ${u.id}`);
    for (const [field, value] of Object.entries({ speed: u.speed, hitPoints: u.hitPoints, recharge: u.recharge, range: u.range, cost: u.cost })) {
      if (!(Number.isFinite(value) && value > 0)) err(String(unit), `${label(unit)} has a non-positive ${field} (${value})`);
    }
    if (u.attacks.length === 0) err(String(unit), `${label(unit)} has no attacks`);
    u.attacks.forEach((attack, i) => {
      const swipe = `${label(unit)} swipe ${i + 1}`;
      if (!(attack.clip > 0)) err(String(unit), `${swipe} has a clip of ${attack.clip} frames`);
      if (attack.strikeFrames.length === 0) err(String(unit), `${swipe} has no strike frame`);
      if (attack.power.length !== attack.strikeFrames.length) {
        err(String(unit), `${swipe} has ${attack.power.length} power entries for ${attack.strikeFrames.length} strike frames`);
      }
      for (const frame of attack.strikeFrames) {
        if (frame >= attack.clip) err(String(unit), `${swipe} strikes at frame ${frame}, beyond its ${attack.clip}-frame clip`);
        if (frame < 0 || !Number.isInteger(frame)) err(String(unit), `${swipe} has an invalid strike frame ${frame}`);
      }
      for (const power of attack.power) if (!(power > 0)) err(String(unit), `${swipe} has a non-positive power ${power}`);
      if (attack.kind === 'melee' && attack.upgraded && u.upgradeTrack === null) {
        err(String(unit), `${swipe} scales with an upgrade but the unit has no upgrade track`);
      }
    });
  }

  // Visuals: palette known, atlas present, and a frame for every unit the race fields.
  for (const race of races) {
    const { palette, atlas } = def.races[race];
    if (!(palette in def.palettes)) err(race, `${raceName(race)} (${race}) uses unknown palette "${palette}"`);
    const frames = atlases[atlas];
    if (!frames) {
      err(atlas, `${raceName(race)} (${race}) references atlas "${atlas}", which does not exist`);
      continue;
    }
    for (const unit of UNIT_IDS) {
      const owner = ownersOf(unit, def)[0];
      if (owner !== undefined && owner !== race) continue;
      const frame = def.units[unit].sprite;
      if (!frames.includes(frame)) err(atlas, `atlas "${atlas}" has no frame "${frame}" for ${label(unit)} (${race})`);
    }
  }

  return errors;
}
