/**
 * race6 Spearman — digitigrade with the tail as the primary read: teal
 * and ochre scales with gold and jungle green. Silhouette modifier: the
 * tail and the crouched, bird-like legs. Rig deviation: the extra tail
 * bone chain and the digitigrade leg solve; same poses, same timings.
 */
import { defineVariant } from '../spearman/rig.mjs';

export default defineVariant({
  id: 'race6',
  palette: {
    skin: '#2f8f8a', // teal scales
    hair: '#1e5e5a',
    primary: '#2f8f8a', // teal body
    secondary: '#c98a2e', // ochre belly and crest
    trim: '#d4a83a', // gold
    metal: '#d4a83a',
    metalDark: '#8a6a22',
    leather: '#2f6b3a', // jungle green
    wood: '#7a5a30',
    legs: '#2a7f7a',
    arms: '#2f8f8a',
  },
  proportions: { height: 1.0, legs: 1.0, torsoWidth: 1.05, limbWidth: 1.1, headSize: 1.05 },
  stance: { digitigrade: 1, hunch: 0.28, headTilt: 0.15 },
  parts: { helmet: 'none', tail: true, scales: true, shield: 'round' },
});
