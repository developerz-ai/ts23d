// Ready-made CC0 image materials (opt-in, never registered by default, so the repo paints offline).
// Register with `defineMaterial(CC0_WOOD_PLANKS_GREY)`, fetch once with `bun run textures`, then
// `provideTextures(await loadTextureCache())` before painting. Hashes pin the exact bytes.

import type { MaterialDef } from './material-def.ts';

const PH = 'https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/wood_planks_grey';

/** Poly Haven "Wood Planks Grey" by Rob Tuytel (CC0), 1.5 m square, 1k PNG maps. */
export const CC0_WOOD_PLANKS_GREY: MaterialDef = {
  id: 'ph_wood_planks_grey',
  kind: 'flat',
  scaleMetres: 0.6,
  roughness: 0.85,
  description: 'Photo-scanned weathered grey planks (Poly Haven, CC0).',
  sources: ['https://polyhaven.com/a/wood_planks_grey'],
  texture: {
    source: 'polyhaven',
    id: 'wood_planks_grey',
    license: 'CC0-1.0',
    page: 'https://polyhaven.com/a/wood_planks_grey',
    author: 'Rob Tuytel',
    metres: [1.5, 1.5],
    maps: {
      albedo: {
        url: `${PH}/wood_planks_grey_diff_1k.png`,
        sha256: '3e6aeb842edd813759fdc96a6ffe6b695c888280f42501de589442311749ac5d',
      },
      normal: {
        url: `${PH}/wood_planks_grey_nor_gl_1k.png`,
        sha256: 'a9f2ad602eca2d59e84f203b1087e819e62ae517532bb25f7eb02a13c826e08b',
      },
      arm: {
        url: `${PH}/wood_planks_grey_arm_1k.png`,
        sha256: '9b81e9a0b4f9db0a920c4c2ce8ff13e0411b3624d4de455acdabe41e3fafe20e',
      },
    },
  },
};

export const CC0_MATERIALS: readonly MaterialDef[] = [CC0_WOOD_PLANKS_GREY];
