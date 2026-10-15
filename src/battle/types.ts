/**
 * The battle seam — what the battle screen renders and what it sends back.
 *
 * A `FrameState` is a plain snapshot of one simulation frame: scores, the
 * territory bar, the timer, each side's spawner (lane, selected unit,
 * recharge progress, charge kills) and every unit on the field. The screen
 * reads only this and issues `SpawnerCommand`s; it holds no rule of its own.
 * Geometry and timing constants are the rules document's (§2, §4, §5, §18).
 */
import type { RaceId, UnitId, UpgradeTrack } from '../roster';

export type Side = 'left' | 'right';
export const SIDES: readonly Side[] = ['left', 'right'];

export const FRAMES_PER_SECOND = 24;
export const LANE_COUNT = 8;
/** Lane both spawners start on. */
export const INITIAL_LANE = 4;
/** Frames in a full battle: 300 s at 24 fps. */
export const BATTLE_LENGTH_FRAMES = 7200;
/** Kills a side must bank before it may release a full line of eight. */
export const KILLS_PER_CHARGE = 20;
/** Frames the result panel waits before continuing on its own (§5.4). */
export const RESULT_AUTO_CONTINUE_FRAMES = 240;

/** The territory bar: 700 px wide, 14 px per point, a 25-point lead fills it (§5.2). */
export const BAR_WIDTH = 700;
export const BAR_PIXELS_PER_POINT = 14;
export const BAR_CENTRE = BAR_WIDTH / 2;

/** Field geometry in field units (§2). Lane 1 is the top lane. */
export const FIELD = {
  leftSpawnX: 50,
  rightSpawnX: 2800,
  /** A left unit past this x scores for the left side. */
  leftExitX: 2900,
  /** A right unit past this x scores for the right side. */
  rightExitX: -50,
  /** Horizontal extent used to map field x to the screen (exit to exit). */
  minX: -50,
  maxX: 2900,
  /** Field y of a lane: 600 + 150 × lane. */
  laneY: (lane: number): number => 600 + 150 * lane,
  minY: 750,
  maxY: 1800,
} as const;

/** What a player (or the AI) may ask a spawner to do. */
export type SpawnerCommand = 'lane-up' | 'lane-down' | 'previous-unit' | 'next-unit' | 'release' | 'charge';

export interface SpawnerState {
  /** Lane the arrow points at, 1–8. */
  readonly lane: number;
  /** Index into the side's army. */
  readonly selected: number;
  /** The selected unit. */
  readonly unit: UnitId;
  /** Frames accumulated since the last release (never capped). */
  readonly charged: number;
  /** Frames the selected unit needs before it may be released. */
  readonly rechargeTime: number;
  /** `charged / rechargeTime`, clamped to 1 — the button's fill. */
  readonly rechargeProgress: number;
  /** True when a release would succeed now. */
  readonly canRelease: boolean;
  /** Kills banked toward the next charge. */
  readonly chargeKills: number;
  /** True when a charge may be released (kills banked, recharge done). */
  readonly chargeReady: boolean;
  /** Kills this side has made in the battle. */
  readonly kills: number;
  /** Gold this side has earned from bounties. */
  readonly gold: number;
}

export type UnitPhase = 'walk' | 'attack' | 'dead';

export interface UnitState {
  /** Unique within the battle. */
  readonly id: number;
  readonly side: Side;
  readonly unit: UnitId;
  readonly lane: number;
  /** Field x. */
  readonly x: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly phase: UnitPhase;
  readonly retreating: boolean;
  /** +1 when walking toward the right edge, −1 toward the left. */
  readonly facing: 1 | -1;
}

export interface ProjectileState {
  readonly id: number;
  readonly side: Side;
  readonly lane: number;
  readonly x: number;
  readonly kind: 'arrow' | 'axe' | 'javelin' | 'magic';
  readonly facing: 1 | -1;
}

export type WinReason = 'bar' | 'time' | 'surrender';

export interface SideSummary {
  /** The race fielding the side, or `null` for the contested regions' mixed host. */
  readonly race: RaceId | null;
  readonly army: readonly UnitId[];
  readonly control: 'human' | 'ai';
}

export interface FrameState {
  /** Frames simulated so far. */
  readonly tick: number;
  /** Frames left on the clock; 0 once time is up (the battle may continue in sudden death). */
  readonly framesLeft: number;
  readonly leftScore: number;
  readonly rightScore: number;
  /** Where the bar is heading: `BAR_CENTRE + BAR_PIXELS_PER_POINT × (left − right)`. */
  readonly barTarget: number;
  /** Where the bar is drawn this frame; it moves 1 px per frame toward the target. */
  readonly barWidth: number;
  readonly winner: Side | null;
  readonly winReason: WinReason | null;
  /** Tick on which the winner was decided, or `null`. */
  readonly winnerTick: number | null;
  readonly sides: Readonly<Record<Side, SideSummary>>;
  readonly spawners: Readonly<Record<Side, SpawnerState>>;
  readonly units: readonly UnitState[];
  readonly projectiles: readonly ProjectileState[];
}

export interface SideSetup {
  /** The race fielding the side, or `null` for the contested regions' mixed host. */
  readonly race: RaceId | null;
  /** The unit ids this side may release, in rack order. */
  readonly army: readonly UnitId[];
  readonly control: 'human' | 'ai';
  /** Upgrade levels by track; missing tracks are 0. */
  readonly upgrades?: Readonly<Partial<Record<UpgradeTrack, number>>>;
  /** Multiplier on hit points and strike power (the contested host's bonus). */
  readonly statBonus?: number;
  /** Release the selected unit as soon as the recharge completes (options' Auto Send). */
  readonly autoSend?: boolean;
}

export interface BattleConfig {
  readonly left: SideSetup;
  readonly right: SideSetup;
  /** Defaults to `BATTLE_LENGTH_FRAMES`. */
  readonly lengthFrames?: number;
  /** Source of uniform floats in [0, 1); `Math.random` in the game, seeded in tests. */
  readonly rng?: () => number;
}

/** The simulation as the screen sees it. */
export interface BattleSimulation {
  snapshot(): FrameState;
  /** Advance one frame. */
  tick(): void;
  /** Apply a command to a side's spawner; returns whether it did anything. */
  command(side: Side, command: SpawnerCommand): boolean;
  /** Hand the battle to the other side (the surrender button). */
  surrender(side: Side): void;
}
