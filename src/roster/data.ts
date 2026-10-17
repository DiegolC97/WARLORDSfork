/**
 * THE roster definition — the single source of every unit statistic and of
 * which race fields which unit. Every screen and system reads this through
 * `src/roster`; nothing else in the project may carry a copy of a stat.
 *
 * Numbers come from the rules document: §6.1 (unit table), §7.2 (walk
 * cycles), §8.2 (melee attack table), §8.4 (projectiles), §9 (upgrade
 * tracks). Unit ids are the document's unit indices 0–18, which is also what
 * the save's `ownedUnits` holds. Race ids are the opaque `race1`…`race7` of
 * `src/save` and no display name is spelled here: per-race names live in
 * `src/names/displayNames.ts` and are resolved by `unitDisplayName`.
 *
 * `npm run check:roster` validates this file at build time (see
 * `validate.ts`): every exclusive owned by exactly one race, every unit
 * named for every race, every strike inside its clip, every atlas present.
 */
import type { RaceId } from './races';

/** Unit ids in rules-document order. */
export const UNIT_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18] as const;
export type UnitId = (typeof UNIT_IDS)[number];

/** Melee weapon tracks (+5 power per level on the strikes that scale) and the two others. */
export type WeaponTrack = 'spear' | 'sword' | 'halberd' | 'axe';
export type UpgradeTrack = WeaponTrack | 'archery' | 'speed' | 'armour';

/** Kinds of movement a unit makes while a swipe plays (rules §7.3). */
export type SwipeMovement =
  | 'still'
  /** Keeps calling the move routine at its own speed, so it attacks while advancing. */
  | 'own-speed'
  /** Advances a fixed 5 units per frame for the whole swipe. */
  | 'forward-5'
  /** Backs up 6 units per frame on frames 2–10, then strikes. */
  | 'back-6';

interface AttackBase {
  /** Frames from the start of the swipe until the unit is back in *ready* — the clip length. */
  readonly clip: number;
  /**
   * Frame offsets within the clip at which a blow lands (melee) or the
   * projectile leaves (ranged). Each must be below `clip`.
   */
  readonly strikeFrames: readonly number[];
  /** Exclusive upper bound of the damage roll, one entry per strike frame. */
  readonly power: readonly number[];
}

export interface MeleeAttack extends AttackBase {
  readonly kind: 'melee';
  /** Distance within which the strike lands. */
  readonly reach: number;
  /** Whether the strikes add +5 × the owner's level in the unit's weapon track. */
  readonly upgraded: boolean;
  readonly movement: SwipeMovement;
}

export type ProjectileKind = 'arrow' | 'axe' | 'javelin' | 'magic';

export interface ProjectileAttack extends AttackBase {
  readonly kind: 'projectile';
  readonly projectile: ProjectileKind;
  /** Field units per frame. */
  readonly projectileSpeed: number;
  /**
   * Vertical drift per frame is `(driftBase − archeryLevel) × (rand − rand)`
   * when `archeryAffectsDrift`, else a fixed `driftBase × (rand − rand)`.
   */
  readonly driftBase: number;
  readonly archeryAffectsDrift: boolean;
  /** Frames of forced walking after the swipe before the unit decides again. */
  readonly walkAfter: number;
}

export type Attack = MeleeAttack | ProjectileAttack;

export interface WalkCycle {
  /** Frames one walk animation lasts before the unit re-decides. */
  readonly clip: number;
  /** Frames of the clip on which the unit actually moves (defaults to every frame). */
  readonly movingFrames: number;
  /** When set, the walk ignores `speed` and moves exactly this much per frame. */
  readonly fixedSpeed: number | null;
}

