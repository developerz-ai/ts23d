// Species presets: plain `TreeParams` objects — spread one and override what you need
// (`{ ...oak, leaves: { ...oak.leaves, color: hex('#7a8a2a') } }` is an autumn oak).
// `typical` sizes are mature open-grown trees; sources in each comment and in refs/<name>.md.

import { hex } from '../material/index.ts';
import type { TreeParams } from './vegetation-params.ts';

/** Quercus robur (English oak): 20–25 m, crown about as wide; girth 4–12 m. Spreading, crooked limbs. */
export const oak: TreeParams = {
  shape: 'hemispherical',
  baseSize: 0.3,
  ratioPower: 1.15,
  taper: 0.3,
  levels: [
    { branches: 0, length: 0.55, downAngle: 0, curveVar: 5, segments: 8 },
    {
      branches: 8,
      length: 0.95,
      downAngle: 58,
      downAngleV: -18,
      curve: -8,
      curveVar: 16,
      segments: 7,
    },
    { branches: 6, length: 0.55, downAngle: 50, curve: 12, curveVar: 18, start: 0.2, segments: 4 },
    { branches: 5, length: 0.5, downAngle: 45, curveVar: 14, start: 0.15, segments: 2 },
  ],
  bark: hex('#4a4036'),
  barkTop: hex('#5a5045'),
  leaves: {
    shape: 'lobed',
    size: 1.7,
    width: 0.8,
    perStem: 5,
    color: hex('#3d6022'),
    colorVar: 0.16,
  },
  roots: 5,
  impostor: 'blob',
  typical: { height: 22, spread: 22, dbh: 1.3 },
};

/** Pinus sylvestris (Scots pine): 25–35 m, DBH up to 1 m; long clean bole, orange upper bark,
 * flat-topped crown in the top third, dark blue-green needle tufts on upturned tips. */
export const pine: TreeParams = {
  shape: 'cylindrical',
  baseSize: 0.6,
  ratioPower: 1.2,
  taper: 0.12,
  levels: [
    { branches: 0, length: 0.94, downAngle: 0, curveVar: 3, segments: 10 },
    {
      branches: 13,
      length: 0.34,
      downAngle: 94,
      downAngleV: -14,
      curve: 16,
      curveVar: 14,
      segments: 5,
    },
    { branches: 5, length: 0.42, downAngle: 60, curve: 18, curveVar: 14, start: 0.3, segments: 3 },
  ],
  bark: hex('#4a3a30'),
  barkTop: hex('#c0652c'),
  leaves: {
    shape: 'tuft',
    size: 2.1,
    width: 0.95,
    perStem: 5,
    from: 0.5,
    flat: 0.8,
    color: hex('#24422e'),
    colorVar: 0.1,
  },
  roots: 4,
  impostor: 'blob',
  typical: { height: 25, spread: 9, dbh: 0.6 },
};

/** Cocos nucifera (coconut palm): up to 30 m; single ringed stem 30–40 cm; 4–6 m pinnate fronds. */
export const palm: TreeParams = {
  shape: 'cylindrical',
  baseSize: 0.95,
  ratioPower: 1.1,
  taper: 0.7,
  lean: 12,
  levels: [
    { branches: 0, length: 1, downAngle: 0, curve: 24, curveVar: 1.5, segments: 12 },
    {
      branches: 22,
      length: 0.26,
      downAngle: 115,
      downAngleV: -85,
      rotate: 137.5,
      curve: -55,
      curveVar: 4,
      segments: 8,
    },
  ],
  bark: hex('#6b5d4a'),
  barkTop: hex('#8a7a62'),
  leaves: {
    shape: 'frond',
    size: 0,
    width: 0.2,
    perStem: 26,
    color: hex('#4f7a2a'),
    colorVar: 0.12,
  },
  roots: 9,
  fruit: { count: 7, radius: 0.13, color: hex('#5f6a22') },
  impostor: 'cards',
  typical: { height: 20, spread: 9, dbh: 0.35 },
};

/** Betula pendula (silver birch): 15–25 m, narrow crown, white bark with black marks, weeping twigs. */
export const birch: TreeParams = {
  shape: 'flame',
  baseSize: 0.3,
  ratioPower: 1.4,
  taper: 0.1,
  levels: [
    { branches: 0, length: 1, downAngle: 0, curveVar: 3, segments: 10 },
    {
      branches: 22,
      length: 0.32,
      downAngle: 45,
      downAngleV: 10,
      curve: -25,
      curveVar: 8,
      segments: 4,
    },
    { branches: 5, length: 0.55, downAngle: 30, curve: -45, curveVar: 10, start: 0.2, segments: 3 },
  ],
  bark: hex('#d9d6cc'),
  barkMarks: { color: hex('#24221f'), amount: 0.12 },
  leaves: {
    shape: 'oval',
    size: 0.8,
    width: 0.7,
    perStem: 4,
    color: hex('#6f9a32'),
    colorVar: 0.15,
  },
  impostor: 'blob',
  typical: { height: 18, spread: 8, dbh: 0.4 },
};

/** Salix babylonica (weeping willow): 10–15 m, wider than tall; long hanging leafy strands. */
export const willow: TreeParams = {
  shape: 'hemispherical',
  baseSize: 0.25,
  ratioPower: 1.7,
  taper: 0.35,
  levels: [
    { branches: 0, length: 0.55, downAngle: 0, curveVar: 5, segments: 6 },
    {
      branches: 8,
      length: 0.95,
      downAngle: 42,
      curve: 40,
      curveBack: -70,
      curveVar: 8,
      segments: 6,
    },
    { branches: 7, length: 0.55, downAngle: 35, curve: -80, curveVar: 8, start: 0.3, segments: 4 },
  ],
  bark: hex('#4f463a'),
  leaves: {
    shape: 'strand',
    size: 2.6,
    width: 0.22,
    perStem: 4,
    color: hex('#8aa83e'),
    colorVar: 0.12,
    hang: 0.92,
  },
  roots: 6,
  impostor: 'blob',
  typical: { height: 12, spread: 14, dbh: 0.8 },
};

export const SPECIES = { oak, pine, palm, birch, willow } as const;
export type SpeciesName = keyof typeof SPECIES;
