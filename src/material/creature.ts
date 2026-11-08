// Ready-made creature materials (opt-in, not on the default sheet, so they cost no built-in rows):
// register the ones a project uses with `defineMaterial(CREATURE_MATERIALS.dragon_scales)`. Scales
// are keratin over skin: glossier crowns, darker overlapped roots; hair is keratin strands with
// per-strand tone. Painted from texture graphs (`tex.scales`, `tex.strands`). Tinted coats use
// `fur_neutral` (near-white albedo, D24) so the vertex colour, not the strip, sets the hue.

import type { MaterialDef } from './material-def.ts';
import { tex } from './tex/index.ts';
import { scales, strands } from './tex/stamps-organic.ts';

const KERATIN = 'https://physicallybased.info';

const big = scales({ width: 0.1, height: 0.06, overlap: 0.45, point: 0.7, seed: 1 });
const bigH = big.height.mul(0.85).add(tex.noise({ size: 0.006, octaves: 2, seed: 2 }).mul(0.15));
const small = scales({ width: 0.025, height: 0.016, overlap: 0.4, point: 0.2, seed: 3 });
const hair = strands({ width: 0.0025, length: 0.25, clump: 0.6, wave: 0.008, seed: 4 });
const furS = strands({ width: 0.004, length: 0.06, clump: 0.4, wave: 0.004, seed: 5 });

type Creature = 'dragon_scales' | 'reptile_scales' | 'hair' | 'fur' | 'fur_neutral';

export const CREATURE_MATERIALS: Readonly<Record<Creature, MaterialDef>> = {
  dragon_scales: {
    id: 'dragon_scales',
    scaleMetres: 0.5,
    roughness: 0.45,
    graph: tex.material({
      height: bigH,
      depth: 0.006,
      albedo: big.id
        .ramp([
          [0, '#2c3b22'],
          [0.5, '#3e5230'],
          [1, '#56653a'],
        ])
        .mul(bigH.remap(0.55, 1.15))
        .mix('#8a7a46', tex.edgeWear(bigH, { width: 0.008, amount: 0.35, chip: 0.2 })),
      roughness: bigH.remap(0.62, 0.38),
    }),
    description:
      'Dragon scales: pointed overlapping plates, bronze-worn crowns (vertex colour tints).',
    sources: [KERATIN],
  },
  reptile_scales: {
    id: 'reptile_scales',
    scaleMetres: 0.5,
    roughness: 0.5,
    graph: tex.material({
      height: small.height,
      depth: 0.0015,
      albedo: small.id
        .mul(0.25)
        .add(small.height.mul(0.75))
        .ramp([
          [0, '#4a4430'],
          [1, '#9a9064'],
        ]),
      roughness: small.height.remap(0.62, 0.42),
    }),
    description: 'Small reptile scales (lizard, snake belly): round, tight rows.',
    sources: [KERATIN],
  },
  hair: {
    id: 'hair',
    scaleMetres: 0.5,
    roughness: 0.45,
    graph: tex.material({
      height: hair.height,
      depth: 0.0015,
      albedo: hair.id
        .mul(0.4)
        .add(hair.height.mul(0.6))
        .ramp([
          [0, '#120c08'],
          [0.6, '#2e2015'],
          [1, '#4a3524'],
        ]),
      roughness: hair.height.remap(0.6, 0.38),
    }),
    description: 'Coarse dark hair in locks (vertex colour tints toward any hair colour).',
    sources: [KERATIN],
  },
  fur: {
    id: 'fur',
    scaleMetres: 0.5,
    roughness: 0.7,
    graph: tex.material({
      height: furS.height,
      depth: 0.002,
      albedo: furS.id
        .mul(0.3)
        .add(furS.height.mul(0.7))
        .ramp([
          [0, '#3a2a1c'],
          [1, '#8a6a48'],
        ]),
      roughness: furS.height.remap(0.8, 0.6),
    }),
    description: 'Short animal fur: dense strands, darker underfur.',
    sources: [KERATIN],
  },
  // D24: `fur`'s brown albedo multiplies the vertex colour, so an orange or grey coat goes muddy.
  // This variant keeps the strand relief but a neutral, near-white albedo (strand-to-underfur value
  // only), so the vertex colour carries the coat's hue and value unchanged on average.
  fur_neutral: {
    id: 'fur_neutral',
    scaleMetres: 0.5,
    roughness: 0.7,
    graph: tex.material({
      height: furS.height,
      depth: 0.002,
      albedo: furS.id
        .mul(0.3)
        .add(furS.height.mul(0.7))
        .ramp([
          [0, '#b4b4b4'],
          [1, '#f4f4f4'],
        ]),
      roughness: furS.height.remap(0.8, 0.6),
    }),
    description:
      'Short animal fur with a neutral albedo: the vertex colour carries any coat (orange, grey, cream) without going muddy.',
    sources: [KERATIN],
  },
};
