/**
 * race4 Spearman — hunched, asymmetric, oversized fists: green skin over
 * rusted mismatched metal and dirty leather. Silhouette modifier: the
 * forward hunch with the dropped back shoulder and the big fists. Rig
 * deviation: hunch and shoulder drop on the torso, bent knees, a broader
 * frame; same poses, same timings.
 */
import { defineVariant } from '../spearman/rig.mjs';

export default defineVariant({
  id: 'race4',
  palette: {
    skin: '#5f8f2e', // green
    hair: '#2f3a1a',
    primary: '#7a6240', // dirty leather jerkin
    secondary: '#4e4030', // darker leather
    trim: '#d9cfae', // bone and tusk
    metal: '#9a6a3f', // rusted iron
    metalDark: '#5a3a26',
    leather: '#5c4a2c',
    wood: '#6e4c2a',
  },
  proportions: { height: 0.98, torsoWidth: 1.22, shoulderWidth: 1.35, limbWidth: 1.18, headSize: 1.0, handSize: 1.0 },
  stance: { hunch: 0.5, headTilt: 0.12, kneeBend: 0.16, shoulderDrop: 0.7 },
  parts: { helmet: 'cap', bigFists: true, tusks: true, shield: 'round' },
});
