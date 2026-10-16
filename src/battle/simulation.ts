/**
 * The battle simulation behind the `BattleSimulation` seam — headless,
 * deterministic, and ignorant of pixels.
 *
 * It implements the rules document's battle frame (§17): spawners and
 * recharge (§4), scoring, the territory bar and the timer (§5), the unit
 * state machine (§7) with melee strikes, projectiles and kill credit (§8),
 * the upgrade formulas (§9, in `upgrades.ts`) and the computer opponent
 * (§13). Every unit statistic is read from the roster definition; nothing
 * here spells a number that belongs to a unit, and every roll comes from
 * one seeded generator (`rng.ts`).
 *
 * All positions, ranges and speeds are field units per frame at 24 frames
 * per second. The only output is the frame snapshot: entity ids, positions,
 * lanes, unit types, races, facings, the clip each unit plays and the frame
 * of it, plus the blows that landed this tick. Where the document catalogues
 * a quirk (§16) the decision to preserve or fix it is recorded in
 * `quirks.ts` and marked at the rule it touches.
 *
 * Deviations by the work order: a human lane key wraps 8 → 1 instead of
 * clamping; once a winner is decided the battle is over — `tick()` does
 * nothing more, so the deciding tick's snapshot is the final state, and the
 * document's post-decision retreat (§5.4) is left to the screen.
 */
import { killBounty, unitStats, type Attack, type UnitId, type UpgradeTrack } from '../roster';
import { createRng, randomSeed, type Rng } from './rng';
import {
  BAR_CENTRE,
  BAR_PIXELS_PER_POINT,
  BAR_WIDTH,
  BATTLE_LENGTH_FRAMES,
  BODY_FRAMES,
  FADE_PER_FRAME,
  FIELD,
  INITIAL_LANE,
  KILLS_PER_CHARGE,
  LANE_COUNT,
  MAX_KNOCKBACK,
  POINTS_TO_WIN,
  PROJECTILE_LAUNCH_HEIGHT,
  SIDES,
  UNIT_HITBOX,
  type BattleConfig,
  type BattleSimulation,
  type ClipName,
  type FrameState,
  type HitEvent,
  type ProjectileState,
  type Side,
  type SideSetup,
  type SpawnerCommand,
  type SpawnerState,
  type UnitState,
} from './types';
import { driftRange, hitPointsAtSpawn, levelOf, speedFactor, strikePower } from './upgrades';

