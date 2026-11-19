// Cloth as materials of its own, for the busts' garments: carded wool (a coarse 2/2 twill, matte
// and fuzzy), silk (a fine tight weave, smooth, the asset adds a sheen finish) and linen (a plain
// weave of uneven thread, slubs and washing creases). Each is the library's `weave` painter with
// its own thread pitch, relief and roughness on a near-white ground: the garment's dye is its
// vertex colour, so one strip serves every colour of that cloth (no dividing a dye by the strip's
// own colour, as tinting the natural `canvas` strip needed).
//
// Custom rows are per asset (docs/architecture/materials.md): these hold rows 7, 10 and 11,
// clear of the skin strips (12, 13) and the hair card strip (1) a bust also maps onto.

import { defineMaterial, hex } from '@developerz.ai/ts23d';

const SOURCES = ['https://physicallybased.info'];

/** Carded wool cloth: cloaks, mantles, tunics. Thread 3 mm, deep relief, almost no gloss. */
export const WOOL = defineMaterial({
  id: 'bust_wool',
  row: 10,
  kind: 'weave',
  scaleMetres: 1,
  roughness: 0.94,
  albedo: '#f2efe9',
  albedo2: '#c9c3b8',
  params: { pitch: 0.003, folds: 0.35, stains: 0.12, relief: 1.3, cavity: 0.7, cavityRough: 0.04 },
  description: 'Carded wool cloth: coarse twill, matte, dyed by vertex colour.',
  sources: SOURCES,
});

/** Silk: a fine tight weave whose thread barely shows; smooth enough to carry a sheen finish. */
export const SILK = defineMaterial({
  id: 'bust_silk',
  row: 11,
  kind: 'weave',
  scaleMetres: 1,
  roughness: 0.42,
  albedo: '#f6f4f0',
  albedo2: '#e2ded6',
  params: { pitch: 0.0012, folds: 0.5, stains: 0, relief: 0.35, cavity: 0.2, cavityRough: 0.02 },
  description: 'Silk: fine tight weave, low relief, smooth; dyed by vertex colour.',
  sources: SOURCES,
});

/** Linen: plain weave of uneven thread, creased by washing, water-marked. */
export const LINEN = defineMaterial({
  id: 'bust_linen',
  row: 7,
  kind: 'weave',
  scaleMetres: 1,
  roughness: 0.82,
  albedo: '#f3f0e8',
  albedo2: '#cfc8b8',
  params: { pitch: 0.002, folds: 0.8, stains: 0.3, relief: 0.9, cavity: 0.55, cavityRough: 0.05 },
  description: 'Linen: plain weave, slubby thread, washing creases; dyed by vertex colour.',
  sources: SOURCES,
});

/** The strips' own albedo (linear): for a recipe that still tints by division at a far LOD. */
export const CLOTH_ALBEDO = hex('#f2efe9');
