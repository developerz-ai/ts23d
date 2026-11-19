// The amphora's strip: near-white (vertex colour sets the tone) wheel-thrown earthenware. Throw
// rings run around the pot along U at a 1.4 cm pitch over a fine sandy grit; the V span holds 12
// whole rings, so the band mirrored along the turned profile never breaks one.

import { defineMaterial, tex } from '@developerz.ai/ts23d';

const PITCH = 0.014;
const rings = tex.fn((_x, y) => {
  const s = Math.sin((2 * Math.PI * y) / PITCH);
  return 0.5 + 0.5 * Math.sign(s) * Math.abs(s) ** 0.6;
}, 'throw_rings');
const grit = tex.noise({ size: 0.004, octaves: 2, seed: 81 });

export const CLAY_STRIP = defineMaterial({
  id: 'showcase_clay',
  scaleMetres: PITCH * 12,
  spanMetres: 1,
  roughness: 0.88,
  graph: tex.material({
    height: rings.mul(0.75).add(grit.mul(0.25)).clamp(),
    depth: 0.001,
    albedo: rings.remap(0.88, 1).mul(grit.remap(0.93, 1.03)).clamp(0, 1),
    roughness: grit.remap(0.84, 0.94),
  }),
  description:
    'Wheel-thrown clay: 1.4 cm throw rings and grit; near-white so vertex colour tints it.',
  sources: ['https://en.wikipedia.org/wiki/Throwing_(pottery)'],
});
