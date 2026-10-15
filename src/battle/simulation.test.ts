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
  type BattleConfig,
  type BattleSimulation,
} from './types';

/** mulberry32: a small seeded generator so battles replay exactly. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const humans = (overrides: Partial<BattleConfig> = {}): BattleConfig => ({
  left: { race: 'race1', army: [0, 1, 2], control: 'human' },
  right: { race: 'race2', army: [0, 1, 2], control: 'human' },
  rng: seeded(1),
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
    const sim = createBattle(humans({ rng: seeded(7) }));
    let previous = sim.snapshot().barWidth;
    let moved = false;
    for (let i = 0; i < 3000; i++) {
      sim.tick();
      if (sim.snapshot().spawners.left.canRelease) sim.command('left', 'release');
      if (sim.snapshot().spawners.right.canRelease && i % 3 === 0) sim.command('right', 'release');
      const s = sim.snapshot();
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

  it('a 25-point lead fills the bar and wins instantly', () => {
    const sim = createBattle(humans());
    let frames = 0;
    while (sim.snapshot().winner === null && frames < BATTLE_LENGTH_FRAMES) {
      sim.tick();
      frames++;
      if (sim.snapshot().spawners.left.canRelease) sim.command('left', 'release');
    }
    const s = sim.snapshot();
    expect(s.winner).toBe('left');
    expect(s.winReason).toBe('bar');
    expect(s.barWidth).toBe(BAR_WIDTH);
    expect(s.leftScore - s.rightScore).toBeGreaterThanOrEqual(25);
    expect(s.framesLeft).toBeGreaterThan(0);
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
      humans({ right: { race: 'race2', army: [7], control: 'human' }, lengthFrames: 100000, rng: seeded(3) }),
    );
    bankKills(sim, 3);
    const s = sim.snapshot().spawners.left;
    expect(s.kills).toBe(3);
    expect(s.chargeKills).toBe(3);
    expect(s.gold).toBe(3 * Math.ceil(unitStats(7).cost / 50));
  });

  it('the charge arms at twenty kills and releases eight units, one in each lane', () => {
    const sim = createBattle(
      humans({ right: { race: 'race2', army: [7], control: 'human' }, lengthFrames: 100000, rng: seeded(5) }),
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
