// Hybrid grey wolf: code owns the animal, a model adds the skin. The creature kind builds the
// sourced wolf (spec.ts: skeleton, proportions, stance, mass, rig, LODs, QA — identical to
// recipes/wolf); then the body's surface takes the high-pass of an image-to-3D model's wolf
// (surface.ts: concept image → Pixal3D mesh, both from the committed cache under neural/,
// prompts and seeds as code in concept.ts / surface.ts). With no cache — a fresh clone without
// neural/, the gallery, a GPU-less CI — every request misses and this IS the CPU wolf.

import {
  type BuildContext,
  CREATURE_MATERIALS,
  defineAsset,
  defineCreature,
  defineMaterial,
  type Mesh,
  merge,
  type PartOptions,
  place,
  type Vec3,
} from '@developerz.ai/ts23d';
import { REAL, WOLF } from './spec.ts';
import { hybridOf, hybridPart } from './surface.ts';

const FUR = defineMaterial(CREATURE_MATERIALS.fur_neutral);

const code = defineCreature({
  name: 'wolf_hybrid',
  description:
    'Hybrid grey wolf (Canis lupus lupus): the code-built creature-kind wolf (1.15 m head and body, 0.80 m at the shoulder, 40 kg) with an image-to-3D model surface (Pixal3D, MIT) blended under it as high-pass detail from the committed neural cache',
  tags: ['creature', 'animal', 'mammal', 'canid', 'wolf', 'sculpt', 'neural', 'hybrid'],
  license: 'CC0-1.0',
  sources: [
    'https://en.wikipedia.org/wiki/Wolf (length, shoulder height, tail, mass, skull, ears, fur, colour)',
    'recipes/wolf/README.md (the code wolf’s dossier) · recipes/wolf_hybrid/README.md (the hybrid)',
    'surface: Pixal3D (TencentARC, MIT) via recipes/wolf_hybrid/neural/ record.json',
  ],
  spec: WOLF,
  options: { strip: FUR },
  real: {
    length: 1.31,
    width: 0.29,
    height: 0.9,
    tolerance: 0.05,
    mass: REAL.mass,
    massTolerance: 0.25,
  },
  budget: { triangles: [150000, 35000, 4000] },
  art: { focal: 'head', shape: 'friendly', grounded: true },
});

/** The coat: parts the model surface reshapes and recolours (eyes and claws stay the code's). */
const COAT = new Set(['body', 'fur', 'head', 'head_fur', 'jaw']);
/** The solid coat the model is registered onto. */
const TARGET = ['body', 'head', 'jaw'];

/**
 * Build the code wolf into a buffer, register the model onto its solid coat, then emit every part
 * (in the kind's order) with the coat reshaped and recoloured. Parts are placed by translation
 * only (the kind bakes pitches into meshes), so a part's world offset is its `at` plus its
 * parents'.
 */
function buildHybrid(ctx: BuildContext): void {
  const calls: { name: string; mesh: Mesh | null; o: PartOptions | undefined; at: Vec3 }[] = [];
  const ats = new Map<string, Vec3>();
  const wrapped: BuildContext = Object.create(ctx);
  wrapped.part = (name, mesh, o) => {
    const parent = o?.parent ? (ats.get(o.parent) ?? [0, 0, 0]) : [0, 0, 0];
    const at: Vec3 = [
      (o?.at?.[0] ?? 0) + parent[0],
      (o?.at?.[1] ?? 0) + parent[1],
      (o?.at?.[2] ?? 0) + parent[2],
    ];
    ats.set(name, at);
    calls.push({ name, mesh, o, at });
  };
  code.build(wrapped);
  const solid = calls.filter((c) => TARGET.includes(c.name) && c.mesh);
  const target = solid.length ? merge(solid.map((c) => place(c.mesh as Mesh, { at: c.at }))) : null;
  const h = target ? hybridOf(ctx, target) : null;
  for (const c of calls)
    ctx.part(
      c.name,
      h && c.mesh && COAT.has(c.name)
        ? hybridPart(c.mesh, c.at, h, TARGET.includes(c.name))
        : c.mesh,
      c.o,
    );
}

export const wolf_hybrid = defineAsset({
  ...code,
  build: buildHybrid,
});