export interface UnitDefinition {
  readonly id: UnitId;
  /** Base horizontal movement per frame (the shop shows this even when the walk is fixed). */
  readonly speed: number;
  /** Hit points at spawn ("Armour" in the shop). */
  readonly hitPoints: number;
  /** Frames the spawner must accumulate before this unit can be released. */
  readonly recharge: number;
  /** Horizontal distance at which the unit decides to attack instead of walking. */
  readonly range: number;
  /** Gold price in the shop; the kill bounty is derived from it (`ceil(cost / 50)`). */
  readonly cost: number;
  /** The hand-typed "Max Damage" the shop tooltip shows; never used in combat. */
  readonly shownMaxDamage: number;
  readonly walk: WalkCycle;
  /**
   * The upgrade track this unit's attacks answer to: a weapon track for
   * melee strikes marked `upgraded`, `archery` for projectile drift, or
   * `null` when nothing scales (Speed and Armour apply to every unit).
   */
  readonly upgradeTrack: WeaponTrack | 'archery' | null;
  /** Every swipe the unit may pick in *ready*; one is chosen uniformly at random. */
  readonly attacks: readonly Attack[];
  /** Frame key inside the race atlas that draws this unit. */
  readonly sprite: string;
}

/**
 * Upgrade tracks (rules §9): the next level costs `baseCost × (1 + |level|)`
 * and there is no level cap. `label` is the document's shop text for the
 * track (a mechanic name, not a setting name, so it may live with the data).
 */
export interface UpgradeTrackDefinition {
  readonly baseCost: number;
  /** The track's name as the shop panel shows it (rules §9 "Shop text"). */
  readonly label: string;
  /** What one level does, as the shop describes it. */
  readonly effect: string;
}

/** The seven tracks in the order the shop panel lists them (rules §9). */
export const UPGRADE_TRACK_IDS = ['speed', 'armour', 'archery', 'spear', 'sword', 'halberd', 'axe'] as const satisfies readonly UpgradeTrack[];

export const UPGRADE_TRACKS: Readonly<Record<UpgradeTrack, UpgradeTrackDefinition>> = {
  speed: { baseCost: 600, label: 'Speed Training (+1)', effect: 'movement and shove ×(1 + level/10)' },
  armour: { baseCost: 600, label: 'Increased Armour (+10)', effect: '+10 hit points on every unit at spawn' },
  archery: { baseCost: 500, label: 'Marksmanship (+1)', effect: 'projectile drift reduced by 1' },
  spear: { baseCost: 300, label: 'Spear Training (+5)', effect: '+5 power on spear strikes' },
  sword: { baseCost: 450, label: 'Swordsmanship (+5)', effect: '+5 power on sword strikes' },
  halberd: { baseCost: 400, label: 'Halberd Training (+5)', effect: '+5 power on halberd strikes' },
  axe: { baseCost: 400, label: 'Axe Training (+5)', effect: '+5 power on axe strikes' },
};

export type PaletteId = 'blue' | 'orange' | 'sky' | 'green' | 'purple' | 'yellow' | 'vermilion';

export interface Palette {
  /** Tint applied to the race's unit sprites and used as its map colour. */
  readonly tint: string;
}

export interface RaceDefinition {
  readonly id: RaceId;
  /** The one unit only this race fields, or `null` for a race with the generic pool only. */
  readonly exclusive: UnitId | null;
  /**
   * The upgrade track this race starts at level −1 (rules §10 adapted: one
   * penalty per race, a different track for each). The level is signed and
   * flows through the ordinary formulas; the shop charges `base × 2` to
   * climb out of it (§9).
   */
  readonly handicap: UpgradeTrack;
  readonly palette: PaletteId;
  /** Texture atlas (relative to the site root) holding every unit the race fields. */
  readonly atlas: string;
}

/** The whole definition, so validation and tests can work on a modified copy. */
export interface RosterDefinition {
  readonly units: Readonly<Record<UnitId, UnitDefinition>>;
  readonly races: Readonly<Record<RaceId, RaceDefinition>>;
  readonly palettes: Readonly<Record<PaletteId, Palette>>;
  /** The three units every new campaign army starts with. */
  readonly starters: readonly UnitId[];
  /** Random generic units a two-player side receives on top of the starters. */
  readonly twoPlayerExtras: number;
}

