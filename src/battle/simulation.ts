/**
 * Reference battle simulation behind the `BattleSimulation` seam.
 *
 * It implements the rules document's battle frame (§17): spawners and
 * recharge (§4), scoring, the territory bar and the timer (§5), the unit
 * state machine (§7) with melee strikes, projectiles and kill credit (§8),
 * and the computer opponent (§13). Every unit statistic is read from the
 * roster definition; nothing here spells a number that belongs to a unit.
 *
 * Deliberate simplifications, to be refined by the combat slice: projectile
 * drift is not modelled (a projectile hits its target when it overlaps it),
 * corpses are removed after a fixed time instead of fading, and the
 * level-one tutorial does not hold the timer — it runs from the first frame.
 *
 * One deviation from the rules document, by the work order: a human lane key
 * wraps from lane 8 to lane 1 and back instead of clamping.
 */
import { killBounty, unitStats, type Attack, type UnitId, type UpgradeTrack } from '../roster';
import {
  BAR_CENTRE,
  BAR_PIXELS_PER_POINT,
  BAR_WIDTH,
  BATTLE_LENGTH_FRAMES,
  FIELD,
  INITIAL_LANE,
  KILLS_PER_CHARGE,
  LANE_COUNT,
  SIDES,
  type BattleConfig,
  type BattleSimulation,
  type FrameState,
  type ProjectileState,
  type Side,
  type SideSetup,
  type SpawnerCommand,
  type SpawnerState,
  type UnitState,
} from './types';

/** Frames a corpse stays on the field (500 frames, then the original's ~100-frame fade). */
const CORPSE_FRAMES = 600;
/** A walking unit shoves a living enemy within this distance (§7.2). */
const SHOVE_RANGE = 50;
/** Knockback per landed strike is capped here (§7.3). */
const MAX_KNOCKBACK = 50;
/** Retreating units run home at this speed (§5.4). */
const RETREAT_SPEED = 6;
/** Frames of a retreat walk cycle before the unit re-decides. */
const RETREAT_CLIP = 12;
/** A projectile hits its target when within this distance of it. */
const PROJECTILE_HIT_RANGE = 40;
/** Chance a unit with a target in range walks (and shoves) instead of attacking (§7.1). */
const WALK_INSTEAD_CHANCE = 0.2;
/** Weapon tracks add this much power per level (§8.1). */
const POWER_PER_LEVEL = 5;
/** Armour adds this many hit points per level at spawn (§9). */
const HP_PER_ARMOUR_LEVEL = 10;

interface Unit {
  id: number;
  side: Side;
  unit: UnitId;
  lane: number;
  x: number;
  hp: number;
  maxHp: number;
  speed: number;
  facing: 1 | -1;
  retreating: boolean;
  dead: boolean;
  deadFrames: number;
  phase: 'walk' | 'attack';
  /** The swipe being played, when attacking. */
  attack: Attack | null;
  /** Frame index within the current clip. */
  frame: number;
  /** Frames left in the current clip; 0 means decide again. */
  cycleLeft: number;
  targetId: number | null;
  /** Whether the current walk is the forced walk after a shot (no re-decision until done). */
  forcedWalk: boolean;
}

interface Projectile {
  id: number;
  side: Side;
  lane: number;
  x: number;
  kind: ProjectileState['kind'];
  facing: 1 | -1;
  power: number;
  speed: number;
  targetId: number;
}

interface Spawner {
  readonly setup: SideSetup;
  lane: number;
  selected: number;
  charged: number;
  chargeKills: number;
  kills: number;
  gold: number;
  /** AI only: the per-battle lane allowance (§13). */
  allowance: number;
}

const other = (side: Side): Side => (side === 'left' ? 'right' : 'left');
const facingOf = (side: Side): 1 | -1 => (side === 'left' ? 1 : -1);

