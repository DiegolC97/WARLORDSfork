import { describe, expect, it } from 'vitest';
import { unitStats } from '../roster';
import { createBattle } from './simulation';
import {
  BAR_CENTRE,
  BAR_PIXELS_PER_POINT,
  BAR_WIDTH,
  BATTLE_LENGTH_FRAMES,
  INITIAL_LANE,
  KILLS_PER_CHARGE,
  LANE_COUNT,
  POINTS_TO_WIN,
  FIELD,
  type BattleConfig,
  type BattleSimulation,
  type FrameState,
} from './types';

const humans = (overrides: Partial<BattleConfig> = {}): BattleConfig => ({
  left: { race: 'race1', army: [0, 1, 2], control: 'human' },
  right: { race: 'race2', army: [0, 1, 2], control: 'human' },
  seed: 1,
  ...overrides,
});

const ticks = (sim: BattleSimulation, n: number) => {
  for (let i = 0; i < n; i++) sim.tick();
};

const SPEARMAN_RECHARGE = unitStats(0).recharge;

describe('spawner and recharge (rules §4)', () => {
  it('both spawners start on lane 4 with the first unit selected and nothing charged', () => {
    const s = createBattle(humans()).snapshot();
    for (const side of ['left', 'right'] as const) {
      expect(s.spawners[side].lane).toBe(INITIAL_LANE);
      expect(s.spawners[side].selected).toBe(0);
      expect(s.spawners[side].unit).toBe(0);
      expect(s.spawners[side].canRelease).toBe(false);
      expect(s.spawners[side].rechargeTime).toBe(SPEARMAN_RECHARGE);
    }
  });

  it('refuses a release while the recharge is active and accepts it once charged', () => {
    const sim = createBattle(humans());
    ticks(sim, SPEARMAN_RECHARGE - 1);
    expect(sim.snapshot().spawners.left.canRelease).toBe(false);
    expect(sim.command('left', 'release')).toBe(false);
    expect(sim.snapshot().units).toHaveLength(0);
    sim.tick();
    expect(sim.snapshot().spawners.left.canRelease).toBe(true);
    expect(sim.command('left', 'release')).toBe(true);
    const after = sim.snapshot();
    expect(after.units).toHaveLength(1);
    expect(after.units[0]).toMatchObject({ side: 'left', unit: 0, lane: INITIAL_LANE });
    expect(after.spawners.left.charged).toBe(0);
    expect(after.spawners.left.canRelease).toBe(false);
  });

  it('a release requested every frame yields exactly one unit per recharge period', () => {
    const sim = createBattle(humans());
    let spawned = 0;
    const frames = SPEARMAN_RECHARGE * 5;
    for (let i = 0; i < frames; i++) {
      sim.tick();
      if (sim.command('left', 'release')) spawned++;
    }
    expect(spawned).toBe(5);
  });

  it('switching unit keeps the accumulated recharge and only changes the threshold', () => {
    const sim = createBattle(humans());
    ticks(sim, 60);
    sim.command('left', 'next-unit');
    const s = sim.snapshot().spawners.left;
    expect(s.unit).toBe(1);
    expect(s.charged).toBe(60);
    expect(s.rechargeTime).toBe(unitStats(1).recharge);
    expect(s.canRelease).toBe(60 >= unitStats(1).recharge);
  });

  it('unit selection wraps in both directions', () => {
    const sim = createBattle(humans());
    sim.command('left', 'previous-unit');
    expect(sim.snapshot().spawners.left.selected).toBe(2);
    sim.command('left', 'next-unit');
    expect(sim.snapshot().spawners.left.selected).toBe(0);
  });

  it('a single-unit army keeps that unit selected whichever way the selection moves', () => {
    const sim = createBattle(humans({ left: { race: 'race1', army: [5], control: 'human' } }));
    sim.command('left', 'next-unit');
    sim.command('left', 'previous-unit');
    expect(sim.snapshot().spawners.left).toMatchObject({ selected: 0, unit: 5, rechargeTime: unitStats(5).recharge });
  });
});

describe('lane selection cycles 1–8 and wraps (work order)', () => {
  it('lane-down from 4 walks to 8 then wraps to 1; lane-up from 1 wraps to 8', () => {
    const sim = createBattle(humans());
    const seen: number[] = [];
    for (let i = 0; i < LANE_COUNT; i++) {
      sim.command('right', 'lane-down');
      seen.push(sim.snapshot().spawners.right.lane);
    }
    expect(seen).toEqual([5, 6, 7, 8, 1, 2, 3, 4]);
    for (let i = 0; i < 3; i++) sim.command('right', 'lane-up');
    expect(sim.snapshot().spawners.right.lane).toBe(1);
    sim.command('right', 'lane-up');
    expect(sim.snapshot().spawners.right.lane).toBe(LANE_COUNT);
  });

  it('a released unit enters the lane the arrow indicates', () => {
    const sim = createBattle(humans());
    sim.command('left', 'lane-up');
    sim.command('left', 'lane-up');
    ticks(sim, SPEARMAN_RECHARGE);
    sim.command('left', 'release');
    expect(sim.snapshot().units[0]?.lane).toBe(2);
  });
});

