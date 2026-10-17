/**
 * race5 Spearman — heavy horned bulk above the waist: blackened iron,
 * brass and blood red. Silhouette modifier: the horned helm and the
 * pauldroned mass of the upper body. Rig deviation: a broader, taller
 * torso and thicker limbs; same poses, same timings.
 */
import { defineVariant } from '../spearman/rig.mjs';

export default defineVariant({
  id: 'race5',
  palette: {
    skin: '#c9a184',
    hair: '#2a2a2a',
    primary: '#2b2b30', // blackened iron plate
    secondary: '#8c1a1a', // blood red
    trim: '#b08a3c', // brass
    metal: '#4a4a52',
    metalDark: '#1e1e22',
    leather: '#3a2a22',
    wood: '#4f3a2a',
    legs: '#3a3a40',
  },
  proportions: { height: 1.04, torsoWidth: 1.3, shoulderWidth: 1.45, limbWidth: 1.25, headSize: 1.02, handSize: 1.1 },
  stance: { hunch: 0.05 },
  parts: { helmet: 'horned', horns: true, pauldrons: true, shield: 'kite' },
});