export class ReferenceBattle implements BattleSimulation {
  private readonly rng: () => number;
  private readonly lengthFrames: number;
  private readonly spawners: Record<Side, Spawner>;
  private units: Unit[] = [];
  private projectiles: Projectile[] = [];
  private nextId = 1;
  private tickCount = 0;
  private framesLeft: number;
  private leftScore = 0;
  private rightScore = 0;
  private barWidth = BAR_CENTRE;
  private winner: Side | null = null;
  private winReason: FrameState['winReason'] = null;
  private winnerTick: number | null = null;

  constructor(private readonly config: BattleConfig) {
    if (config.left.army.length === 0 || config.right.army.length === 0) {
      throw new Error('a battle side needs at least one unit in its army');
    }
    this.rng = config.rng ?? Math.random;
    this.lengthFrames = config.lengthFrames ?? BATTLE_LENGTH_FRAMES;
    this.framesLeft = this.lengthFrames;
    this.spawners = {
      left: this.makeSpawner(config.left),
      right: this.makeSpawner(config.right),
    };
  }

  private makeSpawner(setup: SideSetup): Spawner {
    return {
      setup,
      lane: INITIAL_LANE,
      selected: 0,
      charged: 0,
      chargeKills: 0,
      kills: 0,
      gold: 0,
      allowance: Math.floor(this.rng() * 4) - 1,
    };
  }

  // ---------------------------------------------------------------- commands

  command(side: Side, command: SpawnerCommand): boolean {
    const s = this.spawners[side];
    switch (command) {
      case 'lane-up':
        s.lane = s.lane === 1 ? LANE_COUNT : s.lane - 1;
        return true;
      case 'lane-down':
        s.lane = s.lane === LANE_COUNT ? 1 : s.lane + 1;
        return true;
      case 'previous-unit':
        s.selected = (s.selected + s.setup.army.length - 1) % s.setup.army.length;
        return true;
      case 'next-unit':
        s.selected = (s.selected + 1) % s.setup.army.length;
        return true;
      case 'release':
        return this.release(side);
      case 'charge':
        return this.charge(side);
    }
  }

  surrender(side: Side): void {
    if (this.winner) return;
    this.decide(other(side), 'surrender');
  }

  private selectedUnit(s: Spawner): UnitId {
    return s.setup.army[s.selected] ?? s.setup.army[0]!;
  }

  private rechargeTime(s: Spawner): number {
    return unitStats(this.selectedUnit(s)).recharge;
  }

  private canRelease(s: Spawner): boolean {
    return this.winner === null && s.charged >= this.rechargeTime(s);
  }

  private release(side: Side): boolean {
    const s = this.spawners[side];
    if (!this.canRelease(s)) return false;
    this.spawn(side, this.selectedUnit(s), s.lane);
    s.charged = 0;
    return true;
  }

  private charge(side: Side): boolean {
    const s = this.spawners[side];
    if (!this.canRelease(s) || s.chargeKills < KILLS_PER_CHARGE) return false;
    for (let lane = 1; lane <= LANE_COUNT; lane++) this.spawn(side, this.selectedUnit(s), lane);
    s.chargeKills = 0;
    s.charged = 0;
    return true;
  }

  private level(side: Side, track: UpgradeTrack | null): number {
    if (!track) return 0;
    return this.spawners[side].setup.upgrades?.[track] ?? 0;
  }

  private spawn(side: Side, unit: UnitId, lane: number): void {
    const stats = unitStats(unit);
    const bonus = this.spawners[side].setup.statBonus ?? 1;
    const hp = Math.round((stats.hitPoints + HP_PER_ARMOUR_LEVEL * this.level(side, 'armour')) * bonus);
    this.units.push({
      id: this.nextId++,
      side,
      unit,
      lane,
      x: side === 'left' ? FIELD.leftSpawnX : FIELD.rightSpawnX,
      hp,
      maxHp: hp,
      speed: (stats.walk.fixedSpeed ?? stats.speed) + this.rng() / 2,
      facing: facingOf(side),
      retreating: false,
      dead: false,
      deadFrames: 0,
      phase: 'walk',
      attack: null,
      frame: 0,
      cycleLeft: 0,
      targetId: null,
      forcedWalk: false,
    });
  }

