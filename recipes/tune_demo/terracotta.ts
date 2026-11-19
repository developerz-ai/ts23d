// The amphora's clay strip: near-white (vertex colour sets the terracotta tone) wheel-thrown
// earthenware. Throw rings run around the pot (along U, a 1.6 cm pitch as a potter's fingers leave
// them on a wheel-thrown jar), over a fine sandy grit and soft firing mottle. The strip's V span is
// 12 whole rings, so the band mirrored along the profile never breaks a ring.

import { defineMaterial, tex } from '@developerz.ai/ts23d';

/** Ring pitch, metres: finger ridges on a thrown storage jar are 1–2 cm apart. */
const PITCH = 0.016;
const rings = tex.fn((_x, y) => {
  const s = Math.sin((2 * Math.PI * y) / PITCH);
  // Sharpened crests: a ridge, then a broad shallow groove, as fingers drag the clay.
  return 0.5 + 0.5 * Math.sign(s) * Math.abs(s) ** 0.6;
}, 'throw_rings');
const grit = tex.noise({ size: 0.004, octaves: 2, seed: 71 });
const mottle = tex.noise({ size: 0.12, octaves: 3, seed: 72 });

export const TERRACOTTA = defineMaterial({
  id: 'amphora_terracotta',
  scaleMetres: PITCH * 12,
  spanMetres: 1,
  // Unglazed fired clay: matte, no clearcoat sheen.
  roughness: 0.9,
  graph: tex.material({
    height: rings.mul(0.75).add(grit.mul(0.25)).clamp(),
    depth: 0.0012,
    albedo: rings
      .remap(0.88, 1)
      .mul(grit.remap(0.93, 1.03))
      .mul(mottle.remap(0.9, 1.04))
      .clamp(0, 1),
    roughness: grit.remap(0.86, 0.95),
  }),
  description:
    'Wheel-thrown terracotta: 1.6 cm throw rings, sandy grit, firing mottle; near-white so vertex colour tints it.',
  sources: ['https://en.wikipedia.org/wiki/Throwing_(pottery)'],
});
