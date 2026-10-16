export {
  SIDES,
  FRAMES_PER_SECOND,
  LANE_COUNT,
  INITIAL_LANE,
  BATTLE_LENGTH_FRAMES,
  KILLS_PER_CHARGE,
  RESULT_AUTO_CONTINUE_FRAMES,
  BODY_FRAMES,
  FADE_PER_FRAME,
  MAX_KNOCKBACK,
  PROJECTILE_LAUNCH_HEIGHT,
  UNIT_HITBOX,
  BAR_WIDTH,
  BAR_PIXELS_PER_POINT,
  BAR_CENTRE,
  POINTS_TO_WIN,
  FIELD,
  type Side,
  type SpawnerCommand,
  type SpawnerState,
  type UnitPhase,
  type ClipName,
  type UnitState,
  type HitEvent,
  type ProjectileState,
  type WinReason,
  type SideSummary,
  type FrameState,
  type SideSetup,
  type BattleConfig,
  type BattleSimulation,
} from './types';
export { createBattle, ReferenceBattle } from './simulation';
export { createRng, randomSeed, type Rng } from './rng';
export { QUIRKS, quirk, type Quirk, type QuirkDecision } from './quirks';
export * from './upgrades';
export { battleHandle, attachBattleHandle, type BattleHandle } from './handle';
