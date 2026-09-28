import { describe, expect, it } from 'vitest';
import { INSTRUCTIONS, type InstructionTopic } from './copy';

const REQUIRED: InstructionTopic[] = ['lanes', 'spawning', 'recharge', 'territory', 'charge', 'winning'];

describe('instructions copy', () => {
  it('covers lanes, spawning, recharge, the territory bar, the charge meter and the win conditions', () => {
    const topics = INSTRUCTIONS.map((s) => s.topic);
    for (const t of REQUIRED) expect(topics).toContain(t);
    for (const s of INSTRUCTIONS) expect(s.body.length, s.topic).toBeGreaterThan(80);
  });
});
