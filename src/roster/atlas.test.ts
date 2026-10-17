import { describe, expect, it } from 'vitest';
import {
  DEATH_FRAMES,
  READY_FRAMES,
  ROSTER,
  accentKey,
  contractProblems,
  frameKey,
  omittedClips,
  portraitKey,
  requiredClips,
  resolveFrame,
  warpFrame,
  type AtlasDocument,
  type AtlasFrame,
} from './index';

const SPEARMAN = 0;
const sprite = ROSTER.units[SPEARMAN].sprite;
const rect = (): AtlasFrame => ({ rect: [0, 0, 8, 8], pivot: [0.5, 1], border: [0, 0, 0, 0] });

/** A complete sprite set for the Spearman, optionally without some clips. */
function spriteSet(omit: string[] = []): AtlasDocument {
  const frames: Record<string, AtlasFrame> = {};
  for (const clip of requiredClips(SPEARMAN)) {
    if (omit.includes(clip.name)) continue;
    for (let n = 0; n < clip.frames; n++) {
      frames[frameKey(sprite, clip.name, n)] = rect();
      frames[accentKey(sprite, clip.name, n)] = rect();
    }
  }
  frames[portraitKey(sprite)] = rect();
  return { texture: 'x.png', meta: { scale: 4, size: [1024, 1024] }, frames };
}

describe('atlas contract', () => {
  it('derives the Spearman clip set from the roster: ready 2, walk 12, three 15-frame swipes striking on 4, death 8', () => {
    const clips = requiredClips(SPEARMAN);
    expect(clips.map((c) => [c.name, c.frames, c.strike])).toEqual([
      ['ready', READY_FRAMES, null],
      ['walk', 12, null],
      ['swipe-1', 15, 4],
      ['swipe-2', 15, 4],
      ['swipe-3', 15, 4],
      ['swipe-4', 18, 7],
      ['death', DEATH_FRAMES, null],
    ]);
    expect(clips.filter((c) => !c.required).map((c) => c.name)).toEqual(['swipe-2', 'swipe-3', 'swipe-4']);
  });

  it('a complete set has no problem; a set without the fourth swipe is an omission, not a problem', () => {
    expect(contractProblems(spriteSet(), SPEARMAN)).toEqual([]);
    const three = spriteSet(['swipe-4']);
    expect(contractProblems(three, SPEARMAN)).toEqual([]);
    expect(omittedClips(three, SPEARMAN)).toEqual(['swipe-4']);
  });

  it('names a missing frame, a wrong clip length, a missing accent, a missing portrait and a rect outside the texture', () => {
    const doc = spriteSet(['swipe-4']);
    const frames = { ...doc.frames };
    delete frames[frameKey(sprite, 'swipe-2', 4)];
    delete frames[frameKey(sprite, 'walk', 11)];
    delete frames[accentKey(sprite, 'death', 3)];
    delete frames[portraitKey(sprite)];
    frames[frameKey(sprite, 'ready', 1)] = { rect: [1000, 1000, 48, 48], pivot: [0.5, 1] };
    frames[frameKey(sprite, 'death', 8)] = rect();
    const messages = contractProblems({ ...doc, frames }, SPEARMAN).map((p) => p.message);
    expect(messages).toContainEqual(expect.stringMatching(/"spearman\/swipe-2" has 4 frames; the roster says 15/));
    expect(messages).toContainEqual(expect.stringMatching(/"spearman\/swipe-2" has no frame 4, the strike frame/));
    expect(messages).toContainEqual(expect.stringMatching(/"spearman\/walk" has 11 frames; the roster says 12/));
    expect(messages).toContainEqual(expect.stringMatching(/no accent frame "spearman\/accent\/death\/3"/));
    expect(messages).toContainEqual(expect.stringMatching(/no portrait frame/));
    expect(messages).toContainEqual(expect.stringMatching(/"spearman\/ready\/1" rect \[1000, 1000, 48, 48\] is not inside the 1024×1024 texture/));
    expect(messages).toContainEqual(expect.stringMatching(/"spearman\/death" has 9 frames; the roster says 8/));
  });

  it('a set missing walk, death or the first swipe is a problem', () => {
    for (const clip of ['walk', 'death', 'swipe-1']) {
      const messages = contractProblems(spriteSet([clip]), SPEARMAN).map((p) => p.message);
      expect(messages).toContainEqual(expect.stringMatching(new RegExp(`lacks clip "${clip}"`)));
    }
  });

  it('resolves clip and frame to the key, clamps past the end, and stands in for an omitted swipe with the strike pinned', () => {
    const doc = spriteSet(['swipe-4']);
    expect(resolveFrame(doc, SPEARMAN, 'walk', 5)).toMatchObject({ key: 'spearman/walk/5', accent: 'spearman/accent/walk/5', fallback: false });
    expect(resolveFrame(doc, SPEARMAN, 'swipe-3', 4)).toMatchObject({ key: 'spearman/swipe-3/4', fallback: false });
    // A body counts its age in clipFrame; it keeps the last death frame.
    expect(resolveFrame(doc, SPEARMAN, 'death', 300)).toMatchObject({ key: 'spearman/death/7', fallback: false });
    // The omitted shield bash (18 frames, strike 7) plays swipe-1 (15 frames, strike 4) with the strike on the same tick.
    expect(resolveFrame(doc, SPEARMAN, 'swipe-4', 0)).toMatchObject({ key: 'spearman/swipe-1/0', clip: 'swipe-1', fallback: true });
    expect(resolveFrame(doc, SPEARMAN, 'swipe-4', 7)).toMatchObject({ key: 'spearman/swipe-1/4', fallback: true });
    expect(resolveFrame(doc, SPEARMAN, 'swipe-4', 17)).toMatchObject({ key: 'spearman/swipe-1/14', fallback: true });
    const warped = Array.from({ length: 18 }, (_, f) => resolveFrame(doc, SPEARMAN, 'swipe-4', f)!.frame);
    expect(warped).toEqual([...warped].sort((a, b) => a - b)); // never runs backwards
    // No sprite set: the renderer keeps the placeholder block.
    expect(resolveFrame({ frames: { spearman: rect() } }, SPEARMAN, 'walk', 0)).toBeNull();
  });

  it('warps a frame index so the strike frames coincide', () => {
    expect(warpFrame(7, 18, 7, 15, 4)).toBe(4);
    expect(warpFrame(0, 18, 7, 15, 4)).toBe(0);
    expect(warpFrame(17, 18, 7, 15, 4)).toBe(14);
    expect(warpFrame(5, 10, null, 20, null)).toBe(11);
  });
});
