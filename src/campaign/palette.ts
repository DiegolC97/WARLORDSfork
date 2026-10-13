/**
 * Map colours. One colour per territory-holding race, one for the
 * unlockable race (used for the player's holdings when playing it) and one
 * for contested regions. The set is drawn from the Okabe–Ito palette, which
 * was designed to stay distinguishable under protanopia, deuteranopia and
 * tritanopia; `palette.test.ts` simulates all three and checks every pair.
 *
 * Colour is never the only channel: contested regions are also hatched and
 * labelled, and the player's holdings carry a thick outline and a banner
 * glyph on top of their race colour.
 */
import type { RaceId } from '../save';
import { CONTESTED, type Bloc } from './regions';

export const RACE_COLOURS: Readonly<Record<RaceId, string>> = {
  race1: '#0072B2', // blue
  race2: '#E69F00', // orange
  race3: '#56B4E9', // sky blue
  race4: '#009E73', // bluish green
  race5: '#CC79A7', // reddish purple
  race6: '#F0E442', // yellow
  race7: '#D55E00', // vermilion
};

export const CONTESTED_COLOUR = '#E8E8E8';

/** Fill for a region drawn as its bloc. */
export function blocColour(bloc: Bloc): string {
  return bloc === CONTESTED ? CONTESTED_COLOUR : RACE_COLOURS[bloc];
}

/** Dark text reads on the lighter fills, light text on the darker ones. */
export function labelColourOn(fill: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(fill.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return lum > 0.45 ? '#111111' : '#FFFFFF';
}
