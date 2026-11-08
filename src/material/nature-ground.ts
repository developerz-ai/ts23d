// Nature strips, ground: sand, soil, gravel, mud, snow, ice, grass, moss, leaf litter — each a
// texture graph (`tex`), height first, colour from ramps over the same fields so relief and tone
// agree. Albedo/roughness basis per strip is in docs/architecture/materials.md#nature.

import type { MaterialDef } from './material-def.ts';
import { tex } from './tex/index.ts';

type Def = MaterialDef & { readonly graph: NonNullable<MaterialDef['graph']> };

const PB = 'https://physicallybased.info';
const ALBEDO = 'https://en.wikipedia.org/wiki/Albedo';

/** Wind ripples (crests along V, spacing ~7 cm) over fine grain. PB Sand: (0.44, 0.386, 0.231). */
const sandShape = tex
  .ridged({ size: 0.07, sizeV: 0.6, octaves: 2, seed: 1 })
  .warp(tex.noise({ size: 0.5, seed: 2 }), 0.015)
  .mul(0.55)
  .add(tex.noise({ size: 0.006, octaves: 2, gain: 0.7, seed: 3 }).mul(0.45));
export const sand: Def = {
  id: 'sand',
  scaleMetres: 0.5,
  roughness: 0.9,
  graph: tex.material({
    height: sandShape,
    depth: 0.008,
    albedo: sandShape
      .mul(0.6)
      .add(tex.noise({ size: 0.4, seed: 4 }).mul(0.4))
      .ramp([
        [0.2, '#958a68'],
        [0.55, '#b0a684'],
        [0.85, '#cbc2a0'],
      ]),
    roughness: sandShape.remap(0.94, 0.86),
  }),
  description: 'Dry quartz sand: wind ripples, fine grain.',
  sources: [PB],
};

/** Clods (inverted cells) broken by fine crumb; bare soil albedo ~0.17 broadband. */
const clods = tex
  .cells({ size: 0.05, seed: 5 })
  .invert()
  .pow(1.5)
  .mul(0.6)
  .add(tex.noise({ size: 0.015, octaves: 3, seed: 6 }).mul(0.4));
export const soil: Def = {
  id: 'soil',
  scaleMetres: 0.5,
  roughness: 0.93,
  graph: tex.material({
    height: clods,
    depth: 0.012,
    albedo: clods
      .mul(0.7)
      .add(tex.noise({ size: 0.3, seed: 7 }).mul(0.3))
      .ramp([
        [0.1, '#3a2b1f'],
        [0.5, '#5e4a37'],
        [0.9, '#7f6a54'],
      ]),
    roughness: clods.remap(0.96, 0.86),
  }),
  description: 'Bare loamy soil: crumbly clods, dry tops lighter.',
  sources: [ALBEDO],
};

const stones = tex.pebbles({
  size: 0.026,
  radius: 0.62,
  jitter: 0.9,
  aspect: 1.5,
  rotate: true,
  seed: 8,
});
export const gravel: Def = {
  id: 'gravel',
  scaleMetres: 0.5,
  roughness: 0.8,
  graph: tex.material({
    height: stones.height.mul(0.85).add(tex.noise({ size: 0.01, seed: 9 }).mul(0.15)),
    depth: 0.014,
    albedo: stones.id
      .ramp([
        [0, '#6d6862'],
        [0.35, '#8e877c'],
        [0.65, '#7a6a58'],
        [1, '#a59e92'],
      ])
      .mix('#3b322a', stones.mask.invert())
      .mul(stones.height.remap(0.75, 1.05)),
    roughness: stones.mask.lerp(0.95, 0.72),
  }),
  description: 'Rounded river gravel, 1–4 cm, in dark fines.',
  sources: [ALBEDO],
};

const mudShape = tex
  .noise({ size: 0.25, octaves: 4, seed: 10 })
  .mul(0.8)
  .add(tex.cells({ size: 0.06, out: 'edge', seed: 11 }).smoothstep(0, 0.12).mul(0.2));
export const mud: Def = {
  id: 'mud',
  scaleMetres: 0.5,
  roughness: 0.7,
  wet: 0.75,
  params: { porosity: 0.9 },
  graph: tex.material({
    height: mudShape,
    depth: 0.02,
    albedo: mudShape.ramp([
      [0.2, '#3a2c20'],
      [0.6, '#56432f'],
      [0.9, '#6a553d'],
    ]),
    roughness: mudShape.remap(0.78, 0.6),
  }),
  description: 'Wet mud: soft undulation, water pooled in the hollows (wet 0.75).',
  sources: [
    ALBEDO,
    'https://seblagarde.wordpress.com/2013/04/14/water-drop-3b-physically-based-wet-surfaces/',
  ],
};

const drift = tex
  .noise({ size: 0.5, seed: 12 })
  .mul(0.75)
  .add(tex.noise({ size: 0.02, octaves: 2, seed: 13 }).mul(0.25));