/** A walking unit shoves a living enemy within this distance (§7.2). */
const SHOVE_RANGE = 50;
/** Chance a unit with a target in range walks (and shoves) instead of attacking (§7.1). */
const WALK_INSTEAD_CHANCE = 0.2;
/** Frames after which a fading body is gone: `BODY_FRAMES` at full opacity, then `1 / FADE_PER_FRAME` of fade. */
const BODY_REMOVAL_FRAMES = BODY_FRAMES + Math.round(1 / FADE_PER_FRAME);

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
  dead: boolean;
  /** Tick on which the unit died; the body's age is measured from it. */
  diedTick: number;
  phase: 'walk' | 'attack';
  /** The swipe being played, when attacking, and its index in the roster's list. */
  attack: Attack | null;
  attackIndex: number;
  /** Frame offset within the current clip — the frame this tick processed. */
  frame: number;
  /** Frames left in the current clip after this one; 0 means the next tick decides again. */
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
  y: number;
  /** Vertical movement per frame, rolled once at launch (§8.4). */
  drift: number;
  kind: ProjectileState['kind'];
  facing: 1 | -1;
  power: number;
  speed: number;
  /** The unit that fired it; the projectile tests overlap with that unit's current target only (§8.4). */
  firerId: number;
  targetId: number | null;
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
  private readonly seed: number;
  private readonly rng: Rng;
  private readonly lengthFrames: number;
  private readonly spawners: Record<Side, Spawner>;
  private units: Unit[] = [];
  private projectiles: Projectile[] = [];
  private hits: HitEvent[] = [];
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
    this.seed = config.seed ?? randomSeed();
    this.rng = createRng(this.seed);
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
      allowance: this.rng.random(4) - 1,
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

  /** Quirk 9 preserved: `charged` carries over a unit switch and has no cap (§3, §4). */
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

  /** A side's level in an upgrade track: signed, 0 when unset, −1 on the race's handicap track. */
  private level(side: Side, track: UpgradeTrack | null): number {
    return levelOf(this.spawners[side].setup.upgrades, track);
  }

  private spawn(side: Side, unit: UnitId, lane: number): void {
    const stats = unitStats(unit);
    const hp = hitPointsAtSpawn(stats.hitPoints, this.level(side, 'armour'), this.spawners[side].setup.statBonus);
    this.units.push({
      id: this.nextId++,
      side,
      unit,
      lane,
      x: side === 'left' ? FIELD.leftSpawnX : FIELD.rightSpawnX,
      hp,
      maxHp: hp,
      // Quirk 5 preserved: some walks hard-code 5 per frame; the jitter still applies (§6.1).
      speed: (stats.walk.fixedSpeed ?? stats.speed) + this.rng.rand() / 2,
      facing: facingOf(side),
      dead: false,
      diedTick: -1,
      phase: 'walk',
      attack: null,
      attackIndex: -1,
      frame: 0,
      cycleLeft: 0,
      targetId: null,
      forcedWalk: false,
    });
  }

  // -------------------------------------------------------------------- tick

  tick(): void {
    if (this.winner) return;
    this.tickCount++;
    this.hits = [];
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
        if (this.rng.rand() < 0.4) break;
      }
    }
    if (this.rng.rand() < 0.02) s.lane = Math.min(LANE_COUNT, Math.max(1, s.lane + (this.rng.rand() < 0.5 ? -1 : 1)));
    if (this.rng.rand() < 1 / (2 * this.rechargeTime(s))) {
      this.command(side, this.rng.rand() < 0.5 ? 'previous-unit' : 'next-unit');
    }
    if (this.canRelease(s) && this.rng.rand() < 0.1) {
      // Quirk 10 preserved: the computer charges on more than 20 kills, a human on 20 or more.
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
      // The body (§7.4; quirk 11 preserved): 500 frames lying, then a fade to removal.
      if (this.bodyAge(u) >= BODY_REMOVAL_FRAMES) this.remove(u);
      return;
    }
    // Advance the clip; at its end the unit decides again (or walks off a shot).
    if (u.cycleLeft > 0) {
      u.frame++;
      u.cycleLeft--;
    }
    if (u.cycleLeft === 0) {
      if (u.phase === 'attack' && u.attack?.kind === 'projectile' && u.attack.walkAfter > 0) this.walkOffShot(u, u.attack.walkAfter);
      else this.ready(u);
    }
    if (u.phase === 'walk') {
      const walk = unitStats(u.unit).walk;
      if (u.forcedWalk || u.frame < walk.movingFrames) this.move(u, u.speed);
    } else if (u.attack) {
      this.attackFrame(u, u.attack);
    }
  }

  /** Frames since the unit died (0 on the tick of death). */
  private bodyAge(u: Unit): number {
    return this.tickCount - u.diedTick;
  }

  /** Quirk 6 preserved: a shot forces some units into a walk before they decide again (the Archer's 40 frames, §8.4). */
  private walkOffShot(u: Unit, frames: number): void {
    u.phase = 'walk';
    u.attack = null;
    u.attackIndex = -1;
    u.frame = 0;
    u.cycleLeft = frames;
    u.forcedWalk = true;
  }

  /** The decision state (§7.1): acquire the closest enemy in range, then attack (80 %) or walk. */
  private ready(u: Unit): void {
    u.frame = 0;
    u.forcedWalk = false;
    const stats = unitStats(u.unit);
    const target = this.closestEnemy(u, stats.range);
    u.targetId = target?.id ?? null;
    if (target && this.rng.rand() > WALK_INSTEAD_CHANCE && stats.attacks.length > 0) {
      const pick = this.rng.random(stats.attacks.length);
      u.phase = 'attack';
      u.attack = stats.attacks[pick]!;
      u.attackIndex = pick;
      u.cycleLeft = u.attack.clip;
    } else {
      u.phase = 'walk';
      u.attack = null;
      u.attackIndex = -1;
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
    const step = amount * speedFactor(this.level(u.side, 'speed')) * u.facing;
    u.x += step;
    for (const e of this.units) {
      if (e.side !== u.side && e.lane === u.lane && !e.dead && Math.abs(e.x - u.x) <= SHOVE_RANGE) {
        e.x += step;
        break;
      }
    }
    if (u.side === 'left' && u.x > FIELD.leftExitX) {
      this.remove(u);
      this.leftScore++;
    } else if (u.side === 'right' && u.x < FIELD.rightExitX) {
      this.remove(u);
      this.rightScore++;
    }
  }

  /**
   * One frame of a swipe (§7.3): some swipes keep moving; on a strike frame
   * a melee blow lands within reach, a ranged swipe launches its projectile.
   */
  private attackFrame(u: Unit, a: Attack): void {
    if (a.kind === 'melee') {
      if (a.movement === 'own-speed') this.move(u, u.speed);
      else if (a.movement === 'forward-5') this.move(u, 5);
      else if (a.movement === 'back-6' && u.frame >= 2 && u.frame <= 10) this.move(u, -6);
      if (!this.units.includes(u)) return;
    }
    const strike = a.strikeFrames.indexOf(u.frame);
    if (strike < 0) return;
    // Quirks 2, 3 and 4 preserved through the roster: which strikes scale, and with which track, is data.
    const scales = a.kind === 'melee' && a.upgraded;
    const power = strikePower(
      a.power[strike] ?? 0,
      scales,
      scales ? this.level(u.side, unitStats(u.unit).upgradeTrack) : 0,
      this.spawners[u.side].setup.statBonus,
    );
    if (a.kind === 'melee') {
      const target = this.unitById(u.targetId);
      // A blow on a body does nothing: the document lets it land without credit, which no rule can observe.
      if (!target || target.dead || Math.abs(target.x - u.x) > a.reach) return;
      this.damage(u, target, 'melee', power, Math.min(power, MAX_KNOCKBACK) * u.facing);
    } else if (u.targetId !== null) {
      // Drift is (base − Archery) × (rand − rand), rolled once; magic ignores Archery (§8.4).
      const range = driftRange(a.driftBase, a.archeryAffectsDrift, this.level(u.side, 'archery'));
      const drift = range * (this.rng.rand() - this.rng.rand());
      this.projectiles.push({
        id: this.nextId++,
        side: u.side,
        lane: u.lane,
        x: u.x,
        y: PROJECTILE_LAUNCH_HEIGHT,
        drift,
        kind: a.projectile,
        facing: u.facing,
        power,
        speed: a.projectileSpeed,
        firerId: u.id,
        targetId: u.targetId,
      });
    }
  }

  private unitById(id: number | null): Unit | null {
    if (id === null) return null;
    return this.units.find((u) => u.id === id) ?? null;
  }

  /** Apply a damage roll of 0…power−1 and the knockback, and resolve a kill (§7.3, §8.3). */
  private damage(by: { id: number; side: Side }, target: Unit, kind: HitEvent['kind'], power: number, knockback: number): void {
    if (target.dead) return;
    const damage = this.rng.random(power);
    target.hp -= damage;
    target.x += knockback;
    const killed = target.hp <= 0;
    if (killed) {
      target.dead = true;
      target.diedTick = this.tickCount;
      target.hp = 0;
      target.cycleLeft = 0;
      const s = this.spawners[by.side];
      s.kills++;
      s.gold += killBounty(target.unit);
      s.chargeKills++;
    }
    this.hits.push({ by: by.id, target: target.id, kind, power, damage, knockback, killed });
  }

  /**
   * A projectile's frame (§8.4): fly, then test overlap with the firer's
   * current target only — it passes through everything else — and leave the
   * field at −50 or 2850. A dead or departed firer leaves it on the last target.
   */
  private tickProjectile(p: Projectile): void {
    p.x += p.speed * p.facing;
    p.y += p.drift;
    const firer = this.unitById(p.firerId);
    if (firer && !firer.dead) p.targetId = firer.targetId;
    const target = this.unitById(p.targetId);
    if (target && !target.dead && target.lane === p.lane && this.overlaps(p, target)) {
      this.damage({ id: p.firerId, side: p.side }, target, 'projectile', p.power, 0);
      this.projectiles = this.projectiles.filter((q) => q !== p);
      return;
    }
    if (p.x < FIELD.projectileMinX || p.x > FIELD.projectileMaxX) this.projectiles = this.projectiles.filter((q) => q !== p);
  }

  private overlaps(p: Projectile, target: Unit): boolean {
    return Math.abs(target.x - p.x) <= UNIT_HITBOX.halfWidth && p.y >= 0 && p.y <= UNIT_HITBOX.height;
  }

  private remove(u: Unit): void {
    this.units = this.units.filter((v) => v !== u);
  }

  /**
   * The territory bar (§5.2): the drawn width moves 1 px per frame toward
   * its target for the renderer, but the battle is decided on the lead
   * itself, on the tick a crossing makes it 25, and the width snaps to the
   * end. Quirk 19 fixed: the original decided on the animated width, so the
   * win came up to 14 frames late or, if the score swung back, not at all.
   */
  private tickBar(): void {
    const target = this.barTarget();
    if (this.barWidth < target) this.barWidth++;
    else if (this.barWidth > target) this.barWidth--;
    const lead = this.leftScore - this.rightScore;
    if (lead >= POINTS_TO_WIN) {
      this.barWidth = BAR_WIDTH;
      this.decide('left', 'bar');
    } else if (lead <= -POINTS_TO_WIN) {
      this.barWidth = 0;
      this.decide('right', 'bar');
    }
  }

  private barTarget(): number {
    return BAR_CENTRE + BAR_PIXELS_PER_POINT * (this.leftScore - this.rightScore);
  }

  /** The timer (§5.3): at zero the higher score wins; a tie plays on until the scores differ or the bar decides. */
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
      seed: this.seed,
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
      units: this.units.map((u) => this.unitState(u)),
      projectiles: this.projectiles.map(
        (p): ProjectileState => ({ id: p.id, side: p.side, lane: p.lane, x: p.x, y: p.y, kind: p.kind, facing: p.facing, firer: p.firerId }),
      ),
      hits: [...this.hits],
    };
  }

  private unitState(u: Unit): UnitState {
    const age = u.dead ? this.bodyAge(u) : 0;
    const clip: ClipName = u.dead ? 'death' : u.phase === 'attack' ? `swipe-${u.attackIndex + 1}` : 'walk';
    return {
      id: u.id,
      side: u.side,
      unit: u.unit,
      race: this.spawners[u.side].setup.race,
      lane: u.lane,
      x: u.x,
      hp: u.hp,
      maxHp: u.maxHp,
      phase: u.dead ? 'dead' : u.phase,
      facing: u.facing,
      clip,
      clipFrame: u.dead ? age : u.frame,
      alpha: u.dead ? Math.max(0, Math.round(100 - 100 * FADE_PER_FRAME * Math.max(0, age - BODY_FRAMES))) / 100 : 1,
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

/** Create the simulation for a configured battle. */
export function createBattle(config: BattleConfig): BattleSimulation {
  return new ReferenceBattle(config);
}
