// The shark's skin strip: near-white so vertex colour sets the hue. Dermal denticles lie in rows from
// head to tail, so the skin's grain and its sheen run along U: a fine ridged micro-normal, and a
// broad roughness drift (0.5 to 0.68) that breaks the satin into the patchy sheen of a wet shark.
// V is coarse (scaleMetres 3 over 64 texels), so every pattern varies along U first.

import { defineMaterial, tex } from '@developerz.ai/ts23d';

const grain = tex.noise({ size: 0.0025, sizeV: 0.09, octaves: 2, seed: 41 });
const drift = tex.noise({ size: 0.35, sizeV: 0.6, octaves: 3, seed: 42 });

export const SKIN = defineMaterial({
  id: 'shark_skin',
  scaleMetres: 3,
  roughness: 0.58,
  graph: tex.material({
    height: grain.mul(0.7).add(drift.mul(0.3)),
    depth: 0.0003,
    albedo: drift.mul(0.06).add(grain.mul(0.04)).add(0.9),
    roughness: drift.remap(0.5, 0.68).add(grain.mul(0.05)),
  }),
  description:
    'Shark skin: satin with a head-to-tail denticle grain and a patchy wet sheen (vertex colour tints).',
});