describe('scoring and the territory bar (rules §5)', () => {
  it('an unopposed unit crosses the field, scores one point, and the bar target moves 14 px per point', () => {
    const sim = createBattle(humans());
    ticks(sim, SPEARMAN_RECHARGE);
    sim.command('left', 'release');
    let crossed = false;
    for (let i = 0; i < 1200 && !crossed; i++) {
      sim.tick();
      if (sim.snapshot().leftScore === 1) crossed = true;
    }
    expect(crossed).toBe(true);
    const s = sim.snapshot();
    expect(s.units).toHaveLength(0);
    expect(s.barTarget).toBe(BAR_CENTRE + BAR_PIXELS_PER_POINT);
  });

  it('the bar target always equals centre + 14 × (left − right) and the drawn width follows it 1 px per frame', () => {
    const sim = createBattle(humans({ seed: 7 }));
    let previous = sim.snapshot().barWidth;
    let moved = false;
    for (let i = 0; i < 3000; i++) {
      sim.tick();
      if (sim.snapshot().spawners.left.canRelease) sim.command('left', 'release');
      if (sim.snapshot().spawners.right.canRelease && i % 3 === 0) sim.command('right', 'release');
      const s = sim.snapshot();
      if (s.winner) break; // the width snaps to the end on the deciding tick
      expect(s.barTarget).toBe(BAR_CENTRE + BAR_PIXELS_PER_POINT * (s.leftScore - s.rightScore));
      const delta = s.barWidth - previous;
      expect(Math.abs(delta)).toBeLessThanOrEqual(1);
      if (delta !== 0) {
        moved = true;
        expect(Math.sign(delta)).toBe(Math.sign(s.barTarget - previous));
      }
      previous = s.barWidth;
    }
    expect(moved).toBe(true);
  });

  it('a 25-point lead fills the bar and wins on that same tick, after which no tick is processed (work order AC 6)', () => {
    const sim = createBattle(humans());
    let decidingTick: number | null = null;
    for (let i = 0; i < BATTLE_LENGTH_FRAMES && decidingTick === null; i++) {
      sim.tick();
      const s = sim.snapshot();
      const lead = s.leftScore - s.rightScore;
      if (lead >= POINTS_TO_WIN) {
        decidingTick = s.tick;
        // Decided on this very tick, not a frame later.
        expect(s.winner).toBe('left');
        expect(s.winnerTick).toBe(s.tick);
      } else {
        expect(s.winner).toBeNull();
      }
      if (s.spawners.left.canRelease) sim.command('left', 'release');
    }
    expect(decidingTick).not.toBeNull();
    const s = sim.snapshot();
    expect(s.winReason).toBe('bar');
    expect(s.barWidth).toBe(BAR_WIDTH);
    expect(s.leftScore - s.rightScore).toBe(POINTS_TO_WIN);
    expect(s.framesLeft).toBeGreaterThan(0);
    // The clock stops: further ticks change nothing.
    ticks(sim, 100);
    expect(sim.snapshot()).toEqual(s);
    expect(sim.snapshot().tick).toBe(decidingTick);
  });

  it('the right side wins the same way when its lead reaches 25, with the bar snapped empty', () => {
    const sim = createBattle(humans());
    while (sim.snapshot().winner === null && sim.snapshot().tick < BATTLE_LENGTH_FRAMES) {
      sim.tick();
      if (sim.snapshot().spawners.right.canRelease) sim.command('right', 'release');
    }
    const s = sim.snapshot();
    expect(s).toMatchObject({ winner: 'right', winReason: 'bar', barWidth: 0 });
    expect(s.rightScore - s.leftScore).toBe(POINTS_TO_WIN);
    expect(s.winnerTick).toBe(s.tick);
  });
});

