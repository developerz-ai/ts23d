// King cobra (Ophiophagus hannah), 3.5 m: the front third raised in the alert stance with the long
// narrow hood spread on its ribs, the rest in loose curves on the ground. Sources: README.md.

import {
  type BodyPlan,
  type BodyPlanSpec,
  bodyPlan,
  defineAsset,
  type Mesh,
  merge,
  type Vec3,
} from '@developerz.ai/ts23d';
import {
  add,
  bonesOf,
  cross,
  declareBones,
  even,
  norm,
  scale,
  skinTo,
  sub,
} from '../_lib/body-plan-kit.ts';
import { cobraClips } from './clips.ts';
import { eyeMesh, eyePoint, headMesh, tongueMesh } from './head.ts';
import { frameAt, halfW, surfacePoint, TOTAL } from './shape.ts';
import { bodyArc, skinBody } from './skin.ts';
import type { CobraRig } from './solve.ts';
import { HOOD_RINGS, scaleSheet, scutes, trunkMesh } from './surface.ts';

const LINKS = 32;
const RIBS = HOOD_RINGS;
const linkOf = (s: number): number => Math.min(LINKS - 1, Math.floor((s / TOTAL) * LINKS));

const stationS = even(0, TOTAL, 44);
const mouth = frameAt(0.012);
const tonguePath: Vec3[] = [0, 1, 2, 3].map((i) =>
  add(add(mouth.p, scale(mouth.d, -0.006)), scale(mouth.t, -0.012 - i * 0.026)),
);

/** Hood ribs, one chain per side: the neck leaves y = 0, so a mirror across it would not fit. */
const ribChains = (s: number, i: number) => {
  const f = frameAt(s);
  return (['l', 'r'] as const).map((tag) => {
    const out = scale(f.side, f.side[1] >= 0 === (tag === 'l') ? 1 : -1);
    return {
      name: `hood_rib_${i}_${tag}`,
      parent: { chain: 'spine', link: linkOf(s) },
      path: [f.p, add(f.p, scale(out, halfW(s) * 0.94))],
      radius: [0.006, 0.003],
      links: 1,
    };
  });
};

export const SPEC: BodyPlanSpec = {
  name: 'king_cobra',
  length: TOTAL,
  chains: [
    {
      name: 'spine',
      path: stationS.map((s) => frameAt(s).p),
      radius: stationS.map((s) => Math.max(0.002, halfW(s))),
      links: LINKS,
    },
    ...RIBS.flatMap(ribChains),
    {
      name: 'tongue',
      parent: { chain: 'spine', link: 0 },
      path: tonguePath,
      radius: [0.002, 0.0015, 0.001, 0.0005],
      links: 3,
    },
  ],
};

export const PLAN: BodyPlan = bodyPlan(SPEC);
const spine = bonesOf(PLAN, 'spine');
const links = PLAN.chains[0]?.links ?? [];
const jointS = links.map((_, i) => (i / LINKS) * TOTAL);
const dorsalAt = (i: number): Vec3 => frameAt(((i + 0.5) / LINKS) * TOTAL).d;

const ribBones = PLAN.chains.filter((c) => c.spec.startsWith('hood_rib'));
export const RIG: CobraRig = {
  plan: PLAN,
  spine,
  ribs: ribBones.flatMap((c) => {
    const bone = c.links[0]?.bone;
    if (!bone) return [];
    const i = Number(c.spec.split('_')[2]);
    const out = norm(sub(bone.tail, bone.head));
    return [{ bone: bone.name, fold: norm(cross(out, frameAt(RIBS[i] ?? 0.2).t)) }];
  }),
  tongue: bonesOf(PLAN, 'tongue'),
  tongueBack: mouth.t,
};

export const CLIPS = cobraClips(RIG, SPEC, dorsalAt);
const SOURCE = 'https://doi.org/10.5852/ejt.2024.961.2681';

export const king_cobra = defineAsset({
  name: 'king_cobra',
  kind: 'creature',
  description:
    'King cobra, 3.5 m, front third raised with the long hood spread: 15-row glossy scales with pale chevron crossbands, broad ventral scutes, head shields with the paired occipitals, forked tongue; a milky pre-shed patch, a healed bite scar and scuffed tail scutes.',
  tags: ['creature', 'reptile', 'snake', 'cobra', 'animated'],
  sources: [
    SOURCE,
    'https://en.wikipedia.org/wiki/King_cobra',
    'https://commons.wikimedia.org/wiki/File:King-Cobra.jpg',
  ],
  real: { length: 0.45, width: 0.45, height: 0.78 },
  // LOD1 holds ~9 k: enough rings that the bands still resolve and the switch from 62 k is no pop.
  budget: { triangles: [72000, 11000, 640], bones: PLAN.bones.length },
  art: { grounded: false, focal: 'body' },
  // A little higher than the default 18°: the top turn and the pile's wear face the lens.
  hero: { elDeg: 24 },
  creases: [
    // Local on purpose: the mouth line each side, and the shield sutures over the crown.
    ...[0.012, 0.036, 0.06].flatMap((at) =>
      ([1, -1] as const).map((side) => ({
        name: `mouth_line_${side > 0 ? 'l' : 'r'}_${Math.round(at * 1000)}`,
        part: 'body',
        at: surfacePoint(at, side * 2),
        radius: 0.032,
        why: 'the mouth line is a real groove between the lip scales',
      })),
    ),
    ...([1, -1] as const).map((side) => ({
      name: `eye_socket_${side > 0 ? 'l' : 'r'}`,
      part: 'body',
      at: eyePoint(side),
      radius: 0.022,
      why: 'the brow fold around the eye is a real form',
    })),
    {
      name: 'occipital_suture',
      part: 'body',
      at: surfacePoint(0.072, 0),
      radius: 0.03,
      why: 'the suture between the paired occipital shields is a real groove',
    },
    {
      name: 'head_shields',
      part: 'body',
      at: surfacePoint(0.042, 0),
      radius: 0.042,
      why: 'sutures between the head shields are real grooves',
    },
  ],
  clips: CLIPS,
  build(ctx) {
    const lod = ctx.lod;
    declareBones(ctx, PLAN);
    const ribs = bonesOf(
      PLAN,
      ...PLAN.chains.filter((c) => c.spec.startsWith('hood_rib')).map((c) => c.id),
    );
    const head = spine.slice(0, 2);
    const body = (m: Mesh): Mesh =>
      skinBody(m, PLAN, {
        spine,
        ribs,
        hoodLinks: linkOf(0.5),
        window: 2,
        blend: 0.035,
        link: (p, n) => linkOf(bodyArc(p, n)),
      });
    const stiff = (m: Mesh): Mesh => skinTo(m, PLAN, head, 0.02);
    const tongueBones = bonesOf(PLAN, 'tongue');
    ctx.part(
      'body',
      merge([
        stiff(headMesh(lod)),
        stiff(eyeMesh(1, lod)),
        stiff(eyeMesh(-1, lod)),
        body(trunkMesh(lod, jointS)),
        ...(lod === 0 ? [body(scaleSheet()), body(scutes())] : []),
        ...tongueMesh(tonguePath, lod).map((m) => skinTo(m, PLAN, tongueBones, 0.01)),
      ]),
    );
  },
});