  // -------------------------------------------------------------------- tick

  tick(): void {
    this.tickCount++;
    for (const side of SIDES) this.tickSpawner(side);
    for (const unit of [...this.units]) this.tickUnit(unit);
    for (const p of [...this.projectiles]) this.tickProjectile(p);
    this.tickBar();
    this.tickTimer();
  }

  private tickSpawner(side: Side): void {
    const s = this.spawners[side];
    s.charged++;
    if (s.setup.control === 'ai') this.aiStep(side);
    else if (s.setup.autoSend && this.canRelease(s) && s.chargeKills < KILLS_PER_CHARGE) this.release(side);
  }

  /** The computer opponent (§13): head-counts per lane, a jittery lane and unit choice, 10 % release chance per ready frame. */
  private aiStep(side: Side): void {
    const s = this.spawners[side];
    const enemy = other(side);
    for (let lane = 1; lane <= LANE_COUNT; lane++) {
      const pressure = this.living(enemy, lane) - this.living(side, lane);
      if (pressure > s.allowance) {
        s.lane = lane;
        if (this.rng() < 0.4) break;
      }
    }
    if (this.rng() < 0.02) s.lane = Math.min(LANE_COUNT, Math.max(1, s.lane + (this.rng() < 0.5 ? -1 : 1)));
    if (this.rng() < 1 / (2 * this.rechargeTime(s))) {
      this.command(side, this.rng() < 0.5 ? 'previous-unit' : 'next-unit');
    }
    if (this.canRelease(s) && this.rng() < 0.1) {
      if (s.chargeKills > KILLS_PER_CHARGE) this.charge(side);
      else this.release(side);
    }
  }

  private living(side: Side, lane: number): number {
    let n = 0;
    for (const u of this.units) if (u.side === side && u.lane === lane && !u.dead) n++;
    return n;
  }

  private tickUnit(u: Unit): void {
    if (u.dead) {
      if (++u.deadFrames >= CORPSE_FRAMES) this.remove(u);
      return;
    }
    if (this.winner && !u.retreating && u.side !== this.winner) {
      u.retreating = true;
      u.facing = u.facing === 1 ? -1 : 1;
      u.speed = RETREAT_SPEED;
      u.cycleLeft = 0;
    }
    if (u.cycleLeft === 0) this.ready(u);
    if (u.phase === 'walk') {
      const walk = unitStats(u.unit).walk;
      if (u.retreating || u.forcedWalk || u.frame < walk.movingFrames) this.move(u, u.speed);
    } else if (u.attack) {
      this.attackFrame(u, u.attack);
    }
    if (this.units.includes(u) && !u.dead) {
      u.frame++;
      u.cycleLeft--;
      // A shot forces some units into a walk before they decide again (the Archer's 40 frames, §8.4).
      if (u.cycleLeft === 0 && u.phase === 'attack' && u.attack?.kind === 'projectile' && u.attack.walkAfter > 0) {
        u.cycleLeft = u.attack.walkAfter;
        u.phase = 'walk';
        u.attack = null;
        u.frame = 0;
        u.forcedWalk = true;
      }
    }
  }

