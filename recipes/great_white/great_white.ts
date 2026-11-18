// White shark (Carcharodon carcharias), adult female, 4.5 m natural total length: a body-plan skeleton
// and the published swim clips on a hand-sculpted skin. Numbers and photos: README.md.

import {
  type BodyPlan,
  type BodyPlanSpec,
  bodyPlan,
  defineAsset,
  type Mesh,
  merge,
  swimClips,
  type Vec3,
} from '@developerz.ai/ts23d';
import { bonesOf, declareBones, mix, skinTo } from '../_lib/body-plan-kit.ts';
import {
  axisZ,
  L,
  T_CAUDAL,
  T_DORSAL,
  T_PECTORAL,
  topZ,
  undersideZ,
  X_HINGE,
  X_MOUTH,
  xOf,
  Z0,
} from './anatomy.ts';
import {
  CAUDAL_ROOT,
  DORSAL,
  DORSAL_TIP,
  dorsalFin,
  FORK,
  LOWER_TIP,
  lowerLobe,
  pectoralFin,
  pectoralRoot,
  pectoralTip,
  UPPER_TIP,
  upperLobe,
} from './fins.ts';
import { lowerJawFull, upperJaw } from './jaws.ts';
import { scars } from './skin-detail.ts';
import { eyeMesh, faceDetail, smallFins, trunkMesh } from './trunk.ts';

const LINKS = 16;
const BIAS = 1.25;

/** The spine link whose span holds body fraction t. */
function linkAt(t: number): number {
  const u = t / T_CAUDAL;
  for (let i = LINKS - 1; i >= 0; i--) if (1 - (1 - i / LINKS) ** BIAS <= u) return i;
  return 0;
}

const lerp3 = (a: Vec3, b: Vec3, k: number): Vec3 => [
  mix(a[0], b[0], k),
  mix(a[1], b[1], k),
  mix(a[2], b[2], k),
];

const spineAt = (t: number): Vec3 => [xOf(t), 0, axisZ(t)];
const hingeZ = undersideZ(X_HINGE, 0) + 0.05;
const dorsalBase: Vec3 = [xOf(T_DORSAL) - 0.2, 0, topZ(T_DORSAL) - 0.01];
const pecBase = pectoralRoot(1, T_PECTORAL + 0.045);

export const SPEC: BodyPlanSpec = {
  name: 'great_white',
  length: L,
  chains: [
    {
      name: 'spine',
      path: [0, 0.06, 0.15, 0.3, 0.45, 0.6, 0.72, 0.8, T_CAUDAL].map(spineAt),
      radius: [0.01, 0.17, 0.32, 0.41, 0.4, 0.31, 0.2, 0.11, 0.06],
      links: LINKS,
      bias: BIAS,
    },
    {
      name: 'caudal_upper',
      parent: { chain: 'spine', link: LINKS - 1 },
      path: [CAUDAL_ROOT, lerp3(lerp3(CAUDAL_ROOT, FORK, 0.5), UPPER_TIP, 0.5), UPPER_TIP],
      radius: [0.035, 0.022, 0.003],
      flatten: 6,
      links: 3,
    },
    {
      name: 'caudal_lower',
      parent: { chain: 'spine', link: LINKS - 1 },
      path: [CAUDAL_ROOT, lerp3(lerp3(CAUDAL_ROOT, FORK, 0.5), LOWER_TIP, 0.5), LOWER_TIP],
      radius: [0.03, 0.02, 0.003],
      flatten: 6,
      links: 2,
    },
    {
      name: 'dorsal',
      parent: { chain: 'spine', link: linkAt(T_DORSAL + 0.045) },
      path: [dorsalBase, lerp3(dorsalBase, DORSAL_TIP, 0.5), DORSAL_TIP],
      radius: [0.03, 0.02, 0.003],
      flatten: 6,
      links: 2,
    },
    {
      name: 'pectoral',
      parent: { chain: 'spine', link: linkAt(T_PECTORAL + 0.045) },
      repeat: { kind: 'mirror' },
      path: [pecBase, lerp3(pecBase, pectoralTip(1), 0.5), pectoralTip(1)],
      radius: [0.2, 0.13, 0.02],
      flatten: 0.12,
      links: 2,
    },
    {
      name: 'jaw_lower',
      parent: { chain: 'spine', link: linkAt(0.12) },
      path: [
        [X_HINGE, 0, hingeZ],
        [X_MOUTH - 0.02, 0, undersideZ(X_MOUTH - 0.02, 0) + 0.05],
      ],
      radius: [0.1, 0.05],
      links: 1,
    },
    {
      name: 'jaw_upper',
      parent: { chain: 'spine', link: linkAt(0.09) },
      path: [
        [X_MOUTH - 0.2, 0, undersideZ(X_MOUTH - 0.2, 0) + 0.075],
        [X_MOUTH - 0.03, 0, undersideZ(X_MOUTH - 0.03, 0) + 0.075],
      ],
      radius: [0.05, 0.03],
      links: 1,
    },
  ],
};

