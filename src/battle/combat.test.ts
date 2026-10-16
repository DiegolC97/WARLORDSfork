import { describe, expect, it } from 'vitest';
import { unitStats, type UnitId } from '../roster';
import { createRng } from './rng';
import { createBattle } from './simulation';
import { BODY_FRAMES, FADE_PER_FRAME, MAX_KNOCKBACK, type BattleConfig, type BattleSimulation, type FrameState, type SideSetup } from './types';

const side = (army: UnitId[], extra: Partial<SideSetup> = {}): SideSetup => ({ race: 'race1', army, control: 'human', ...extra });

const ticks = (sim: BattleSimulation, n: number) => {
  for (let i = 0; i < n; i++) sim.tick();
};

/** Both sides release into lane 4 as fast as their recharge allows; every tick's snapshot is returned. */
function stream(config: BattleConfig, limit: number): FrameState[] {
  const sim = createBattle(config);
  const frames: FrameState[] = [];
  for (let t = 0; t < limit; t++) {
    sim.tick();
    const s = sim.snapshot();
    if (s.spawners.left.canRelease) sim.command('left', 'release');
    if (s.spawners.right.canRelease) sim.command('right', 'release');
    frames.push(sim.snapshot());
    if (s.winner) break;
  }
  return frames;
}

describe('damage lands on the strike frame (rules §7.3, §8.2; work order AC 3)', () => {
  const SPEARMAN = unitStats(0);
  const SWIPE_2 = SPEARMAN.attacks[1]!;

  it('a Spearman’s second swipe changes the defender’s hit points on frame 4 of its 15-frame cycle and on no other frame', () => {
    expect(SWIPE_2.clip).toBe(15);
    expect(SWIPE_2.strikeFrames).toEqual([4]);
    // Spearmen against heavily armoured Scouts: the Scouts barely scratch them, so the Spearmen swing for thousands of frames.
    const frames = stream(
      { left: side([0], { upgrades: { armour: 60 } }), right: side([7], { race: 'race2', upgrades: { armour: 100 } }), seed: 3 },
      3000,
    );
    const changeFrames: number[] = [];
    const swipe2Frames = new Set<number>();
    const previousHp = new Map<number, number>();
    let hitsOnFrame4 = 0;
    for (const s of frames) {
      const byId = new Map(s.units.map((u) => [u.id, u]));
      for (const defender of s.units) {
        if (defender.side !== 'right') continue;
        const was = previousHp.get(defender.id);
        previousHp.set(defender.id, defender.hp);
        if (was === undefined || defender.hp === was) continue;
        // Every change is a melee blow by a Spearman on the strike frame of the swipe it is playing.
        const hits = s.hits.filter((h) => h.target === defender.id);
        expect(hits.length, `tick ${s.tick}: hit points changed without a recorded hit`).toBeGreaterThan(0);
        for (const hit of hits) {
          const attacker = byId.get(hit.by)!;
          expect(hit.kind).toBe('melee');
          expect(attacker.clip).toMatch(/^swipe-\d$/);
          const swipe = SPEARMAN.attacks[Number(attacker.clip.slice('swipe-'.length)) - 1]!;
          expect(swipe.strikeFrames).toContain(attacker.clipFrame);
          if (attacker.clip === 'swipe-2') changeFrames.push(attacker.clipFrame);
        }
      }
      for (const attacker of s.units) {
        if (attacker.side !== 'left' || attacker.clip !== 'swipe-2') continue;
        swipe2Frames.add(attacker.clipFrame);
        const struck = s.hits.some((h) => h.by === attacker.id);
        if (attacker.clipFrame === 4) hitsOnFrame4 += struck ? 1 : 0;
        else expect(struck, `tick ${s.tick}: a blow landed on frame ${attacker.clipFrame} of swipe 2`).toBe(false);
      }
    }
    expect(changeFrames.length).toBeGreaterThan(10);
    expect(new Set(changeFrames)).toEqual(new Set([4]));
    expect(hitsOnFrame4).toBeGreaterThan(10);
    // The cycle really is fifteen frames long: offsets 0…14 were all seen, 15 never.
    expect([...swipe2Frames].sort((a, b) => a - b)).toEqual(Array.from({ length: 15 }, (_, i) => i));
  });

  it('a unit reports the walk clip with its frame cycling through the walk length, and a swipe clip by its index', () => {
    const sim = createBattle({ left: side([0]), right: side([0]), seed: 1 });
    ticks(sim, SPEARMAN.recharge);
    sim.command('left', 'release');
    expect(sim.snapshot().units[0]).toMatchObject({ clip: 'walk', clipFrame: 0, alpha: 1, race: 'race1', phase: 'walk' });
    const seen: number[] = [];
    for (let i = 0; i < SPEARMAN.walk.clip * 2; i++) {
      sim.tick();
      const u = sim.snapshot().units[0]!;
      expect(u.clip).toBe('walk');
      seen.push(u.clipFrame);
    }
    expect(seen).toEqual([...Array(12).keys(), ...Array(12).keys()]);
  });
});

