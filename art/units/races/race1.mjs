/**
 * race1 Spearman — the plumed, slashed-sleeve provincial: red, blue and
 * cream over steel. Silhouette modifier: the tall plume and the puffed
 * upper arms. No rig deviation. (Race names live in src/names/displayNames.ts.)
 */
import { defineVariant } from '../spearman/rig.mjs';

export default defineVariant({
  id: 'race1',
  palette: {
    skin: '#e2b48a',
    hair: '#6b4423',
    primary: '#b3262e', // provincial red: doublet and sleeves
    secondary: '#2a4f9a', // provincial blue: hose and tabard
    trim: '#efe3c4', // cream: slashes and plume
    metal: '#b9bfc8', // steel
    metalDark: '#6b727c',
    leather: '#5b3a1e',
    wood: '#8b5e34',
  },
  proportions: { shoulderWidth: 1.08 },
  parts: { helmet: 'cap', plume: true, slashedSleeves: true, shield: 'round' },
});
