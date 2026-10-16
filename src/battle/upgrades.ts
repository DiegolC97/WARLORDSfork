/**
 * The seven upgrade tracks as formulas (rules §9, §8.1, §8.4). Levels are
 * signed integers: a race starts one of its tracks at −1 (its handicap) and
 * the shop climbs from there, so −1 is a real level fed through the same
 * arithmetic as any other, never a sentinel. There is no cap.
 *
 * Pure functions over numbers, so a table test can walk every unit and
 * every level against the document without running a battle.
 */
import type { Attack, UnitDefinition, UpgradeTrack } from '../roster';

/** Movement (and shove) per level: ×(1 + level/10). */
export const SPEED_PER_LEVEL = 0.1;
/** Hit points per Armour level at spawn. */
export const HP_PER_ARMOUR_LEVEL = 10;
/** Power per level on the strikes of a weapon track. */
export const POWER_PER_LEVEL = 5;

export type UpgradeLevels = Readonly<Partial<Record<UpgradeTrack, number>>>;

/** The level of `track` in `levels`; a missing track is level 0. */
export function levelOf(levels: UpgradeLevels | undefined, track: UpgradeTrack | null): number {
  if (!track) return 0;
  return levels?.[track] ?? 0;
}

/** The factor the Speed track applies to every move and shove. */
export function speedFactor(speedLevel: number): number {
  return 1 + speedLevel * SPEED_PER_LEVEL;
}

/** Hit points a unit spawns with: base plus 10 per Armour level, scaled by the side's stat bonus. */
export function hitPointsAtSpawn(baseHitPoints: number, armourLevel: number, statBonus = 1): number {
  return Math.round((baseHitPoints + HP_PER_ARMOUR_LEVEL * armourLevel) * statBonus);
}

/**
 * The power a strike resolves at: the base power scaled by the side's stat
 * bonus, plus 5 per level of the unit's weapon track when the strike scales
 * with it. Projectiles and un-upgraded strikes ignore the level.
 */
export function strikePower(basePower: number, scalesWithTrack: boolean, trackLevel: number, statBonus = 1): number {
  return basePower * statBonus + (scalesWithTrack ? POWER_PER_LEVEL * trackLevel : 0);
}

/** The powers every strike of `attack` resolves at for a unit with `levels`. */
export function attackPowers(unit: UnitDefinition, attack: Attack, levels: UpgradeLevels | undefined, statBonus = 1): number[] {
  const scales = attack.kind === 'melee' && attack.upgraded;
  const level = scales ? levelOf(levels, unit.upgradeTrack) : 0;
  return attack.power.map((p) => strikePower(p, scales, level, statBonus));
}

/** The drift range of a projectile: its base, less the Archery level when the projectile answers to it. */
export function driftRange(driftBase: number, archeryAffectsDrift: boolean, archeryLevel: number): number {
  return archeryAffectsDrift ? driftBase - archeryLevel : driftBase;
}
