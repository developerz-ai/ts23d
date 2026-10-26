// The house sheet: every strip and cell, tuned so albedo stays near-greyscale and bright (vertex
// colour carries hue) and each strip reads at its typical face height (`scaleMetres`).

import type { SheetRecipe, StripRecipe } from './types.ts';

const leaf: StripRecipe = { kind: 'flat', scaleMetres: 1, roughness: 0.6 };

export const DEFAULT_SHEET: SheetRecipe = {
  seed: 1,
  size: 1024,
  strips: {
    plain: { kind: 'noise', scaleMetres: 1, roughness: 0.6 },
    brick: { kind: 'bond', scaleMetres: 0.45, roughness: 0.85, params: { grime: 0.2 } },
    stone: {
      kind: 'bond',
      scaleMetres: 0.9,
      roughness: 0.9,
      params: {
        course: 0.22,
        length: 0.4,
        mortar: 0.016,
        depth: 0.012,
        bevel: 0.025,
        irregular: 0.5,
        relief: 0.004,
        variation: 0.3,
        grime: 0.2,
      },
    },
    slate: { kind: 'slate', scaleMetres: 0.66, roughness: 0.7 },
    iron: { kind: 'plates', scaleMetres: 0.5, roughness: 0.55, metalness: 0 },
    wood: { kind: 'planks', scaleMetres: 0.6, roughness: 0.75 },
    glass: { kind: 'glass', scaleMetres: 1, roughness: 0.05 },
    concrete: { kind: 'concrete', scaleMetres: 1, roughness: 0.9, params: { grime: 0.3 } },
  },
  cells: {
    window_sash: { kind: 'noise', scaleMetres: 1, roughness: 0.5 },
    door_panel: { kind: 'noise', scaleMetres: 1, roughness: 0.6 },
    clock: { kind: 'noise', scaleMetres: 1, roughness: 0.3 },
    smokebox: {
      kind: 'plates',
      scaleMetres: 1,
      roughness: 0.6,
      metalness: 0.2,
      params: { rust: 0.3 },
    },
    sign: { kind: 'noise', scaleMetres: 1, roughness: 0.5 },
    porthole: { kind: 'plates', scaleMetres: 1, roughness: 0.5 },
    foliage_broadleaf: leaf,
    foliage_maple: leaf,
    foliage_maple_autumn: leaf,
    foliage_birch: leaf,
    foliage_acacia: leaf,
    foliage_palm: leaf,
    foliage_spruce: leaf,
    foliage_spruce_snow: leaf,
    foliage_willow: leaf,
    foliage_reeds: leaf,
    foliage_needles: leaf,
  },
};
