// The asteroid's regolith strip: near-white (vertex colour sets the carbonaceous tone) rubble of
// angular clasts in a fine dusty matrix, with bright nickel-iron flecks — what close-up images of
// rubble-pile asteroids (Itokawa, Bennu, Ryugu) show: boulders and cobbles at every scale, no
// tiled gravel pattern. Square 1.6 cm texels (a 1 m band, 64 m of U) carry cobbles and clusters
// of grains; isotropic and low-contrast, so the projection's axis switches do not show.

import { defineMaterial, tex } from '@developerz.ai/ts23d';

/** Cobble-to-cobble tone: each Worley cell (~40 cm) its own shade, soft-edged. */
const shade = tex.cells({ size: 0.4, jitter: 1, out: 'id', seed: 61 });
/** The dark matrix between cobbles, kept faint (a hard edge streaks across the 4 m band). */
const clasts = tex.cells({ size: 0.4, jitter: 1, out: 'edge', seed: 61 }).smoothstep(0, 0.35);
/** Nickel-iron grains: sparse bright clusters ~15 cm. */
const metal = tex.cells({ size: 0.7, jitter: 1, out: 'f1', seed: 62 }).smoothstep(0.12, 0.04);
/** Clasts: large pale and dark fragments ~25–40 cm, so the grain reads as broken rock. */
const pale = tex.cells({ size: 0.9, jitter: 1, out: 'f1', seed: 64 }).smoothstep(0.2, 0.08);
const dark = tex.cells({ size: 0.8, jitter: 1, out: 'f1', seed: 65 }).smoothstep(0.18, 0.06);
const dust = tex.noise({ size: 0.9, octaves: 3, seed: 63 });
const height = clasts.mul(0.2).add(dust.mul(0.5)).add(pale.mul(0.3)).clamp();

export const REGOLITH = defineMaterial({
  id: 'asteroid_regolith',
  // Square texels: a strip row is 64 texels tall, so a 1 m band (V mirrored band to band, so
  // no seam) holds 64 a metre up the rock, and 64 m of U holds 64 a metre across. A 4 m band
  // over 8 m of U held 16 a metre up and 512 across: every feature smeared into horizontal
  // streaks (terrace banding).
  scaleMetres: 1,
  spanMetres: 64,
  roughness: 0.92,
  graph: tex.material({
    height,
    depth: 0.015,
    // Low contrast on purpose: box-projected SDF UVs switch axis triangle by triangle, and any
    // strong feature would show the switch as a jagged outline. Tone lives in vertex colour.
    // The cobble edges kept faint (a crack network on every cell read as crazed mud); tone
    // comes from per-cobble shade and the large pale and dark clasts instead.
    albedo: clasts
      .remap(0.95, 1)
      .mul(shade.remap(0.84, 1.04))
      .mul(dust.remap(0.92, 1.03))
      .mul(dark.remap(1, 0.62))
      .add(pale.mul(0.16))
      .add(metal.mul(0.3))
      .clamp(0, 1),
    // Metal grains are smoother and glint under a raking sun.
    roughness: metal.remap(0.95, 0.3),
  }),
  description:
    'Rubble-pile regolith: angular cobbles in a dusty matrix with nickel-iron flecks; near-white so vertex colour tints it.',
  sources: [
    'https://en.wikipedia.org/wiki/25143_Itokawa',
    'https://en.wikipedia.org/wiki/101955_Bennu',
  ],
});