export const PLAN: BodyPlan = bodyPlan(SPEC);

/** Cruise from drone-measured white sharks (0.43 Hz): README, motion table. */
export const CRUISE_HZ = 0.43;

export const CLIPS = swimClips(PLAN, {
  chain: 'spine',
  preset: 'shark',
  params: { cruiseHz: CRUISE_HZ },
  caudal: ['caudal_upper', 'caudal_lower'],
  pectoral: ['pectoral_l', 'pectoral_r'],
  jaw: { lower: 'jaw_lower', upper: 'jaw_upper', headLength: 0.24 * L },
});

const spine = bonesOf(PLAN, 'spine');
const tailEnd = spine.slice(-3);
const BLEND = 0.09;

export const great_white = defineAsset({
  name: 'great_white',
  kind: 'creature',
  medium: 'water',
  description:
    'Adult female white shark, 4.5 m: conical snout, five gill slits, black eye, serrated-tooth jaws that protrude in the bite, sharp countershading, crescent tail with keel.',
  tags: ['creature', 'fish', 'shark', 'marine', 'animated', 'swim'],
  sources: [
    'https://doi.org/10.1371/journal.pone.0348174',
    'https://commons.wikimedia.org/wiki/File:White_shark.jpg',
    'https://en.wikipedia.org/wiki/Great_white_shark',
    'https://publikace.nm.cz/en/file/39e05b0c91119b5d713179f5aee0777b/15231/175-2006-DeMaddalena.pdf',
  ],
  real: {
    length: 4.5,
    width: 1.77,
    height: 1.49,
    measures: [
      {
        label: 'body width at 4.5 m, 0.197 TL - 4.84 cm (drone frontal span)',
        axis: 'y',
        value: 0.838,
        parts: ['body'],
        source: 'https://doi.org/10.1371/journal.pone.0348174',
      },
      {
        label: 'first dorsal length, origin to free rear tip (10.9 % of natural TL)',
        axis: 'x',
        value: DORSAL.length,
        parts: ['dorsal_fin'],
        source: 'recipes/great_white/README.md, Lausanne specimen (unverified search excerpt)',
      },
    ],
  },
  creases: [
    {
      name: 'mouth_line',
      part: 'body',
      at: [X_MOUTH - 0.15, 0, undersideZ(X_MOUTH - 0.15, 0)],
      radius: 0.5,
      why: 'the lip of the mouth pocket is a real fold',
    },
    ...([1, -1] as const).map((s) => ({
      name: s > 0 ? 'gill_slits_l' : 'gill_slits_r',
      part: 'body',
      at: [xOf(0.215), 0.37 * s, Z0 - 0.04] as Vec3,
      radius: 0.5,
      why: 'five gill slits are real grooves in the skin',
    })),
  ],
  budget: { triangles: [68000, 8000, 780], bones: PLAN.bones.length },
  art: { grounded: false },
  clips: CLIPS,
  build(ctx) {
    const lod = ctx.lod;
    declareBones(ctx, PLAN);
    const part = (name: string, mesh: Mesh, bones: readonly string[], blend = BLEND): void => {
      ctx.part(name, skinTo(mesh, PLAN, bones, blend));
    };
    const head = spine.slice(0, 3);
    part(
      'body',
      merge([
        skinTo(trunkMesh(PLAN, lod), PLAN, spine, BLEND),
        skinTo(eyeMesh(1, lod), PLAN, head, 0.03),
        skinTo(eyeMesh(-1, lod), PLAN, head, 0.03),
        ...faceDetail(lod, ctx.rng).map((m) => skinTo(m, PLAN, head, 0.03)),
        ...(lod === 0 ? scars(ctx.rng).map((m) => skinTo(m, PLAN, spine, BLEND)) : []),
        ...smallFins(lod).map((m) => skinTo(m, PLAN, spine, BLEND)),
      ]),
      spine,
    );
    part('jaw_lower', lowerJawFull(lod), bonesOf(PLAN, 'jaw_lower'));
    part('jaw_upper', upperJaw(lod), bonesOf(PLAN, 'jaw_upper'));
    part(
      'dorsal_fin',
      dorsalFin(lod),
      [...bonesOf(PLAN, 'dorsal'), spine[linkAt(0.43)] ?? ''],
      0.08,
    );
    for (const [s, sign] of [
      ['l', 1],
      ['r', -1],
    ] as const)
      part(
        `pectoral_fin_${s}`,
        pectoralFin(sign, lod),
        [...bonesOf(PLAN, `pectoral_${s}`), spine[linkAt(0.3)] ?? ''],
        0.1,
      );
    part(
      'caudal_fin',
      merge([
        skinTo(upperLobe(lod), PLAN, [...bonesOf(PLAN, 'caudal_upper'), ...tailEnd], 0.07),
        skinTo(lowerLobe(lod), PLAN, [...bonesOf(PLAN, 'caudal_lower'), ...tailEnd], 0.07),
      ]),
      [...bonesOf(PLAN, 'caudal_upper', 'caudal_lower'), ...tailEnd],
      0.07,
    );
  },
});