  /** The decision state (§7.1): acquire the closest enemy in range, then attack (80 %) or walk. */
  private ready(u: Unit): void {
    u.frame = 0;
    u.forcedWalk = false;
    if (u.retreating) {
      u.phase = 'walk';
      u.attack = null;
      u.targetId = null;
      u.cycleLeft = RETREAT_CLIP;
      return;
    }
    const stats = unitStats(u.unit);
    const target = this.closestEnemy(u, stats.range);
    u.targetId = target?.id ?? null;
    if (target && this.rng() > WALK_INSTEAD_CHANCE && stats.attacks.length > 0) {
      const pick = Math.min(stats.attacks.length - 1, Math.floor(this.rng() * stats.attacks.length));
      u.phase = 'attack';
      u.attack = stats.attacks[pick]!;
      u.cycleLeft = u.attack.clip;
    } else {
      u.phase = 'walk';
      u.attack = null;
      u.cycleLeft = stats.walk.clip;
    }
  }

  private closestEnemy(u: Unit, range: number): Unit | null {
    let best: Unit | null = null;
    let bestDistance = range;
    for (const e of this.units) {
      if (e.side === u.side || e.lane !== u.lane || e.dead) continue;
      const d = Math.abs(e.x - u.x);
      if (d < bestDistance) {
        best = e;
        bestDistance = d;
      }
    }
    return best;
  }

  /** The move routine (§7.2): advance, shove a touching enemy, score at the far edge. */
  private move(u: Unit, amount: number): void {
    const step = amount * (1 + this.level(u.side, 'speed') / 10) * u.facing;
    u.x += step;
    if (!u.retreating) {
      for (const e of this.units) {
        if (e.side !== u.side && e.lane === u.lane && !e.dead && Math.abs(e.x - u.x) <= SHOVE_RANGE) {
          e.x += step;
          break;
        }
      }
    }
    if (u.retreating) {
      if ((u.side === 'left' && u.x < FIELD.rightExitX) || (u.side === 'right' && u.x > FIELD.leftExitX)) this.remove(u);
      return;
    }
    if (u.side === 'left' && u.x > FIELD.leftExitX) {
      this.remove(u);
      this.leftScore++;
    } else if (u.side === 'right' && u.x < FIELD.rightExitX) {
      this.remove(u);
      this.rightScore++;
    }
  }

  private attackFrame(u: Unit, a: Attack): void {
    if (a.kind === 'melee') {
      if (a.movement === 'own-speed') this.move(u, u.speed);
      else if (a.movement === 'forward-5') this.move(u, 5);
      else if (a.movement === 'back-6' && u.frame >= 2 && u.frame <= 10) this.move(u, -6);
      if (!this.units.includes(u)) return;
    }
    const strike = a.strikeFrames.indexOf(u.frame);
    if (strike < 0) return;
    const bonus = this.spawners[u.side].setup.statBonus ?? 1;
    let power = (a.power[strike] ?? 0) * bonus;
    if (a.kind === 'melee') {
      if (a.upgraded) power += POWER_PER_LEVEL * this.level(u.side, unitStats(u.unit).upgradeTrack);
      const target = this.unitById(u.targetId);
      if (!target || Math.abs(target.x - u.x) > a.reach) return;
      this.damage(u.side, target, power, Math.min(power, MAX_KNOCKBACK) * u.facing);
    } else if (u.targetId !== null) {
      this.projectiles.push({
        id: this.nextId++,
        side: u.side,
        lane: u.lane,
        x: u.x,
        kind: a.projectile,
        facing: u.facing,
        power,
        speed: a.projectileSpeed,
        targetId: u.targetId,
      });
    }
  }

  private unitById(id: number | null): Unit | null {
    if (id === null) return null;
    return this.units.find((u) => u.id === id) ?? null;
  }

  /** Apply a damage roll of 0…power−1 and resolve a kill (§7.3, §8.3). */
  private damage(by: Side, target: Unit, power: number, knockback: number): void {
    if (target.dead) return;
    target.hp -= Math.floor(this.rng() * Math.max(1, power));
    target.x += knockback;
    if (target.hp <= 0) {
      target.dead = true;
      target.hp = 0;
      target.cycleLeft = 0;
      const s = this.spawners[by];
      s.kills++;
      s.gold += killBounty(target.unit);
      s.chargeKills++;
    }
  }