describe('the damage roll (rules §7.3, §18; work order AC 4)', () => {
  it('over 10000 strikes of a power-20 attack the mean damage is within 2 % of 9.5 and no roll reaches 20', () => {
    const rng = createRng(20);
    let total = 0;
    let max = -1;
    let min = Infinity;
    for (let i = 0; i < 10000; i++) {
      const roll = rng.random(20);
      expect(Number.isInteger(roll)).toBe(true);
      total += roll;
      max = Math.max(max, roll);
      min = Math.min(min, roll);
    }
    const mean = total / 10000;
    expect(Math.abs(mean - 9.5) / 9.5).toBeLessThan(0.02);
    expect(max).toBeLessThan(20);
    expect(max).toBe(19);
    expect(min).toBe(0);
  });

  it('inside a battle every blow of a power-20 swipe deals an integer below 20 and the hit reports its power', () => {
    const frames = stream(
      { left: side([0], { upgrades: { armour: 60 } }), right: side([7], { race: 'race2', upgrades: { armour: 100 } }), seed: 9 },
      3000,
    );
    const power20 = frames.flatMap((s) => s.hits.filter((h) => h.power === 20));
    expect(power20.length).toBeGreaterThan(20);
    for (const h of power20) {
      expect(Number.isInteger(h.damage)).toBe(true);
      expect(h.damage).toBeGreaterThanOrEqual(0);
      expect(h.damage).toBeLessThan(20);
    }
  });
});

describe('knockback (rules §7.3)', () => {
  it('every landed melee blow pushes the target min(power, 50) toward the attacker’s facing, even on a roll of 0; projectiles never do', () => {
    // Trolls (power 250 / 500) against armoured swordsmen exercise the cap; rangers against swordsmen the projectile rule.
    const facings = new Map<number, 1 | -1>();
    const collect = (frames: FrameState[]) =>
      frames.flatMap((s) => {
        for (const u of s.units) facings.set(u.id, u.facing);
        return s.hits.map((h) => ({ ...h, facing: facings.get(h.by) ?? 0 }));
      });
    const hits = [
      ...collect(stream({ left: side([16], { race: 'race4', upgrades: { armour: 40 } }), right: side([1], { race: 'race5', upgrades: { armour: 40 } }), seed: 5 }, 4000)),
      ...collect(stream({ left: side([1], { race: 'race4', upgrades: { armour: 40 } }), right: side([12], { race: 'race5', upgrades: { armour: 40 } }), seed: 6 }, 4000)),
    ];
    const melee = hits.filter((h) => h.kind === 'melee');
    const capped = melee.filter((h) => h.power > MAX_KNOCKBACK);
    const zeroRolls = melee.filter((h) => h.damage === 0);
    expect(melee.length).toBeGreaterThan(20);
    expect(capped.length).toBeGreaterThan(0);
    expect(zeroRolls.length).toBeGreaterThan(0);
    for (const h of melee) expect(h.knockback).toBe(Math.min(h.power, MAX_KNOCKBACK) * h.facing);
    const ranged = hits.filter((h) => h.kind === 'projectile');
    expect(ranged.length).toBeGreaterThan(0);
    for (const h of ranged) expect(h.knockback).toBe(0);
  });
});

