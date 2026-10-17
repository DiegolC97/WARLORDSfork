/**
 * race3 Spearman — tall, narrow, spear carried high: white, silver and
 * sapphire with gold trim. Silhouette modifier: the raised spear and the
 * tall conical helm on a slender frame. Rig deviation: longer legs and
 * spear, narrower torso and limbs, feet close together, the spear arm
 * lifted while not thrusting; same poses, same timings.
 */
import { defineVariant } from '../spearman/rig.mjs';

export default defineVariant({
  id: 'race3',
  palette: {
    skin: '#f0d4b8',
    hair: '#e9d9a6',
    primary: '#f2f0ea', // white robes
    secondary: '#1f4fb0', // sapphire
    trim: '#d4a83a', // gold
    metal: '#d3d8e0', // silver
    metalDark: '#8a93a0',
    leather: '#8a7a55',
    wood: '#b89a6a',
  },
  proportions: { height: 1.06, legs: 1.1, torsoWidth: 0.82, shoulderWidth: 0.92, headSize: 0.95, limbWidth: 0.82, handSize: 0.9, stanceWidth: 0.7, spearLength: 1.1 },
  stance: { armLift: 0.5, spearRest: 0.06 },
  parts: { helmet: 'open', shield: 'tall' },
});