const WALK: WalkCycle = { clip: 12, movingFrames: 12, fixedSpeed: null };
/** Units whose walk animation hard-codes 5 per frame (rules §6.1). */
const WALK_FIXED_5: WalkCycle = { clip: 12, movingFrames: 12, fixedSpeed: 5 };

function melee(
  clip: number,
  strikeFrames: readonly number[],
  reach: number,
  power: readonly number[],
  opts: { upgraded?: boolean; movement?: SwipeMovement } = {},
): MeleeAttack {
  return { kind: 'melee', clip, strikeFrames, reach, power, upgraded: opts.upgraded ?? true, movement: opts.movement ?? 'still' };
}

function projectile(
  projectileKind: ProjectileKind,
  clip: number,
  fireFrame: number,
  power: number,
  projectileSpeed: number,
  driftBase: number,
  opts: { archeryAffectsDrift?: boolean; walkAfter?: number } = {},
): ProjectileAttack {
  return {
    kind: 'projectile',
    projectile: projectileKind,
    clip,
    strikeFrames: [fireFrame],
    power: [power],
    projectileSpeed,
    driftBase,
    archeryAffectsDrift: opts.archeryAffectsDrift ?? true,
    walkAfter: opts.walkAfter ?? 0,
  };
}

/**
 * The Spearman's shield bash (rules §16.1): the original called an undefined
 * routine for it, so it never happened. Restored here as a fourth swipe —
 * a shield strike, so it does not scale with Spear Training — that enters
 * the uniform pick alongside the three spear swipes. The document's figure
 * for the three-swipe Spearman is 18.5 expected damage over 45 frames of
 * swipes (0.411 per frame); the bash lifts that to 28 over 63 (0.444),
 * which the hit points below absorb (40 → 37 keeps damage × toughness level;
 * see `src/roster/roster.test.ts`).
 */
const SPEARMAN_SHIELD_BASH: MeleeAttack = melee(18, [7], 100, [20], { upgraded: false });