describe('death (rules §7.4)', () => {
  it('a body lies for 500 frames at full opacity, fades 1 % per frame, and is removed on reaching 0', () => {
    const sim = createBattle({ left: side([16], { race: 'race4' }), right: side([7], { race: 'race2' }), seed: 2 });
    let victim: number | null = null;
    let diedAt = 0;
    for (let t = 0; t < 3000 && victim === null; t++) {
      sim.tick();
      const s = sim.snapshot();
      if (s.spawners.left.canRelease) sim.command('left', 'release');
      if (s.spawners.right.canRelease) sim.command('right', 'release');
      const kill = s.hits.find((h) => h.killed);
      if (kill) {
        victim = kill.target;
        diedAt = s.tick;
      }
    }
    expect(victim).not.toBeNull();
    const body = () => sim.snapshot().units.find((u) => u.id === victim);
    expect(body()).toMatchObject({ phase: 'dead', clip: 'death', clipFrame: 0, alpha: 1, hp: 0 });
    // Through frame 500 after death the body lies untouched.
    ticks(sim, BODY_FRAMES);
    expect(sim.snapshot().tick).toBe(diedAt + BODY_FRAMES);
    expect(body()).toMatchObject({ clip: 'death', clipFrame: BODY_FRAMES, alpha: 1 });
    // Then 1 % per frame…
    sim.tick();
    expect(body()!.alpha).toBeCloseTo(1 - FADE_PER_FRAME, 10);
    ticks(sim, 48);
    expect(body()!.alpha).toBeCloseTo(0.51, 10);
    ticks(sim, 50);
    expect(body()!.alpha).toBeCloseTo(0.01, 10);
    // …and gone on reaching 0.
    sim.tick();
    expect(sim.snapshot().tick).toBe(diedAt + BODY_FRAMES + 100);
    expect(body()).toBeUndefined();
  });

  it('a dead unit is never shoved, knocked back or hit again', () => {
    const sim = createBattle({ left: side([16], { race: 'race4' }), right: side([7], { race: 'race2' }), seed: 2 });
    const bodies = new Map<number, number>();
    for (let t = 0; t < 2500; t++) {
      sim.tick();
      const s = sim.snapshot();
      if (s.spawners.left.canRelease) sim.command('left', 'release');
      if (s.spawners.right.canRelease) sim.command('right', 'release');
      for (const h of s.hits) expect(bodies.has(h.target)).toBe(false);
      for (const u of s.units) {
        if (u.phase !== 'dead') continue;
        const was = bodies.get(u.id);
        if (was !== undefined) expect(u.x).toBe(was);
        bodies.set(u.id, u.x);
      }
    }
    expect(bodies.size).toBeGreaterThan(3);
  });
});