describe('the five-minute timer (rules §5.3)', () => {
  it('counts down from 7200 frames and ends the battle on the tick it reaches zero with the higher score winning', () => {
    const sim = createBattle(humans());
    ticks(sim, SPEARMAN_RECHARGE);
    sim.command('right', 'release');
    let endTick: number | null = null;
    for (let i = 0; i < BATTLE_LENGTH_FRAMES + 10; i++) {
      sim.tick();
      const s = sim.snapshot();
      if (s.winner && endTick === null) endTick = s.tick;
      expect(s.framesLeft).toBe(Math.max(0, BATTLE_LENGTH_FRAMES - s.tick));
    }
    const s = sim.snapshot();
    expect(endTick).toBe(BATTLE_LENGTH_FRAMES);
    expect(s.winnerTick).toBe(BATTLE_LENGTH_FRAMES);
    expect(s.winner).toBe('right');
    expect(s.winReason).toBe('time');
    expect(s.rightScore).toBe(1);
    expect(s.leftScore).toBe(0);
  });

  it('a tie at zero plays on until the scores differ', () => {
    const sim = createBattle(humans({ lengthFrames: 100 }));
    ticks(sim, 150);
    expect(sim.snapshot().winner).toBeNull();
    expect(sim.snapshot().framesLeft).toBe(0);
    expect(sim.snapshot().spawners.left.canRelease).toBe(true);
    sim.command('left', 'release');
    ticks(sim, 1200);
    expect(sim.snapshot().winner).toBe('left');
  });

  it('a full-length battle with neither bar limit reached ends at tick 7200 for the higher score; equal scores play on into sudden death (work order AC 7)', () => {
    // One crossing each, early, then nothing: a tie at the bell.
    const sim = createBattle(humans());
    ticks(sim, SPEARMAN_RECHARGE);
    sim.command('left', 'release');
    sim.command('right', 'lane-up');
    sim.command('right', 'release');
    ticks(sim, BATTLE_LENGTH_FRAMES - SPEARMAN_RECHARGE);
    let s = sim.snapshot();
    expect(s.tick).toBe(BATTLE_LENGTH_FRAMES);
    expect([s.leftScore, s.rightScore]).toEqual([1, 1]);
    expect(s.framesLeft).toBe(0);
    expect(s.winner).toBeNull();
    // Sudden death: the clock stays at zero, the battle runs on, and the next crossing decides it.
    ticks(sim, 10);
    s = sim.snapshot();
    expect(s.tick).toBe(BATTLE_LENGTH_FRAMES + 10);
    expect(s.framesLeft).toBe(0);
    expect(s.winner).toBeNull();
    sim.command('right', 'release');
    ticks(sim, 1200);
    s = sim.snapshot();
    expect(s).toMatchObject({ winner: 'right', winReason: 'time', leftScore: 1, rightScore: 2 });
    expect(s.winnerTick).toBeLessThan(BATTLE_LENGTH_FRAMES + 1200);
  });

  it('no unit spawns once a winner is decided', () => {
    const sim = createBattle(humans({ lengthFrames: 60 }));
    ticks(sim, SPEARMAN_RECHARGE);
    sim.command('left', 'release');
    ticks(sim, 1200);
    expect(sim.snapshot().winner).toBe('left');
    ticks(sim, SPEARMAN_RECHARGE);
    expect(sim.snapshot().spawners.left.canRelease).toBe(false);
    expect(sim.command('left', 'release')).toBe(false);
    expect(sim.command('right', 'release')).toBe(false);
  });

  it('surrender hands the win to the other side at once', () => {
    const sim = createBattle(humans());
    sim.tick();
    sim.surrender('left');
    expect(sim.snapshot()).toMatchObject({ winner: 'right', winReason: 'surrender', winnerTick: 1 });
  });
});