export const UNITS: Readonly<Record<UnitId, UnitDefinition>> = {
  0: {
    id: 0, speed: 5, hitPoints: 37, recharge: 50, range: 130, cost: 250, shownMaxDamage: 20,
    walk: WALK, upgradeTrack: 'spear', sprite: 'spearman',
    attacks: [melee(15, [4], 130, [10]), melee(15, [4], 130, [20]), melee(15, [4], 130, [10]), SPEARMAN_SHIELD_BASH],
  },
  1: {
    id: 1, speed: 3, hitPoints: 100, recharge: 70, range: 100, cost: 600, shownMaxDamage: 35,
    walk: WALK, upgradeTrack: 'sword', sprite: 'swordsman',
    attacks: [
      melee(13, [5], 100, [25]),
      melee(13, [5], 100, [25]),
      melee(10, [7], 95, [30], { upgraded: false }), // no bonus in the original (bug kept)
      melee(16, [7], 115, [35]),
    ],
  },
  2: {
    id: 2, speed: 2, hitPoints: 15, recharge: 70, range: 1500, cost: 500, shownMaxDamage: 10,
    walk: { clip: 40, movingFrames: 40, fixedSpeed: null }, upgradeTrack: 'archery', sprite: 'archer',
    attacks: [projectile('arrow', 33, 17, 10, 70, 7, { walkAfter: 40 })],
  },
  3: {
    id: 3, speed: 3, hitPoints: 10, recharge: 180, range: 1000, cost: 900, shownMaxDamage: 50,
    walk: WALK_FIXED_5, upgradeTrack: null, sprite: 'mage',
    attacks: [projectile('magic', 40, 24, 50, 60, 4, { archeryAffectsDrift: false })],
  },
  4: {
    id: 4, speed: 6, hitPoints: 100, recharge: 180, range: 200, cost: 1400, shownMaxDamage: 20,
    walk: { clip: 8, movingFrames: 8, fixedSpeed: null }, upgradeTrack: 'spear', sprite: 'mounted-spearman',
    attacks: [melee(10, [4], 130, [20], { movement: 'own-speed' })],
  },
  5: {
    id: 5, speed: 2, hitPoints: 40, recharge: 60, range: 130, cost: 500, shownMaxDamage: 40,
    walk: WALK, upgradeTrack: 'halberd', sprite: 'halberdier',
    attacks: [melee(22, [7], 130, [35]), melee(22, [10], 130, [40])],
  },
  6: {
    id: 6, speed: 8, hitPoints: 60, recharge: 150, range: 200, cost: 1100, shownMaxDamage: 45,
    walk: { clip: 10, movingFrames: 10, fixedSpeed: null }, upgradeTrack: 'halberd', sprite: 'mounted-halberdier',
    attacks: [melee(21, [6], 130, [45], { movement: 'own-speed' })],
  },
  7: {
    id: 7, speed: 10, hitPoints: 10, recharge: 60, range: 60, cost: 400, shownMaxDamage: 10,
    walk: WALK, upgradeTrack: null, sprite: 'scout',
    attacks: [melee(17, [8], 60, [10], { upgraded: false }), melee(17, [8], 60, [10], { upgraded: false })],
  },
  8: {
    id: 8, speed: 3, hitPoints: 100, recharge: 130, range: 100, cost: 1000, shownMaxDamage: 60,
    walk: WALK, upgradeTrack: 'sword', sprite: 'longswordsman',
    attacks: [melee(28, [13], 130, [60]), melee(17, [11], 140, [40], { upgraded: false })],
  },
  9: {
    id: 9, speed: 3, hitPoints: 40, recharge: 60, range: 100, cost: 900, shownMaxDamage: 60,
    walk: WALK, upgradeTrack: 'axe', sprite: 'battle-axeman',
    attacks: [melee(28, [13], 109, [60])],
  },
  10: {
    id: 10, speed: 5, hitPoints: 100, recharge: 160, range: 160, cost: 1600, shownMaxDamage: 35,
    walk: WALK, upgradeTrack: 'halberd', sprite: 'whirler', // sword-wielding, scales with Halberd in the original
    attacks: [
      melee(17, [7, 12], 160, [35, 35], { movement: 'own-speed' }),
      melee(10, [3, 6], 130, [35, 25], { movement: 'own-speed' }),
    ],
  },
  11: {
    id: 11, speed: 3, hitPoints: 40, recharge: 70, range: 750, cost: 600, shownMaxDamage: 20,
    walk: WALK_FIXED_5, upgradeTrack: 'archery', sprite: 'axe-thrower',
    attacks: [projectile('axe', 40, 24, 20, 40, 7)],
  },
  12: {
    id: 12, speed: 2, hitPoints: 50, recharge: 120, range: 1700, cost: 1300, shownMaxDamage: 10,
    walk: WALK, upgradeTrack: 'archery', sprite: 'ranger',
    attacks: [projectile('arrow', 18, 7, 10, 70, 7)],
  },
  13: {
    id: 13, speed: 4, hitPoints: 50, recharge: 130, range: 750, cost: 800, shownMaxDamage: 25,
    walk: WALK_FIXED_5, upgradeTrack: 'archery', sprite: 'javelin-thrower',
    attacks: [projectile('javelin', 28, 12, 25, 70, 5)],
  },
  14: {
    id: 14, speed: 6, hitPoints: 130, recharge: 130, range: 130, cost: 1200, shownMaxDamage: 45,
    walk: WALK_FIXED_5, upgradeTrack: null, sprite: 'spearmaster',
    attacks: [
      melee(27, [19], 150, [45], { upgraded: false, movement: 'forward-5' }),
      melee(18, [11], 160, [40], { upgraded: false, movement: 'back-6' }),
      melee(15, [4], 130, [25], { upgraded: false }),
    ],
  },
  15: {
    id: 15, speed: 5, hitPoints: 80, recharge: 100, range: 110, cost: 500, shownMaxDamage: 45,
    walk: WALK, upgradeTrack: 'axe', sprite: 'axeman',
    attacks: [melee(15, [7], 70, [35], { movement: 'own-speed' }), melee(15, [8], 70, [45], { movement: 'own-speed' })],
  },
  16: {
    id: 16, speed: 5, hitPoints: 220, recharge: 400, range: 250, cost: 3200, shownMaxDamage: 500,
    walk: { clip: 19, movingFrames: 11, fixedSpeed: null }, upgradeTrack: null, sprite: 'giant-troll',
    attacks: [melee(26, [17], 250, [250], { upgraded: false }), melee(13, [7], 90, [500], { upgraded: false })],
  },
  17: {
    id: 17, speed: 3, hitPoints: 100, recharge: 180, range: 165, cost: 1300, shownMaxDamage: 100,
    walk: WALK, upgradeTrack: null, sprite: 'flailer',
    attacks: [melee(18, [9], 165, [100], { upgraded: false, movement: 'own-speed' })],
  },
  18: {
    id: 18, speed: 4, hitPoints: 120, recharge: 180, range: 130, cost: 1600, shownMaxDamage: 90,
    walk: WALK, upgradeTrack: 'sword', sprite: 'kings-guard',
    attacks: [melee(30, [10, 22], 130, [60, 60]), melee(19, [5, 13], 130, [20, 90])],
  },
};

