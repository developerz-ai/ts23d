// Nature strips, bark: oak (deep interlaced furrows), pine (scaly reddish plates) and birch (white
// with dark horizontal lenticels). On a lathe/sdf trunk U runs around and V along the trunk, so
// furrows run along V; the strips keep a short 4 m U span for fine texels across the furrows.

import type { MaterialDef } from './material-def.ts';
import { tex } from './tex/index.ts';

type Def = MaterialDef & { readonly graph: NonNullable<MaterialDef['graph']> };

const WOOD_DB = 'https://www.wood-database.com/';

const furrows = tex
  .ridged({ size: 0.035, sizeV: 0.35, octaves: 3, seed: 1 })
  .warp(tex.noise({ size: 0.15, sizeV: 0.4, seed: 2 }), 0.02);
const breaks = tex.noise({ size: 0.2, sizeV: 0.06, seed: 3 }).smoothstep(0.35, 0.65);
const oakH = furrows
  .mul(breaks.remap(0.6, 1))
  .mul(0.85)
  .add(tex.noise({ size: 0.008, octaves: 2, seed: 4 }).mul(0.15));
export const barkOak: Def = {
  id: 'bark_oak',
  scaleMetres: 1,
  roughness: 0.9,
  graph: tex.material({
    height: oakH,
    depth: 0.025,
    albedo: oakH.ramp([
      [0, '#2a221b'],
      [0.45, '#55493d'],
      [0.8, '#7d7264'],
      [1, '#8f8576'],
    ]),
    roughness: oakH.remap(0.95, 0.85),
  }),
  description: 'Oak bark: deep furrows along the trunk, broken ridges, grey-brown.',
  sources: [WOOD_DB],
};

const scaleWarp = tex.noise({ size: 0.15, sizeV: 0.3, seed: 6 });
const plateEdge = tex.cells({ size: 0.08, out: 'edge', seed: 5 }).warp(scaleWarp, 0.025);
const plateId = tex.cells({ size: 0.08, out: 'id', seed: 5 }).warp(scaleWarp, 0.025);
const pineH = plateEdge
  .smoothstep(0, 0.22)
  .mul(plateId.remap(0.6, 1))
  .mul(0.85)
  .add(tex.noise({ size: 0.01, octaves: 3, seed: 7 }).mul(0.15));
export const barkPine: Def = {
  id: 'bark_pine',
  scaleMetres: 1,
  roughness: 0.88,
  graph: tex.material({
    height: pineH,
    depth: 0.02,
    albedo: plateId
      .ramp([
        [0, '#6a3b22'],
        [0.5, '#8d5131'],
        [1, '#a8683f'],
      ])
      .mix('#24170f', pineH.smoothstep(0.35, 0.05)),
    roughness: pineH.remap(0.95, 0.84),
  }),
  description: 'Pine bark: flaky reddish plates split by dark fissures.',
  sources: [WOOD_DB],
};

const lenticels = tex.scatter({
  size: 0.06,
  density: 0.3,
  radius: 0.55,
  shape: 'flat',
  aspect: 9,
  seed: 8,
});
const scars = tex.noise({ size: 0.12, sizeV: 0.08, seed: 9 }).smoothstep(0.8, 0.86);
const birchH = tex
  .noise({ size: 0.15, seed: 10 })
  .mul(0.3)
  .sub(lenticels.mask.mul(0.4))
  .sub(scars.mul(0.5))
  .add(0.6);
export const barkBirch: Def = {
  id: 'bark_birch',
  scaleMetres: 1,
  roughness: 0.7,
  graph: tex.material({
    height: birchH,
    depth: 0.004,
    albedo: tex
      .noise({ size: 0.3, seed: 11 })
      .ramp([
        [0, '#cfc8bb'],
        [1, '#ebe7de'],
      ])
      .mix('#4a4038', lenticels.mask.mul(0.75))
      .mix('#24201c', scars),
    roughness: scars.max(lenticels.mask).lerp(0.62, 0.9),
  }),
  description: 'Birch bark: chalk-white, dark horizontal lenticels, black scar patches.',
  sources: [WOOD_DB],
};
