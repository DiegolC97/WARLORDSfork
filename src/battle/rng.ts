/**
 * The simulation's random source. Every roll a battle makes — the spawn
 * speed jitter, the attack-or-walk decision, the swipe pick, the damage
 * roll, projectile drift and the computer opponent's dice — comes from one
 * seeded generator, so two battles started from the same seed and fed the
 * same commands on the same ticks are identical frame for frame.
 *
 * mulberry32: a 32-bit generator, small enough to read, with a period long
 * past any battle. `rand()` is a uniform float in [0, 1), the document's
 * `rand()`; `random(n)` is a uniform integer 0…n−1, the document's
 * `random(n)` (the damage roll is `random(power)`).
 */
export interface Rng {
  /** Uniform float in [0, 1). */
  rand(): number;
  /** Uniform integer in 0…n−1; 0 for n ≤ 1. */
  random(n: number): number;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const rand = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    rand,
    random: (n) => (n <= 1 ? 0 : Math.min(n - 1, Math.floor(rand() * n))),
  };
}

/** A seed for a battle nobody asked to replay: 32 bits from `Math.random`. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}
