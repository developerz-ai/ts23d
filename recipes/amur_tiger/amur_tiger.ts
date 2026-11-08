// Amur tiger — an adult male Panthera tigris altaica standing relaxed, sculpted from code on a real
// skeleton (README.md: measurements, anatomy plates, photos per view, stripe logic). This entry
// wires the body-part modules into the engine contract (parts, pivots, baked motion), declares
// the real numbers, budgets and the LOD policy. Stages, one module each:
//   skeleton.ts landmarks → torso.ts + legs.ts + paws.ts masses → head.ts + face.ts + ruff.ts →
//   ears.ts, eyes.ts, jaw.ts, teeth.ts → fur.ts clumps/relief → zones.ts + stripes.ts + coat.ts +
//   mask.ts paint → tone (the shared painted-tone pass).

import { defineAsset, type Mesh, place, type Vec3 } from '@developerz.ai/ts23d';
import { EFFECTIVE_DENSITY } from './biology.ts';
import { bodyMesh } from './body.ts';
import { EAR, earMesh } from './ears.ts';
import { eyeMesh } from './eyes.ts';
import { headMeshes } from './head.ts';
import { jawMesh } from './jaw.ts';
import { clawMesh, pawCreases } from './paws.ts';
import { HEAD, HEAD_PITCH, HEAD_PIVOT, HEAD_SCALE, headToWorld, REAL } from './skeleton.ts';
import { TAIL_PIVOT, tailMesh } from './tail.ts';

const flipY = (m: Mesh): Mesh => place(m, { scale: [1, -1, 1] });
const flip = (p: Vec3): Vec3 => [p[0], -p[1], p[2]];