/**
 * Okabe–Ito colours: distinguishable under protanopia, deuteranopia and
 * tritanopia (`src/campaign/palette.test.ts` simulates all three).
 */
export const PALETTES: Readonly<Record<PaletteId, Palette>> = {
  blue: { tint: '#0072B2' },
  orange: { tint: '#E69F00' },
  sky: { tint: '#56B4E9' },
  green: { tint: '#009E73' },
  purple: { tint: '#CC79A7' },
  yellow: { tint: '#F0E442' },
  vermilion: { tint: '#D55E00' },
};

/**
 * Each bloc race draws from its own atlas, generated by
 * `npm run build:atlases` from `art/units/` (the Spearman is authored; every
 * other unit still has a one-pixel legacy frame there and draws as the
 * tinted placeholder block). race7 has no art yet and keeps the placeholder
 * atlas. The atlas contract is `src/roster/atlas.ts`.
 */
const PLACEHOLDER_ATLAS = 'assets/units/placeholder-units.json';
const raceAtlas = (race: RaceId) => `assets/units/${race}.json`;

/**
 * The races. race1…race6 each own one exclusive; race7, the race a finished
 * campaign unlocks, fields the generic pool only. Adding a race is one more
 * entry here (plus its id in `src/save`, its names in the naming file).
 *
 * Handicaps: seven races, seven tracks, each race weak on a different one
 * and never on the track its own exclusive scales with.
 */
export const RACE_DEFINITIONS: Readonly<Record<RaceId, RaceDefinition>> = {
  race1: { id: 'race1', exclusive: 18, handicap: 'spear', palette: 'blue', atlas: raceAtlas('race1') },
  race2: { id: 'race2', exclusive: 9, handicap: 'speed', palette: 'orange', atlas: raceAtlas('race2') },
  race3: { id: 'race3', exclusive: 10, handicap: 'armour', palette: 'sky', atlas: raceAtlas('race3') },
  race4: { id: 'race4', exclusive: 16, handicap: 'archery', palette: 'green', atlas: raceAtlas('race4') },
  race5: { id: 'race5', exclusive: 17, handicap: 'sword', palette: 'purple', atlas: raceAtlas('race5') },
  race6: { id: 'race6', exclusive: 13, handicap: 'halberd', palette: 'yellow', atlas: raceAtlas('race6') },
  race7: { id: 'race7', exclusive: null, handicap: 'axe', palette: 'vermilion', atlas: PLACEHOLDER_ATLAS },
};

export const ROSTER: RosterDefinition = {
  units: UNITS,
  races: RACE_DEFINITIONS,
  palettes: PALETTES,
  starters: [0, 1, 2],
  twoPlayerExtras: 2,
};
