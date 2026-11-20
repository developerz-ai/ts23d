// Ready-made creature materials (opt-in, not on the default sheet, so they cost no built-in rows):
// register the ones a project uses with `defineMaterial(CREATURE_MATERIALS.dragon_scales)`. Scales
// are keratin over skin: glossier crowns, darker overlapped roots; hair is keratin strands with
// per-strand tone. Painted from texture graphs (`tex.scales`, `tex.strands`). Tinted coats use
// `fur_neutral` (near-white albedo, D24) so the vertex colour, not the strip, sets the hue.
// `fur_clumps` / `hair_clumps` / `hair_locks` are the cutout strand atlases (strands.ts) the card passes map into:
// parts on them use `surface: 'cutout'` (ADR 008), one draw per body.

import type { MaterialDef } from './material-def.ts';
import { STRAND_LAYOUT, strandPainter } from './strands.ts';
import { tex } from './tex/index.ts';
import { scales, strands } from './tex/stamps-organic.ts';

const KERATIN = 'https://physicallybased.info';

const big = scales({ width: 0.1, height: 0.06, overlap: 0.45, point: 0.7, seed: 1 });
const bigH = big.height.mul(0.85).add(tex.noise({ size: 0.006, octaves: 2, seed: 2 }).mul(0.15));
const small = scales({ width: 0.025, height: 0.016, overlap: 0.4, point: 0.2, seed: 3 });
const hair = strands({ width: 0.0025, length: 0.25, clump: 0.6, wave: 0.008, seed: 4 });
const furS = strands({ width: 0.004, length: 0.06, clump: 0.4, wave: 0.004, seed: 5 });
/** Isotropic, two-octave breakup for `fur_neutral` (D60): no direction a projection could cross. */
const softFur = tex.noise({ size: 0.008, octaves: 2, seed: 6 });

type Creature =
  | 'dragon_scales'
  | 'reptile_scales'
  | 'hair'
  | 'fur'
  | 'fur_neutral'
  | 'fur_clumps'
  | 'hair_clumps'
  | 'hair_locks';

/** Painters are compared by identity on redefinition: one per strip, made once. */
const FUR_CLUMPS = strandPainter(STRAND_LAYOUT.fur_clumps);
const HAIR_CLUMPS = strandPainter(STRAND_LAYOUT.hair_clumps);
const HAIR_LOCKS = strandPainter(STRAND_LAYOUT.hair_locks);

export const CREATURE_MATERIALS: Readonly<Record<Creature, MaterialDef>> = {
  dragon_scales: {
    id: 'dragon_scales',
    row: 5, // its hash row (7) is the great white's `shark_skin`
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
    row: 2, // its hash row (0) is the Tiger's `zimmerit`
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
  // This variant keeps a neutral, near-white albedo so the vertex colour carries the coat's hue and
  // value unchanged on average. D60: no strands either. A sculpt maps the strip by box projection
  // (sdf.ts: U/V along world axes, V mirrored per band), which crosses the hair's lie: directional
  // strands at 2:1 contrast drew rings round a muzzle and wood grain down a flank. Isotropic,
  // ±8 % noise only; the coat's direction comes from the cards and the flow-aligned tone.
  fur_neutral: {
    id: 'fur_neutral',
    scaleMetres: 0.5,
    roughness: 0.7,
    graph: tex.material({
      height: softFur,
      depth: 0.0004,
      albedo: softFur.ramp([
        [0, '#dadada'],
        [1, '#f0f0f0'],
      ]),
      roughness: softFur.remap(0.75, 0.65),
    }),
    description:
      'Short animal fur with a neutral albedo: the vertex colour carries any coat (orange, grey, cream) without going muddy; isotropic, so no projection streaks.',
    sources: [KERATIN],
  },
  fur_clumps: {
    id: 'fur_clumps',
    kind: 'flat',
    scaleMetres: 0.05,
    roughness: 0.6,
    paint: FUR_CLUMPS,
    description:
      'Cutout fur and guard-hair clumps for strand cards (alpha = strands, grey: vertex colour tints).',
    sources: [KERATIN],
  },
  hair_clumps: {
    id: 'hair_clumps',
    kind: 'flat',
    scaleMetres: 0.05,
    roughness: 0.45,
    paint: HAIR_CLUMPS,
    description:
      'Cutout scalp-hair and beard clumps for strand cards (alpha = strands, grey: vertex colour tints).',
    sources: [KERATIN],
  },
  hair_locks: {
    id: 'hair_locks',
    row: 4, // its hash row (3) is `fur_neutral`'s
    kind: 'flat',
    scaleMetres: 0.05,
    roughness: 0.45,
    paint: HAIR_LOCKS,
    description:
      'Cutout hair locks for the opt-in lock card style: dark under-layer mass, pointed streaked locks, strays, coarse strands.',
    sources: [KERATIN],
  },
};
