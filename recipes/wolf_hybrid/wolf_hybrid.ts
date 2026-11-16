// Hybrid grey wolf: code owns the animal, a model adds the skin. The creature kind builds the
// sourced wolf (spec.ts: skeleton, proportions, stance, mass, rig, LODs, QA — identical to
// recipes/wolf); then an image-to-3D model's wolf (surface.ts: concept image → Pixal3D mesh, both
// from the committed cache under neural/) is registered onto it (register.ts: body, then head by
// landmarks, neck bent between) and gives the coat its head, ruff and colour (blend.ts); legs,
// tail, paws, rig and mass stay the code's. With no cache — a fresh clone without
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
import { hybridOf, hybridSolid } from './blend.ts';
import { buriedIn, shareOf, volume } from './masks.ts';
import { hybridCards } from './ride.ts';
import { REAL, WOLF } from './spec.ts';
import { BLEND } from './surface.ts';

const FUR = defineMaterial(CREATURE_MATERIALS.fur_neutral);

const code = defineCreature({
  name: 'wolf_hybrid',
  description:
    'Hybrid grey wolf (Canis lupus lupus): the code-built creature-kind wolf (1.15 m head and body, 0.80 m at the shoulder, 40 kg; skeleton, rig, legs, tail, mass) wearing an image-to-3D model surface (Pixal3D, MIT) from the committed neural cache: the model head, ruff and coat colour registered onto the code skeleton',
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

/** The solid coat the model is registered onto and reshapes (LOD2 has no separate jaw); the
 *  cards ride it. Eyes and claws stay the code's. */
const SOLID = ['body', 'head', 'jaw'];
const CARDS = new Set(['fur', 'head_fur']);

interface Call {
  readonly name: string;
  readonly mesh: Mesh | null;
  readonly o: PartOptions | undefined;
  readonly at: Vec3;
}

/**
 * Build the code wolf into a buffer (parts and bones), register the model onto its solid coat,
 * then emit every part (in the kind's order) with the coat reshaped and recoloured. Parts are
 * placed by translation only (the kind bakes pitches into meshes), so a part's world offset is
 * its `at` plus its parents'.
 */
function buildHybrid(ctx: BuildContext): void {
  const calls: Call[] = [];
  const ats = new Map<string, Vec3>();
  const bones: string[] = [];
  const heads = new Map<string, Vec3>();
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
  wrapped.bone = (name, o) => {
    bones.push(name);
    heads.set(name, o.head);
    return ctx.bone(name, o);
  };
  code.build(wrapped);
  const find = (name: string): Call | undefined => calls.find((c) => c.name === name && c.mesh);
  const solid = SOLID.map(find).filter((c): c is Call & { mesh: Mesh } => !!c?.mesh);
  const head = find('head');
  const eye = find('eye_l');
  const eyeR = find('eye_r');
  const neckBase = heads.get('neck_0');
  const atlas = heads.get('head');
  const world = (c: { mesh: Mesh; at: Vec3 }): Mesh => place(c.mesh, { at: c.at });
  const h =
    find('body') && head?.mesh && neckBase && atlas
      ? hybridOf(ctx, {
          target: merge(solid.map(world)),
          head: world({ mesh: head.mesh, at: head.at }),
          eyes:
            eye?.mesh && eyeR
              ? {
                  l: eye.at,
                  r: eyeR.at,
                  radius: Math.max(...eye.mesh.positions.filter((_, i) => i % 3 === 0)),
                }
              : null,
          neckBase,
          atlas,
        })
      : null;
  if (!h) {
    for (const c of calls) ctx.part(c.name, c.mesh, c.o);
    return;
  }
  const moved = new Map(
    solid.map((c) => [
      c.name,
      hybridSolid(
        c.mesh,
        c.at,
        h,
        shareOf(c.mesh, bones, c.name === 'body'),
        buriedIn(c.mesh, c.at, solid.filter((o) => o !== c).map(world)),
        c.name === 'body' ? BLEND.smooth.body : BLEND.smooth.head,
        c.name === 'body' ? BLEND.torso : c.name === 'jaw' ? BLEND.jaw : BLEND.face,
      ),
    ]),
  );
  const before = merge(solid.map(world));
  const after = merge(solid.map((c) => place(moved.get(c.name) ?? c.mesh, { at: c.at })));
  for (const c of calls) {
    const solidMesh = moved.get(c.name);
    // Code owns the mass: the model's extra volume is coat (ruff, cheek fur), so a reshaped part
    // keeps the code part's mass (density × its old volume ÷ its new one) and the sourced mass
    // and fore share stay the code's.
    const o =
      solidMesh && c.mesh && c.o?.density
        ? { ...c.o, density: (c.o.density * volume(c.mesh)) / volume(solidMesh) }
        : c.o;
    ctx.part(
      c.name,
      solidMesh ??
        (c.mesh && CARDS.has(c.name) ? hybridCards(c.mesh, c.at, before, after, h) : c.mesh),
      o,
    );
  }
}

export const wolf_hybrid = defineAsset({
  ...code,
  build: buildHybrid,
});
