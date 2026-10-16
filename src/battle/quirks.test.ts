import { describe, expect, it } from 'vitest';
import { UNIT_IDS, unitStats } from '../roster';
import { QUIRKS, quirk } from './quirks';
import { BODY_FRAMES, FADE_PER_FRAME, POINTS_TO_WIN } from './types';

describe('every quirk of the rules document (§16) is decided', () => {
  it('catalogues all nineteen, each once, with a decision, a rationale and a place', () => {
    expect(QUIRKS).toHaveLength(19);
    expect(QUIRKS.map((q) => q.id)).toEqual(Array.from({ length: 19 }, (_, i) => i + 1));
    for (const q of QUIRKS) {
      expect(['preserve', 'fix', 'not-applicable']).toContain(q.decision);
      expect(q.summary.trim().length).toBeGreaterThan(20);
      expect(q.rationale.trim().length).toBeGreaterThan(20);
      expect(q.where.trim().length).toBeGreaterThan(5);
      expect(q.section).toMatch(/^§16\.\d+/);
    }
    expect(() => quirk(20)).toThrow();
  });

  it('the decisions the work order dictates are recorded as fixes', () => {
    expect(quirk(1).decision).toBe('fix'); // the Spearman shield bash
    expect(quirk(19).decision).toBe('fix'); // the bar decides on the same tick
    expect(quirk(11).decision).toBe('preserve'); // the body fade is the specified behaviour
  });
});

describe('the data-backed decisions hold in the roster and the constants', () => {
  it('quirk 1: the Spearman has four melee swipes, the fourth outside Spear Training', () => {
    const s = unitStats(0);
    expect(s.attacks).toHaveLength(4);
    expect(s.attacks[3]).toMatchObject({ kind: 'melee', upgraded: false });
  });

  it('quirk 2: Swordsman swipe 3 does not scale, the other three do', () => {
    const swipes = unitStats(1).attacks;
    expect(swipes.map((a) => a.kind === 'melee' && a.upgraded)).toEqual([true, true, false, true]);
    expect(swipes[2]!.power).toEqual([30]);
  });

  it('quirk 3: Longswordsman swipe 2, Spearmaster, Scout, Giant Troll and Flailer take no weapon bonus', () => {
    expect(unitStats(8).attacks.map((a) => a.kind === 'melee' && a.upgraded)).toEqual([true, false]);
    for (const id of [14, 7, 16, 17] as const) {
      expect(unitStats(id).upgradeTrack).toBeNull();
      for (const a of unitStats(id).attacks) expect(a.kind === 'melee' && a.upgraded).toBe(false);
    }
  });

  it('quirk 4: the Whirler scales with Halberd', () => {
    expect(unitStats(10).upgradeTrack).toBe('halberd');
  });

  it('quirk 5: Spearmaster, Mage, Axe Thrower and Javelin Thrower walk at a fixed 5; Spearmaster swipe 2 backs up', () => {
    for (const id of [14, 3, 11, 13] as const) expect(unitStats(id).walk.fixedSpeed).toBe(5);
    for (const id of UNIT_IDS) if (![14, 3, 11, 13].includes(id)) expect(unitStats(id).walk.fixedSpeed).toBeNull();
    expect(unitStats(14).attacks[1]).toMatchObject({ movement: 'back-6' });
  });

  it('quirk 6: only the Archer walks off its shot, for 40 frames', () => {
    for (const id of UNIT_IDS) {
      for (const a of unitStats(id).attacks) {
        if (a.kind !== 'projectile') continue;
        expect(a.walkAfter).toBe(id === 2 ? 40 : 0);
      }
    }
  });

  it('quirk 11: bodies lie 500 frames and fade 1 % per frame', () => {
    expect(BODY_FRAMES).toBe(500);
    expect(FADE_PER_FRAME).toBe(0.01);
  });

  it('quirk 12: the shop figures are carried but differ from the strike powers for the units the document names', () => {
    expect(unitStats(0).shownMaxDamage).toBe(20);
    expect(unitStats(0).attacks.map((a) => a.power[0])).toContain(10);
    expect(unitStats(16).shownMaxDamage).toBe(500);
    expect(unitStats(16).attacks.map((a) => a.power[0])).toEqual([250, 500]);
  });

  it('quirk 19: the deciding lead is 25 crossings', () => {
    expect(POINTS_TO_WIN).toBe(25);
  });
});