export const amur_tiger = defineAsset({
  name: 'amur_tiger',
  kind: 'creature',
  description:
    'Adult male Amur (Siberian) tiger standing relaxed: 1.95 m head and body, 0.99 m tail, 1.0 m at the shoulder; winter coat with cheek ruff, seeded asymmetric stripes, sculpted from code on a real skeleton',
  tags: ['creature', 'animal', 'mammal', 'big-cat', 'tiger', 'sculpt', 'hero'],
  license: 'CC0-1.0',
  sources: [
    'https://en.wikipedia.org/wiki/Siberian_tiger (Kerley et al. 2005 lengths; Slaght et al. 2005, Mazák 1981 masses; Geptner & Sludskij 1972 fur)',
    'https://en.wikipedia.org/wiki/Tiger (shoulder height, skull, canines, claws, coat)',
    'Gu et al. 2014, Amur tiger footprints in snow (front pad width, after Miquelle et al. 2006)',
    'George Stubbs, Comparative Anatomical Exposition … Tiger (1795–1806), PD plates on Wikimedia Commons',
    'recipes/amur_tiger/README.md (dossier, photos per view)',
  ],
  // Overall box of the pose (nose → hanging tail, ruff to ruff, paws → withers), measured off the
  // skeleton built from the sourced numbers; the sourced numbers themselves are the measures and
  // the recipe test (head + body 1.95, tail 0.99, shoulder 1.0, mass).
  real: {
    length: 2.22,
    width: 0.47,
    height: 1.01,
    tolerance: 0.05,
    mass: REAL.mass,
    massTolerance: 0.25,
    measures: [
      {
        label: 'shoulder height (withers, coat included)',
        value: REAL.shoulder,
        axis: 'z',
        parts: ['body'],
        source: 'Wikipedia: Tiger — 0.8–1.1 m at the shoulder',
      },
    ],
  },
  // Folds that are anatomy, not seams (QA connections skips them): the mouth line and the
  // nostrils, the lip and tongue inside the mouth, the fur partings between the toes.
  creases: [
    {
      name: 'mouth_line',
      part: 'head',
      at: headToWorld([0.26, 0, HEAD.mouthZ]),
      radius: 0.09,
      why: 'the lip line where the upper jaw closes',
    },
    {
      name: 'nostrils',
      part: 'head',
      at: headToWorld(HEAD.nose),
      radius: 0.035,
      why: 'nostrils bored into the nose leather',
    },
    {
      name: 'mouth',
      part: 'jaw',
      at: headToWorld([0.2, 0, HEAD.mouthZ]),
      radius: 0.13,
      why: 'lower lip, tongue and mouth floor',
    },
    {
      name: 'gape',
      part: 'head',
      at: headToWorld([0.15, 0, HEAD.mouthZ + 0.015]),
      radius: 0.085,
      why: 'mouth corners and the pocket the lower jaw closes into',
    },
    {
      name: 'eyelids',
      part: 'head',
      at: headToWorld(HEAD.eye),
      radius: 0.03,
      why: 'lid folds round the eyeball',
    },
    {
      name: 'eyelids_r',
      part: 'head',
      at: headToWorld([HEAD.eye[0], -HEAD.eye[1], HEAD.eye[2]]),
      radius: 0.03,
      why: 'lid folds round the eyeball',
    },
    // The fold between the hind legs runs along the midline from the belly to under the tail:
    // small regions strung on it (QA reads ≥ 80 % of the fold's trace inside them).
    ...Array.from({ length: 8 }, (_, k) => ({
      name: `groin_${k}`,
      part: 'body',
      at: [-0.5 - k * 0.05, 0, 0.52 + k * 0.012] as const,
      radius: 0.07,
      why: 'the fold between the hind legs under the belly',
    })),
    {
      name: 'flank_fold_l',
      part: 'body',
      at: [-0.56, 0.13, 0.5],
      radius: 0.09,
      why: 'the stifle fold where the thigh leaves the belly',
    },
    {
      name: 'flank_fold_r',
      part: 'body',
      at: [-0.56, -0.13, 0.5],
      radius: 0.09,
      why: 'the stifle fold where the thigh leaves the belly',
    },
    ...(['l', 'r'] as const).flatMap((s) => {
      const k = s === 'l' ? 1 : -1;
      return [
        {
          name: `axilla_${s}`,
          part: 'body',
          at: [0.49, 0.085 * k, 0.41] as Vec3,
          radius: 0.1,
          why: 'armpit: the fore leg leaving the brisket',
        },
        {
          name: `carpus_${s}`,
          part: 'body',
          at: [0.5, 0.125 * k, 0.12] as Vec3,
          radius: 0.065,
          why: 'the carpal fold above the paw and the dewclaw',
        },
        {
          name: `hock_${s}`,
          part: 'body',
          at: [-0.705, 0.12 * k, 0.235] as Vec3,
          radius: 0.05,
          why: 'the flexion fold at the front of the hock',
        },
      ];
    }),
    ...pawCreases(),
  ],
  // The mesh is the coat's outer surface: fill it with flesh under a 2 cm hair shell (biology.ts).
  physics: { density: { plain: EFFECTIVE_DENSITY } },
  // LOD0 sculpt cells: body 1.05 cm, head 4.2 mm, ears 3.2 mm; LOD1 2.4 cm / 9.5 mm; LOD2 5.2 cm.
  budget: { triangles: [150000, 30000, 3000] },
  // Shape language as measured: rounded masses dominate a relaxed big cat's outline (claws and teeth
  // sheathed; the threat reads in the face, not the silhouette).
  art: { focal: 'head', shape: 'friendly', grounded: true },
  build(ctx) {
    const lod = ctx.lod;
    ctx.part('body', bodyMesh(lod));
    if (lod !== 2) ctx.part('claws', clawMesh(lod), { connect: { as: 'grown', to: 'body' } });
    ctx.part('tail', tailMesh(lod), {
      at: TAIL_PIVOT,
      motion: { kind: 'sway', axis: [0, 0, 1], degrees: 6, hz: 0.2 },
      clearOf: ['body'],
    });
    ctx.part('head', headMeshes(lod).mesh, { at: HEAD_PIVOT });
    const hinge = headToWorld(HEAD.hinge);
    ctx.part('jaw', jawMesh(lod), {
      at: hinge,
      motion: { kind: 'sway', axis: [0, 1, 0], degrees: 6, hz: 0.3, oneWay: true },
      clearOf: ['head', 'body'],
    });
    // Eyes: the far LOD's coarse skull closes the orbits, so LOD2 paints no balls.
    const eye = headToWorld(HEAD.eye);
    if (lod !== 2) {
      ctx.part('eye_l', eyeMesh(lod, 1), { at: eye });
      ctx.part('eye_r', eyeMesh(lod, -1), { at: flip(eye) });
    }
    // Ears: authored about their base in the head frame, pitched with the head.
    const ear = earMesh(lod);
    const base = EAR.base;
    const local = place(ear, { at: [-base[0], -base[1], -base[2]] });
    ctx.part('ear_l', place(local, { pitch: HEAD_PITCH, scale: HEAD_SCALE }), {
      at: headToWorld(base),
      connect: { as: 'grown', to: 'head' },
    });
    ctx.part('ear_r', place(flipY(local), { pitch: HEAD_PITCH, scale: HEAD_SCALE }), {
      at: flip(headToWorld(base)),
      connect: { as: 'grown', to: 'head' },
    });
  },
});