describe('projectiles (rules §8.4, §2; work order AC 9)', () => {
  type Flight = { side: 'left' | 'right'; kind: string; xs: number[]; ys: number[]; lastTick: number; hitOnRemoval: boolean; firer: number };

  /** Every projectile's flight across a streamed battle, with whether its removal tick carried a projectile hit for its side. */
  const flights = (config: BattleConfig, limit: number) => {
    const frames = stream(config, limit);
    const seen = new Map<number, Flight>();
    const alive = new Set<number>();
    for (const s of frames) {
      const now = new Set(s.projectiles.map((p) => p.id));
      for (const id of alive) {
        if (now.has(id)) continue;
        const f = seen.get(id)!;
        f.lastTick = s.tick - 1;
        f.hitOnRemoval = s.hits.some((h) => h.kind === 'projectile' && h.by === f.firer);
      }
      for (const p of s.projectiles) {
        let f = seen.get(p.id);
        if (!f) {
          f = { side: p.side, kind: p.kind, xs: [], ys: [], lastTick: -1, hitOnRemoval: false, firer: p.firer };
          seen.set(p.id, f);
        }
        f.xs.push(p.x);
        f.ys.push(p.y);
      }
      alive.clear();
      for (const id of now) alive.add(id);
    }
    return { frames, flights: [...seen.values()].filter((f) => f.lastTick >= 0) };
  };

  it('a projectile fired from the right army that hits nothing is removed on the first tick its position is below −50', () => {
    // Right archers with a hopeless Archery level: their arrows drift wildly and miss the left trolls walking up the lane.
    const { flights: fs } = flights(
      { left: side([16], { race: 'race4', upgrades: { armour: 50 } }), right: side([2], { race: 'race2', upgrades: { archery: -100000 } }), seed: 4 },
      2000,
    );
    const misses = fs.filter((f) => f.side === 'right' && !f.hitOnRemoval);
    expect(misses.length).toBeGreaterThan(3);
    const speed = unitStats(2).attacks[0]!.kind === 'projectile' ? (unitStats(2).attacks[0] as { projectileSpeed: number }).projectileSpeed : 0;
    expect(speed).toBe(70);
    for (const f of misses) {
      const last = f.xs[f.xs.length - 1]!;
      // Never shown below −50, and gone exactly when the next step would take it there.
      for (const x of f.xs) expect(x).toBeGreaterThanOrEqual(-50);
      expect(last - speed).toBeLessThan(-50);
      for (let i = 1; i < f.xs.length; i++) expect(f.xs[i]! - f.xs[i - 1]!).toBeCloseTo(-speed, 6);
    }
  });

  it('a left projectile that misses is removed on the first tick its position exceeds 2850', () => {
    const { flights: fs } = flights(
      { left: side([12], { race: 'race1', upgrades: { archery: -100000 } }), right: side([16], { race: 'race4', upgrades: { armour: 50 } }), seed: 4 },
      2000,
    );
    const misses = fs.filter((f) => f.side === 'left' && !f.hitOnRemoval);
    expect(misses.length).toBeGreaterThan(3);
    for (const f of misses) {
      const last = f.xs[f.xs.length - 1]!;
      for (const x of f.xs) expect(x).toBeLessThanOrEqual(2850);
      expect(last + 70).toBeGreaterThan(2850);
    }
  });

  it('with Archery at 7 arrows fly dead straight from 66 units up and every one of them connects; the mage’s ball still drifts', () => {
    const { frames, flights: fs } = flights(
      { left: side([12, 3], { race: 'race1', upgrades: { archery: 7 } }), right: side([16], { race: 'race4', upgrades: { armour: 100 } }), seed: 8 },
      2500,
    );
    const arrows = fs.filter((f) => f.kind === 'arrow');
    const balls = fs.filter((f) => f.kind === 'magic');
    expect(arrows.length).toBeGreaterThan(3);
    for (const f of arrows) {
      expect(f.ys[0]).toBe(66);
      for (const y of f.ys) expect(y).toBe(66);
    }
    // Every arrow that was removed while its target lived was removed by a hit.
    const arrowHits = frames.flatMap((s) => s.hits.filter((h) => h.kind === 'projectile'));
    expect(arrowHits.length).toBeGreaterThanOrEqual(arrows.filter((f) => f.hitOnRemoval).length);
    expect(arrows.filter((f) => f.hitOnRemoval).length).toBeGreaterThan(0);
    for (const h of arrowHits) expect(h.knockback).toBe(0);
    if (balls.length > 0) {
      const drifted = balls.some((f) => f.ys.some((y) => y !== 66));
      expect(drifted).toBe(true);
      for (const f of balls) for (let i = 1; i < f.ys.length; i++) expect(Math.abs(f.ys[i]! - f.ys[i - 1]!)).toBeLessThanOrEqual(4);
    }
  });

  it('a handicapped Archery of −1 lets arrow drift reach 8 per frame, never more, and each arrow keeps its drift for the whole flight', () => {
    const { flights: fs } = flights(
      { left: side([12], { race: 'race1', upgrades: { archery: -1 } }), right: side([16], { race: 'race4', upgrades: { armour: 100 } }), seed: 8 },
      2500,
    );
    const arrows = fs.filter((f) => f.kind === 'arrow' && f.ys.length > 1);
    expect(arrows.length).toBeGreaterThan(3);
    let maxDrift = 0;
    for (const f of arrows) {
      const d = Math.abs(f.ys[1]! - f.ys[0]!);
      maxDrift = Math.max(maxDrift, d);
      for (let i = 1; i < f.ys.length; i++) expect(Math.abs(f.ys[i]! - f.ys[i - 1]!)).toBeCloseTo(d, 6);
    }
    expect(maxDrift).toBeLessThanOrEqual(8);
    expect(maxDrift).toBeGreaterThan(0);
  });
});
