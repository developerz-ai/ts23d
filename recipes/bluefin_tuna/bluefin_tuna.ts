// Atlantic bluefin tuna (Thunnus thynnus), 2 m fork length: fusiform, metallic blue over silver, yellow
// finlets, a crescent tail on keels. Body-plan skeleton with the tuna swim preset. Sources: README.md.

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
  anal,
  dorsal1,
  dorsal2,
  dorsalSpines,
  finlets,
  HEIGHT,
  LOWER_TIP,
  lowerLobe,
  pectoral,
  pectoralBase,
  pectoralTip,
  pelvics,
  TAIL_ROOT,
  UPPER_TIP,
  upperLobe,
} from './fins.ts';
import { eye, FL, T_TAIL, tOf, trunk, xOf, Z0 } from './shape.ts';

const LINKS = 16;
const BIAS = 1.3;
const linkAt = (t: number): number => {
  const u = t / T_TAIL;
  for (let i = LINKS - 1; i >= 0; i--) if (1 - (1 - i / LINKS) ** BIAS <= u) return i;
  return 0;
};
const lerp3 = (a: Vec3, b: Vec3, k: number): Vec3 => [
  mix(a[0], b[0], k),
  mix(a[1], b[1], k),
  mix(a[2], b[2], k),
];
/** Lobe bones run rearward through the fin: a bone raked out to the tip has no lever on the beat,
 *  so the trunk would have to swing the head past the gate's 0.35 to reach the tail amplitude. */
const lobeEnd = (tip: Vec3): Vec3 => [tip[0], 0, Z0 + (tip[2] - Z0) * 0.4];
const lobeChain = (name: string, tip: Vec3) => ({
  name,
  parent: { chain: 'spine', link: LINKS - 1 },
  path: [TAIL_ROOT, lerp3(TAIL_ROOT, lobeEnd(tip), 0.5), lobeEnd(tip)],
  radius: [0.02, 0.012, 0.002],
  flatten: 5,
  links: 2,
});

export const SPEC: BodyPlanSpec = {
  name: 'bluefin_tuna',
  length: FL,
  chains: [
    {
      name: 'spine',
      path: [0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85, T_TAIL].map((t): Vec3 => [xOf(t), 0, Z0]),
      radius: [0.005, 0.11, 0.2, 0.22, 0.19, 0.12, 0.05, 0.016],
      links: LINKS,
      bias: BIAS,
    },
    lobeChain('caudal_upper', UPPER_TIP),
    lobeChain('caudal_lower', LOWER_TIP),
    {
      name: 'pectoral',
      parent: { chain: 'spine', link: linkAt(0.285) },
      repeat: { kind: 'mirror' },
      path: [pectoralBase(1), lerp3(pectoralBase(1), pectoralTip(1), 0.5), pectoralTip(1)],
      radius: [0.05, 0.035, 0.005],
      flatten: 0.15,
      links: 2,
    },
  ],
};

export const PLAN: BodyPlan = bodyPlan(SPEC);

export const CLIPS = swimClips(PLAN, {
  chain: 'spine',
  preset: 'tuna',
  caudal: ['caudal_upper', 'caudal_lower'],
  pectoral: ['pectoral_l', 'pectoral_r'],
});

const spine = bonesOf(PLAN, 'spine');
const joints = (PLAN.chains[0]?.links ?? []).map((l) => tOf(l.bone.head[0]));
const BLEND = 0.04;

export const bluefin_tuna = defineAsset({
  name: 'bluefin_tuna',
  kind: 'creature',
  medium: 'water',
  description:
    'Atlantic bluefin tuna, 2 m fork length: fusiform body, metallic blue back over silver flank, yellow finlets, short pectorals, crescent tail with caudal keels.',
  tags: ['creature', 'fish', 'tuna', 'marine', 'animated', 'swim'],
  sources: [
    'https://www.fao.org/4/ap889e/ap889e.pdf',
    'https://doi.org/10.1098/rsos.190203',
    'https://commons.wikimedia.org/wiki/File:Bluefin-big.jpg',
  ],
  creases: [
    ...([1, -1] as const).flatMap((s) => [
      {
        name: s > 0 ? 'head_l' : 'head_r',
        part: 'body',
        at: [xOf(0.15), 0.1 * s, Z0 - 0.02] as Vec3,
        radius: 0.34,
        why: 'mouth line, gill cover and eye socket are real grooves in the head',
      },
    ]),
  ],
  real: {
    length: 2.14,
    width: 0.56,
    height: 1.07,
    measures: [
      {
        label: 'body depth, 26 % FL (24 to 28)',
        axis: 'z',
        value: 0.52,
        parts: ['body'],
        source: 'https://www.fao.org/4/ap889e/ap889e.pdf',
      },
      {
        label: 'second dorsal height, 15.5 % FL (14 to 17), root sunk 2 cm',
        axis: 'z',
        value: HEIGHT.dorsal2 + 0.018,
        parts: ['fin_dorsal_2'],
        source: 'https://www.fao.org/4/ap889e/ap889e.pdf',
      },
      {
        label: 'anal height, 14.5 % FL (13 to 16), root sunk 2 cm',
        axis: 'z',
        value: HEIGHT.anal + 0.018,
        parts: ['fin_anal'],
        source: 'https://www.fao.org/4/ap889e/ap889e.pdf',
      },
    ],
  },
  budget: { triangles: [38000, 4700, 560], bones: PLAN.bones.length },
  art: { grounded: false },
  clips: CLIPS,
  build(ctx) {
    const lod = ctx.lod;
    declareBones(ctx, PLAN);
    const part = (name: string, mesh: Mesh, bones: readonly string[], blend = BLEND): void => {
      ctx.part(name, skinTo(mesh, PLAN, bones, blend));
    };
    const head = spine.slice(0, 3);
    ctx.part(
      'body',
      merge([
        skinTo(trunk(joints, lod), PLAN, spine, BLEND),
        skinTo(eye(1, lod), PLAN, head, 0.02),
        skinTo(eye(-1, lod), PLAN, head, 0.02),
      ]),
    );
    part('fin_dorsal_1', dorsal1(lod), spine);
    part('fin_dorsal_2', dorsal2(lod), spine);
    part('fin_anal', anal(lod), spine);
    const small = [...finlets(lod), ...pelvics(lod), ...dorsalSpines(lod)];
    part('fins_small', merge(small), spine);
    for (const [s, sign] of [
      ['l', 1],
      ['r', -1],
    ] as const)
      part(
        `pectoral_fin_${s}`,
        pectoral(sign, lod),
        [...bonesOf(PLAN, `pectoral_${s}`), spine[linkAt(0.28)] ?? ''],
        0.04,
      );
    const tail = spine.slice(-3);
    ctx.part(
      'caudal_fin',
      merge([
        skinTo(upperLobe(lod), PLAN, [...bonesOf(PLAN, 'caudal_upper'), ...tail], 0.03),
        skinTo(lowerLobe(lod), PLAN, [...bonesOf(PLAN, 'caudal_lower'), ...tail], 0.03),
      ]),
    );
  },
});