  private tickProjectile(p: Projectile): void {
    p.x += p.speed * p.facing;
    const target = this.unitById(p.targetId);
    if (target && !target.dead && target.lane === p.lane && Math.abs(target.x - p.x) <= PROJECTILE_HIT_RANGE) {
      this.damage(p.side, target, p.power, 0);
      this.projectiles = this.projectiles.filter((q) => q !== p);
      return;
    }
    if (p.x < FIELD.rightExitX || p.x > FIELD.leftExitX) this.projectiles = this.projectiles.filter((q) => q !== p);
  }

  private remove(u: Unit): void {
    this.units = this.units.filter((v) => v !== u);
  }

  /** The territory bar (§5.2): 1 px per frame toward its target; full or empty decides the battle. */
  private tickBar(): void {
    const target = this.barTarget();
    if (this.barWidth < target) this.barWidth++;
    else if (this.barWidth > target) this.barWidth--;
    if (this.winner) return;
    if (this.barWidth >= BAR_WIDTH) this.decide('left', 'bar');
    else if (this.barWidth <= 0) this.decide('right', 'bar');
  }

  private barTarget(): number {
    return BAR_CENTRE + BAR_PIXELS_PER_POINT * (this.leftScore - this.rightScore);
  }

  /** The timer (§5.3): at zero the higher score wins; a tie plays on. */
  private tickTimer(): void {
    if (this.winner) return;
    if (this.framesLeft > 0) this.framesLeft--;
    if (this.framesLeft === 0) {
      if (this.leftScore > this.rightScore) this.decide('left', 'time');
      else if (this.rightScore > this.leftScore) this.decide('right', 'time');
    }
  }

  private decide(side: Side, reason: FrameState['winReason']): void {
    this.winner = side;
    this.winReason = reason;
    this.winnerTick = this.tickCount;
  }

  // ---------------------------------------------------------------- snapshot

  snapshot(): FrameState {
    return {
      tick: this.tickCount,
      framesLeft: this.framesLeft,
      leftScore: this.leftScore,
      rightScore: this.rightScore,
      barTarget: this.barTarget(),
      barWidth: this.barWidth,
      winner: this.winner,
      winReason: this.winReason,
      winnerTick: this.winnerTick,
      sides: {
        left: summary(this.config.left),
        right: summary(this.config.right),
      },
      spawners: {
        left: this.spawnerState('left'),
        right: this.spawnerState('right'),
      },
      units: this.units.map(
        (u): UnitState => ({
          id: u.id,
          side: u.side,
          unit: u.unit,
          lane: u.lane,
          x: u.x,
          hp: u.hp,
          maxHp: u.maxHp,
          phase: u.dead ? 'dead' : u.phase,
          retreating: u.retreating,
          facing: u.facing,
        }),
      ),
      projectiles: this.projectiles.map(
        (p): ProjectileState => ({ id: p.id, side: p.side, lane: p.lane, x: p.x, kind: p.kind, facing: p.facing }),
      ),
    };
  }

  private spawnerState(side: Side): SpawnerState {
    const s = this.spawners[side];
    const rechargeTime = this.rechargeTime(s);
    const canRelease = this.canRelease(s);
    return {
      lane: s.lane,
      selected: s.selected,
      unit: this.selectedUnit(s),
      charged: s.charged,
      rechargeTime,
      rechargeProgress: Math.min(1, s.charged / rechargeTime),
      canRelease,
      chargeKills: s.chargeKills,
      chargeReady: canRelease && s.chargeKills >= KILLS_PER_CHARGE,
      kills: s.kills,
      gold: s.gold,
    };
  }
}

function summary(setup: SideSetup): FrameState['sides']['left'] {
  return { race: setup.race, army: setup.army, control: setup.control };
}

/** Create the reference simulation for a configured battle. */
export function createBattle(config: BattleConfig): BattleSimulation {
  return new ReferenceBattle(config);
}