describe('kills, bounties and the charge (rules §4, §8.3)', () => {
  /** Fight until `side` has banked `kills`; left floods lane 4 with the strong second unit, right feeds weak scouts. */
  const bankKills = (sim: BattleSimulation, kills: number, limit = 40000) => {
    sim.command('left', 'next-unit');
    for (let i = 0; i < limit; i++) {
      sim.tick();
      const s = sim.snapshot();
      if (s.spawners.left.kills >= kills) return s.tick;
      if (s.spawners.left.canRelease) sim.command('left', 'release');
      if (s.spawners.right.canRelease) sim.command('right', 'release');
    }
    throw new Error(`left side did not reach ${kills} kills within ${limit} frames`);
  };

  it('kills credit the killer: kills, bounty gold and charge kills rise together', () => {
    const sim = createBattle(
      humans({ right: { race: 'race2', army: [7], control: 'human' }, lengthFrames: 100000, seed: 3 }),
    );
    bankKills(sim, 3);
    const s = sim.snapshot().spawners.left;
    expect(s.kills).toBe(3);
    expect(s.chargeKills).toBe(3);
    expect(s.gold).toBe(3 * Math.ceil(unitStats(7).cost / 50));
  });

  it('the charge arms at twenty kills and releases eight units, one in each lane', () => {
    const sim = createBattle(
      humans({ right: { race: 'race2', army: [7], control: 'human' }, lengthFrames: 100000, seed: 5 }),
    );
    expect(sim.command('left', 'charge')).toBe(false);
    bankKills(sim, KILLS_PER_CHARGE);
    expect(sim.snapshot().spawners.left.chargeKills).toBeGreaterThanOrEqual(KILLS_PER_CHARGE);
    while (!sim.snapshot().spawners.left.canRelease) sim.tick();
    expect(sim.snapshot().spawners.left.chargeReady).toBe(true);
    const before = sim.snapshot().units.filter((u) => u.side === 'left').map((u) => u.id);
    expect(sim.command('left', 'charge')).toBe(true);
    const after = sim.snapshot();
    const fresh = after.units.filter((u) => u.side === 'left' && !before.includes(u.id));
    expect(fresh).toHaveLength(LANE_COUNT);
    expect(fresh.map((u) => u.lane).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(fresh.every((u) => u.unit === 1)).toBe(true);
    expect(after.spawners.left.chargeKills).toBe(0);
    expect(after.spawners.left.charged).toBe(0);
    expect(after.spawners.left.chargeReady).toBe(false);
  });
});

describe('the computer opponent (rules §13)', () => {
  it('releases units on its own and stays within lanes 1–8', () => {
    const sim = createBattle(humans({ right: { race: 'race2', army: [0, 1, 2], control: 'ai' } }));
    ticks(sim, 600);
    const s = sim.snapshot();
    expect(s.units.filter((u) => u.side === 'right').length).toBeGreaterThan(0);
    expect(s.spawners.right.lane).toBeGreaterThanOrEqual(1);
    expect(s.spawners.right.lane).toBeLessThanOrEqual(LANE_COUNT);
  });
});

describe('determinism (work order AC 1)', () => {
  /** A scripted input stream: commands applied to the simulation at given ticks. */
  const script: readonly { tick: number; side: 'left' | 'right'; command: 'lane-up' | 'lane-down' | 'next-unit' | 'release' | 'charge' }[] = [
    { tick: 10, side: 'left', command: 'lane-up' },
    { tick: 20, side: 'right', command: 'lane-down' },
    { tick: 60, side: 'left', command: 'release' },
    { tick: 80, side: 'right', command: 'release' },
    { tick: 140, side: 'left', command: 'next-unit' },
    { tick: 150, side: 'left', command: 'release' },
    { tick: 200, side: 'right', command: 'next-unit' },
    { tick: 240, side: 'right', command: 'release' },
    { tick: 1000, side: 'left', command: 'charge' },
  ];

  const run = (seed: number) => {
    const sim = createBattle({
      left: { race: 'race1', army: [0, 1, 2, 11], control: 'human' },
      right: { race: 'race2', army: [0, 1, 2, 13], control: 'ai' },
      seed,
    });
    const frames: string[] = [];
    for (let t = 1; t <= BATTLE_LENGTH_FRAMES; t++) {
      for (const step of script) if (step.tick === t) sim.command(step.side, step.command);
      // Keep both spawners busy so the field is crowded and every rule gets exercised.
      if (t % 7 === 0 && sim.snapshot().spawners.left.canRelease) sim.command('left', 'release');
      sim.tick();
      frames.push(JSON.stringify(sim.snapshot()));
    }
    return frames;
  };

  it('two runs of 7200 ticks from the same seed and the same scripted inputs produce identical frame snapshots', () => {
    const a = run(42);
    const b = run(42);
    expect(a.length).toBe(BATTLE_LENGTH_FRAMES);
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) throw new Error(`snapshots differ first at tick ${i + 1}`);
    // The battle was eventful, not a trivially equal pair of empty fields.
    const last = JSON.parse(a[a.length - 1]!) as FrameState;
    expect(last.spawners.left.kills + last.spawners.right.kills + last.leftScore + last.rightScore).toBeGreaterThan(0);
  }, 60000);

  it('a different seed produces a different battle, and the seed is reported in every snapshot', () => {
    const a = run(42);
    const c = run(43);
    expect(a).not.toEqual(c);
    expect((JSON.parse(a[0]!) as FrameState).seed).toBe(42);
  }, 60000);

  it('once a winner is decided the clock stops and later ticks leave the snapshot untouched', () => {
    const sim = createBattle(humans());
    sim.tick();
    sim.surrender('left');
    const decided = sim.snapshot();
    ticks(sim, 50);
    expect(sim.snapshot()).toEqual(decided);
    expect(sim.snapshot().tick).toBe(1);
  });
});

