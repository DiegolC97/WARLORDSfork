/**
 * Screen registry. This is the only place that knows every screen; each
 * screen folder exposes exactly one definition through its `index.ts`.
 */
import type { ScreenDefinition } from '../shell/screen';
import { battleScreen } from './battle';
import { bootScreen } from './boot';
import { creditsScreen } from './credits';
import { instructionsScreen } from './instructions';
import { mapScreen } from './map';
import { menuScreen } from './menu';
import { optionsScreen } from './options';
import { resultScreen } from './result';
import { shopScreen } from './shop';

export const SCREENS: readonly ScreenDefinition[] = [
  bootScreen,
  menuScreen,
  instructionsScreen,
  optionsScreen,
  creditsScreen,
  shopScreen,
  mapScreen,
  battleScreen,
  resultScreen,
];