export const snow: Def = {
  id: 'snow',
  scaleMetres: 0.5,
  roughness: 0.6,
  graph: tex.material({
    height: drift,
    depth: 0.02,
    albedo: drift.ramp([
      [0.1, '#d5dde6'],
      [0.6, '#eceff2'],
      [1, '#f3f4f5'],
    ]),
    roughness: drift.remap(0.5, 0.68),
  }),
  description: 'Settled snow: soft drifts, blue-grey in the hollows. PB Snow 0.85 linear.',
  sources: [PB],
};

const cracks = tex
  .cells({ size: 0.18, out: 'edge', jitter: 1, seed: 14 })
  .warp(tex.noise({ size: 0.1, seed: 15 }), 0.01)
  .smoothstep(0, 0.04);
const bubbles = tex.scatter({ size: 0.02, density: 0.25, radius: 0.25, shape: 'flat', seed: 16 });
export const ice: Def = {
  id: 'ice',
  scaleMetres: 0.5,
  roughness: 0.12,
  graph: tex.material({
    height: cracks.mul(0.9).add(tex.noise({ size: 0.3, seed: 17 }).mul(0.1)),
    depth: 0.004,
    albedo: tex
      .noise({ size: 0.4, seed: 18 })
      .ramp([
        [0.2, '#9fc0d4'],
        [0.8, '#c4dbe7'],
      ])
      .mix('#e8f1f5', cracks.invert().mul(0.8))
      .mix('#e3eef3', bubbles.mask.mul(0.6)),
    roughness: cracks.lerp(0.3, 0.1),
  }),
  description: 'Lake ice: blue-grey, white fracture lines, trapped bubbles.',
  sources: [PB],
};

const blades = tex
  .ridged({ size: 0.006, sizeV: 0.05, octaves: 2, seed: 19 })
  .warp(tex.noise({ size: 0.08, seed: 20 }), 0.01);
const dry = tex.noise({ size: 0.6, seed: 21 }).smoothstep(0.55, 0.75);
export const grass: Def = {
  id: 'grass',
  scaleMetres: 0.5,
  roughness: 0.85,
  graph: tex.material({
    height: blades,
    depth: 0.012,
    albedo: blades
      .ramp([
        [0, '#253a16'],
        [0.5, '#4a6a26'],
        [1, '#7d9a3c'],
      ])
      .mix(
        blades.ramp([
          [0, '#5a4f2c'],
          [1, '#a8995a'],
        ]),
        dry,
      ),
    roughness: blades.remap(0.92, 0.78),
  }),
  description: 'Short meadow grass seen from above: blades, darker roots, dry patches.',
  sources: [ALBEDO],
};

const cushions = tex
  .cells({ size: 0.05, jitter: 1, seed: 22 })
  .invert()
  .pow(2)
  .mul(0.7)
  .add(tex.noise({ size: 0.006, octaves: 2, seed: 23 }).mul(0.3));
export const moss: Def = {
  id: 'moss',
  scaleMetres: 0.5,
  roughness: 0.95,
  graph: tex.material({
    height: cushions,
    depth: 0.015,
    albedo: cushions.ramp([
      [0.1, '#2a3b16'],
      [0.5, '#56722a'],
      [0.9, '#8aa23a'],
    ]),
    roughness: cushions.remap(0.98, 0.86),
  }),
  description: 'Cushion moss: lumpy mounds, lit tips yellow-green.',
  sources: [ALBEDO],
};

const leavesA = tex.scatter({
  size: 0.05,
  radius: 0.9,
  shape: 'flat',
  aspect: 2.4,
  rotate: true,
  seed: 24,
});
const leavesB = tex.scatter({
  size: 0.045,
  radius: 0.85,
  shape: 'flat',
  aspect: 1.6,
  rotate: true,
  density: 0.8,
  seed: 25,
});
const leafPalette = [
  [0, '#5e3519'],
  [0.35, '#8c5524'],
  [0.7, '#b07a30'],
  [1, '#6a5a2c'],
] as const;
export const leafLitter: Def = {
  id: 'leaf_litter',
  scaleMetres: 0.5,
  roughness: 0.8,
  graph: tex.material({
    height: leavesA.height.mul(0.5).max(leavesB.height.mul(0.5).add(leavesB.mask.mul(0.4))),
    depth: 0.006,
    albedo: tex
      .colour('#2e2318')
      .mix(leavesA.id.ramp(leafPalette), leavesA.mask)
      .mix(leavesB.id.ramp(leafPalette), leavesB.mask),
    roughness: leavesA.mask.max(leavesB.mask).lerp(0.92, 0.75),
  }),
  description: 'Autumn leaf litter: overlapping brown, orange and ochre leaves on dark humus.',
  sources: [ALBEDO],
};