describe('unopposed crossing (rules §2; work order AC 2)', () => {
  const SPEARMAN = unitStats(0);
  const distance = FIELD.leftExitX - FIELD.leftSpawnX;
  /** Ticks a Spearman needs at the slowest and fastest spawn jitter: speed 5 … 5.5, scoring once past 2900. */
  const slowest = Math.floor(distance / SPEARMAN.speed) + 1;
  const fastest = Math.ceil(distance / (SPEARMAN.speed + 0.5));

  const crossingTicks = (seed: number) => {
    const sim = createBattle(humans({ seed }));
    ticks(sim, SPEARMAN.recharge);
    sim.command('left', 'release');
    const released = sim.snapshot().tick;
    for (let i = 0; i < 1000; i++) {
      sim.tick();
      if (sim.snapshot().leftScore === 1) return sim.snapshot().tick - released;
    }
    throw new Error('the Spearman never crossed');
  };

  it('a Spearman alone in an empty lane scores in about 570 ticks, within the spawn speed jitter', () => {
    expect(slowest).toBe(571);
    expect(fastest).toBe(519);
    const results = Array.from({ length: 40 }, (_, seed) => crossingTicks(seed + 1));
    for (const t of results) {
      expect(t).toBeLessThanOrEqual(slowest);
      expect(t).toBeGreaterThanOrEqual(fastest);
    }
    // The jitter is real: not every run takes the same time, and the slowest sits at the document's figure.
    expect(new Set(results).size).toBeGreaterThan(5);
    expect(Math.max(...results)).toBeGreaterThanOrEqual(560);
  });

  it('a crossing removes the unit and scores exactly one point whatever the unit type', () => {
    for (const unit of [0, 7, 16] as const) {
      const sim = createBattle(humans({ left: { race: 'race4', army: [unit], control: 'human' }, seed: 2 }));
      ticks(sim, unitStats(unit).recharge);
      sim.command('left', 'release');
      ticks(sim, 1500);
      expect(sim.snapshot().units).toHaveLength(0);
      expect(sim.snapshot().leftScore).toBe(1);
    }
  });
});

describe('bounty and the charge meter in a scripted scenario (rules §4, §8.3; work order AC 8)', () => {
  it('each kill of a 250-gold unit credits exactly 5 gold, and the 20th kill arms the charge', () => {
    expect(unitStats(0).cost).toBe(250);
    // Trolls hold lane 4 against a stream of Spearmen; every Spearman killed is worth ceil(250 / 50) = 5.
    const sim = createBattle({
      left: { race: 'race4', army: [16], control: 'human', upgrades: { armour: 20 } },
      right: { race: 'race2', army: [0], control: 'human' },
      seed: 12,
    });
    let kills = 0;
    let armedOnKill: number | null = null;
    for (let t = 0; t < 6000 && armedOnKill === null; t++) {
      sim.tick();
      const s = sim.snapshot();
      if (s.winner) throw new Error(`battle ended at tick ${s.tick} with ${kills} kills`);
      const killed = s.hits.filter((h) => h.killed).length;
      kills += killed;
      // Gold follows kills exactly, 5 per Spearman, and the charge counter follows kills.
      expect(s.spawners.left.kills).toBe(kills);
      expect(s.spawners.left.gold).toBe(kills * 5);
      expect(s.spawners.left.chargeKills).toBe(kills);
      if (kills < KILLS_PER_CHARGE) expect(s.spawners.left.chargeReady).toBe(false);
      if (killed > 0 && kills >= KILLS_PER_CHARGE && armedOnKill === null) {
        armedOnKill = kills;
        // Armed on the 20th kill: the charge needs only the recharge to be complete.
        expect(s.spawners.left.chargeReady).toBe(s.spawners.left.canRelease);
      }
      if (s.spawners.right.canRelease) sim.command('right', 'release');
      if (s.spawners.left.canRelease && s.spawners.left.chargeKills < KILLS_PER_CHARGE) sim.command('left', 'release');
    }
    expect(armedOnKill).toBe(KILLS_PER_CHARGE);
    expect(sim.snapshot().spawners.left.gold).toBe(100);
    while (!sim.snapshot().spawners.left.canRelease) sim.tick();
    expect(sim.snapshot().spawners.left.chargeReady).toBe(true);
    expect(sim.command('left', 'charge')).toBe(true);
    const after = sim.snapshot();
    expect(after.spawners.left.chargeKills).toBe(0);
    expect(after.units.filter((u) => u.side === 'left' && u.x === FIELD.leftSpawnX).map((u) => u.lane).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
