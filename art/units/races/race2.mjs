/**
 * race2 Spearman — wide, short and bearded: gromril grey, deep gold and
 * rune blue. Silhouette modifier: the beard as the primary read on a
 * squat, broad frame. Rig deviation: shorter legs, broader torso and
 * limbs, wider stance, a slight permanent knee bend; same poses, same
 * timings.
 */
import { defineVariant } from '../spearman/rig.mjs';

export default defineVariant({
  id: 'race2',
  palette: {
    skin: '#dca57c',
    hair: '#c4652a', // the beard
    primary: '#9aa0a8', // gromril grey mail
    secondary: '#2f6fb3', // rune blue
    trim: '#c79a2f', // deep gold
    metal: '#c4c9d0',
    metalDark: '#5f6670',
    leather: '#5a3b22',
    wood: '#7d5631',
  },
  proportions: { height: 0.86, legs: 0.72, torsoWidth: 1.4, shoulderWidth: 1.2, headSize: 1.12, limbWidth: 1.35, handSize: 1.1, stanceWidth: 1.7, spearLength: 0.95 },
  stance: { kneeBend: 0.14 },
  parts: { helmet: 'crest', beard: true, shield: 'round' },
});
