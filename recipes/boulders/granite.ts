// The boulders' rock strip: near-white weathered granite (vertex colour sets the tone). Isotropic
// detail only — biotite-rich clots, quartz-rich patches, feldspar mottling and a grain — and
// no joints or lichen outlines (the library `cliff` strip draws joint networks that read as painted
// lines on a free-standing boulder). A 3 m band so an SDF rock's box-projected UVs never fold inside
// a 2.4 m boulder, and nothing directional, so the projection's switch between axes cannot show.

import { defineMaterial, tex } from '@developerz.ai/ts23d';

// The strip band is 3 m tall in a few dozen texels, so nothing finer than ~10 cm survives across
// it (finer detail smears into streaks along U): every feature here is isotropic and ≥ 10 cm, the
// grain the eye fills in at boulder distance.
/** Biotite-rich clots: dark spots ~10–20 cm, sparse. */
const mica = tex.cells({ size: 0.3, jitter: 1, out: 'f1', seed: 41 }).smoothstep(0.08, 0.3);
/** Quartz-rich patches: pale blotches ~20 cm. */
const quartz = tex.cells({ size: 0.45, jitter: 1, out: 'f1', seed: 42 }).smoothstep(0.15, 0.45);
/** Feldspar mottling and weathering blotches at two scales. */
const mottle = tex.noise({ size: 0.5, octaves: 3, seed: 43 });
const blotch = tex.noise({ size: 1.6, octaves: 2, seed: 44 });
const grain = tex.noise({ size: 0.15, octaves: 2, seed: 45 });
const height = grain.mul(0.4).add(quartz.mul(0.25)).add(mottle.mul(0.35)).clamp();

export const GRANITE = defineMaterial({
  id: 'boulder_granite',
  scaleMetres: 3,
  spanMetres: 6,
  roughness: 0.78,
  graph: tex.material({
    height,
    depth: 0.02,
    // Near-white: flecks dark, quartz paler, broad blotches ±8 %; the vertex colour is the tone.
    albedo: mica
      .remap(0.72, 1)
      .mul(quartz.remap(1.06, 0.94))
      .mul(mottle.remap(0.9, 1.04))
      .mul(blotch.remap(0.92, 1.05))
      .mul(grain.remap(0.94, 1.02))
      .clamp(0, 1),
    // Quartz glints a little smoother than the weathered feldspar.
    roughness: quartz.remap(0.62, 0.82),
  }),
  description:
    'Weathered granite: biotite clots, quartz patches, feldspar mottling; near-white so vertex colour tints it.',
  sources: ['https://en.wikipedia.org/wiki/Granite'],
});
