// The hydra as a body plan: a low heavy trunk, a long tail, four weight-bearing legs and five necks,
// each neck carrying a head bone and a jaw bone. Every number is a design value scaled from the animals
// in README.md. Heads, jaws and feet are sculpted in `detail`, so head and jaw chains carry no swept skin.

import {
  type BodyPlanSpec,
  bodyPlan,
  type ChainSpec,
  type IntendedCrease,
  type Vec3,
} from '@developerz.ai/ts23d';
import {
  bodyRelief,
  bodyTint,
  legRelief,
  legTint,
  neckRelief,
  neckTint,
  tailRelief,
  tailTint,
} from './skin.ts';

export const NECKS = 5;
export const NECK_LINKS = 10;

export const DESIGN = {
  trunk: 2.9,
  tail: 3.3,
  /** Height of the back above the shoulder. */
  shoulder: 1.5,
  head: 0.7,
} as const;

const unit = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const along = (o: Vec3, d: Vec3, k: number): Vec3 => [
  o[0] + d[0] * k,
  o[1] + d[1] * k,
  o[2] + d[2] * k,
];

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * The section angle that faces `ref` along a chain. A chain's own frame is carried from its root and
 * ends up anywhere round a curved neck, so spine rows and belly colour are aimed from this instead.
 */
function facing(c: ChainSpec, ref: Vec3): (u: number) => number {
  const { parent: _parent, repeat: _repeat, relief: _r, tint: _t, ...free } = c;
  const rough = c.path.reduce((sum, q, i) => {
    const a = c.path[i - 1] ?? q;
    return sum + Math.hypot(q[0] - a[0], q[1] - a[1], q[2] - a[2]);
  }, 0);
  const links = bodyPlan({ name: 'probe', length: rough, chains: [free] }).chains[0]?.links ?? [];
  const angles: number[] = [];
  for (const l of links) {
    const along = dot(ref, l.twist);
    const d: Vec3 = [
      ref[0] - l.twist[0] * along,
      ref[1] - l.twist[1] * along,
      ref[2] - l.twist[2] * along,
    ];
    let a = Math.atan2(dot(d, l.pitch), dot(d, l.bend));
    const before = angles.at(-1);
    if (before !== undefined) a += Math.round((before - a) / (Math.PI * 2)) * Math.PI * 2;
    angles.push(a);
  }
  return (u) => {
    const x = Math.max(0, Math.min(angles.length - 1, u * angles.length - 0.5));
    const i = Math.min(angles.length - 2, Math.floor(x));
    if (i < 0) return angles[0] ?? 0;
    return (angles[i] ?? 0) + ((angles[i + 1] ?? 0) - (angles[i] ?? 0)) * (x - i);
  };
}

const TAU = Math.PI * 2;
const wrap = (a: number): number => a - Math.floor(a / TAU) * TAU;

/** The chain with its skin functions turned so their angle 0 faces `ref`. */
function aimed(c: ChainSpec, ref: Vec3): { chain: ChainSpec; top: (u: number) => number } {
  const top = facing(c, ref);
  const { relief, tint } = c;
  return {
    top,
    chain: {
      ...c,
      ...(relief ? { relief: (q) => relief({ ...q, angle: wrap(q.angle - top(q.u)) }) } : {}),
      ...(tint ? { tint: (q, b) => tint({ ...q, angle: wrap(q.angle - top(q.u)) }, b) } : {}),
    },
  };
}

/**
 * Corners cut twice (Chaikin), ends kept: a limb authored by its joints bends through a curve the
 * thick section can follow instead of folding on the inside of the knee.
 */
function rounded(path: readonly Vec3[], radius: readonly number[]) {
  let [p, r] = [[...path], [...radius]];
  for (let pass = 0; pass < 2; pass++) {
    const [q, s]: [Vec3[], number[]] = [[p[0] as Vec3], [r[0] as number]];
    for (let i = 0; i + 1 < p.length; i++) {
      const [a, b] = [p[i] as Vec3, p[i + 1] as Vec3];
      const [ra, rb] = [r[i] as number, r[i + 1] as number];
      const at = (t: number): Vec3 => along(a, [b[0] - a[0], b[1] - a[1], b[2] - a[2]], t);
      if (i > 0) {
        q.push(at(0.25));
        s.push(ra + (rb - ra) * 0.25);
      }
      if (i + 2 < p.length) {
        q.push(at(0.75));
        s.push(ra + (rb - ra) * 0.75);
      }
    }
    q.push(p.at(-1) as Vec3);
    s.push(r.at(-1) as number);
    [p, r] = [q, s];
  }
  return { path: p, radius: r };
}

/** A leg's dark side faces out and up; the left copy is authored, the right mirrors it. */
const OUTSIDE: Vec3 = [0, 0.75, 0.66];

const trunk: ChainSpec = {
  name: 'body',
  path: [
    [1.42, 0, 1.02],
    [0.95, 0, 1.06],
    [0.3, 0, 1.02],
    [-0.45, 0, 0.97],
    [-1.05, 0, 0.95],
    [-1.48, 0, 0.87],
  ],
  radius: [0.12, 0.48, 0.56, 0.54, 0.48, 0.3],
  links: 6,
  flatten: 0.92,
  detail: { rings: [28, 5, 2], sides: [170, 22, 12] },
  relief: bodyRelief,
  tint: bodyTint,
};

const tail: ChainSpec = {
  name: 'tail',
  parent: { chain: 'body', link: 5 },
  path: [
    [-1.32, 0, 0.9],
    [-2.0, 0.08, 0.62],
    [-2.75, -0.1, 0.42],
    [-3.45, 0.14, 0.24],
    [-4.0, -0.04, 0.11],
    [-4.36, 0.1, 0.07],
  ],
  radius: [0.27, 0.2, 0.14, 0.085, 0.04, 0.008],
  links: 12,
  bias: 1.15,
  flatten: 1.25,
  blend: 0.14,
  detail: { rings: [13, 3, 1], sides: [60, 12, 7] },
  relief: tailRelief,
  tint: tailTint,
};

const fore: ChainSpec = aimed(
  {
    name: 'fore',
    parent: { chain: 'body', link: 1 },
    repeat: { kind: 'mirror' },
    ...rounded(
      [
        [0.92, 0.26, 1.04],
        [0.84, 0.88, 0.72],
        [0.98, 1.04, 0.32],
        [1.3, 1.08, 0.08],
      ],
      [0.32, 0.21, 0.14, 0.1],
    ),
    links: 3,
    antiFold: true,
    blend: 0.16,
    detail: { rings: [22, 5, 2], sides: [52, 12, 7] },
    relief: legRelief,
    tint: legTint,
  },
  OUTSIDE,
).chain;

const hind: ChainSpec = aimed(
  {
    name: 'hind',
    parent: { chain: 'body', link: 4 },
    repeat: { kind: 'mirror' },
    ...rounded(
      [
        [-1.02, 0.27, 0.98],
        [-0.92, 0.92, 0.68],
        [-1.02, 1.1, 0.32],
        [-0.84, 1.16, 0.085],
      ],
      [0.38, 0.22, 0.145, 0.105],
    ),
    links: 3,
    antiFold: true,
    blend: 0.18,
    detail: { rings: [22, 5, 2], sides: [52, 12, 7] },
    relief: legRelief,
    tint: legTint,
  },
  OUTSIDE,
).chain;

/** One neck's pose: where its tip goes, how deep its S, where its head looks. */
export interface NeckPose {
  readonly tip: Vec3;
  /** Sideways and up bulge of the S, metres. */
  readonly bulge: number;
  readonly look: Vec3;
  readonly tone: number;
}

export const NECK_POSES: readonly NeckPose[] = [
  { tip: [2.66, -2.14, 2.0], bulge: 0.19, look: [0.86, -0.46, -0.2], tone: 0.0 },
  { tip: [2.3, -1.2, 3.16], bulge: 0.22, look: [0.92, -0.2, -0.34], tone: 0.1 },
  { tip: [2.16, 0.06, 3.8], bulge: 0.17, look: [0.97, 0.02, -0.24], tone: 0.04 },
  { tip: [2.46, 1.34, 2.92], bulge: 0.2, look: [0.9, 0.3, -0.06], tone: 0.12 },
  { tip: [2.72, 2.2, 1.84], bulge: 0.18, look: [0.82, 0.54, -0.26], tone: 0.02 },
];

export const NECK_IDS = NECK_POSES.map((_, k) => `neck_${k}`);
export const HEAD_IDS = NECK_POSES.map((_, k) => `head_${k}`);
export const JAW_IDS = NECK_POSES.map((_, k) => `jaw_${k}`);

/** Shoulder root of neck k, a row across the front of the trunk. */
export function neckRoot(k: number): Vec3 {
  const f = k / (NECKS - 1) - 0.5;
  return [0.9 - Math.abs(f) * 0.14, f * 0.72, 1.2 - Math.abs(f) * 0.08];
}

function neckPath(k: number): Vec3[] {
  const pose = NECK_POSES[k] as NeckPose;
  const r = neckRoot(k);
  const d: Vec3 = [pose.tip[0] - r[0], pose.tip[1] - r[1], pose.tip[2] - r[2]];
  const side = unit(cross(d, [0, 0, 1]));
  const up = unit(cross(side, d));
  return [0, 0.17, 0.36, 0.56, 0.76, 0.9, 1].map((t) => {
    // Leaves the shoulder forward and up, then an S: back over the shoulder, out to the head.
    // The S eases in: a thick neck cannot start it right at the shoulder.
    const ease = Math.min(1, t / 0.3) ** 2 * (3 - 2 * Math.min(1, t / 0.3));
    const s = Math.sin(t * Math.PI * 2) * (1 - t * 0.25) * ease;
    const rise = Math.sin(t * Math.PI) * 0.16;
    const out = along(r, d, t * (0.55 + 0.45 * t));
    return along(
      along(out, up, pose.bulge * s + rise),
      side,
      pose.bulge * 0.3 * s * (k % 2 ? 1 : -1),
    );
  });
}

function neckAimed(k: number) {
  const pose = NECK_POSES[k] as NeckPose;
  return aimed(neckSpec(k, pose), [0, 0, 1]);
}

/** Section angle of the top of neck k at arc fraction u: where its spine row runs. */
export const neckTop = (k: number, u: number): number => neckAimed(k).top(u);

function neckSpec(k: number, pose: NeckPose): ChainSpec {
  return {
    name: `neck_${k}`,
    parent: { chain: 'body', link: 1 },
    ...rounded(neckPath(k), [0.27, 0.215, 0.18, 0.155, 0.135, 0.12, 0.112]),
    links: NECK_LINKS,
    antiFold: true,
    blend: 0.15,
    blendWith: NECK_POSES.map((_, j) => `neck_${j}`).filter((_, j) => j !== k),
    detail: { rings: [12, 3, 1], sides: [60, 12, 7] },
    relief: neckRelief,
    tint: neckTint(pose.tone),
  };
}

/** The frame a head is sculpted in: +X toward the snout, +Z up the skull, origin at the occiput. */
export interface HeadFrame {
  readonly at: Vec3;
  readonly x: Vec3;
  readonly y: Vec3;
  readonly z: Vec3;
}

export function headFrame(k: number): HeadFrame {
  const pose = NECK_POSES[k] as NeckPose;
  const x = unit(pose.look);
  const y = unit(cross([0, 0, 1], x));
  return { at: pose.tip, x, y, z: cross(x, y) };
}

export const toWorld = (f: HeadFrame, p: Vec3): Vec3 => [
  f.at[0] + f.x[0] * p[0] + f.y[0] * p[1] + f.z[0] * p[2],
  f.at[1] + f.x[1] * p[0] + f.y[1] * p[1] + f.z[1] * p[2],
  f.at[2] + f.x[2] * p[0] + f.y[2] * p[1] + f.z[2] * p[2],
];

/** Hinge of the lower jaw, skull frame. */
export const JAW_HINGE: Vec3 = [0.03, 0, -0.06];

/** How far each mouth hangs open at rest, radians. */
export const JAW_REST: readonly number[] = [0.2, 0.09, 0.34, 0.14, 0.26];

const headChain = (k: number): ChainSpec => {
  const f = headFrame(k);
  return {
    name: `head_${k}`,
    parent: { chain: `neck_${k}`, link: NECK_LINKS - 1 },
    path: [f.at, toWorld(f, [DESIGN.head * 0.5, 0, 0]), toWorld(f, [DESIGN.head, 0, 0])],
    radius: [0.12, 0.09, 0.04],
    links: 1,
    skin: false,
  };
};

/** Jaw tip in the skull frame, opened by `a` about the hinge. */
export function jawTip(a: number): Vec3 {
  const L = DESIGN.head * 0.78;
  return [JAW_HINGE[0] + Math.cos(a) * L, 0, JAW_HINGE[2] - Math.sin(a) * L];
}

const jawChain = (k: number): ChainSpec => {
  const f = headFrame(k);
  return {
    name: `jaw_${k}`,
    parent: { chain: `head_${k}`, link: 0 },
    path: [toWorld(f, JAW_HINGE), toWorld(f, jawTip(JAW_REST[k] ?? 0.1))],
    radius: [0.08, 0.035],
    links: 1,
    skin: false,
  };
};

export const HYDRA_SPEC: BodyPlanSpec = {
  name: 'hydra',
  length: DESIGN.trunk + DESIGN.tail,
  chains: [
    trunk,
    tail,
    fore,
    hind,
    ...Array.from({ length: NECKS }, (_, k) => neckAimed(k).chain),
    ...Array.from({ length: NECKS }, (_, k) => headChain(k)),
    ...Array.from({ length: NECKS }, (_, k) => jawChain(k)),
  ],
};

export const LEG_FEET = ['fore_l', 'fore_r', 'hind_l', 'hind_r'] as const;

/** Folds of the body that are meant: behind each bent hind knee, and where a neck's first bend
 *  leaves the shoulder. Each is one fold, in a region a fraction of the limb it sits on. */
export const BODY_CREASES: readonly IntendedCrease[] = [
  ...([1, -1] as const).map((side) => ({
    name: `knee_back_${side > 0 ? 'l' : 'r'}`,
    part: 'body',
    at: [-1.035, side * 0.915, 0.515] as Vec3,
    radius: 0.13,
    why: 'the fold of skin behind a bent hind knee',
  })),
  {
    name: 'hip_top',
    part: 'body',
    at: [-1.29, 0.37, 1.23],
    radius: 0.09,
    why: 'the shallow groove where the thigh muscle meets the back',
  },
  ...(
    [
      ['neck_fold_1', [1.07, -0.38, 1.65], 0.1],
      ['neck_fold_2', [1.07, -0.04, 1.6], 0.1],
      ['neck_fold_3', [1.1, 0.41, 1.61], 0.1],
      ['neck_fold_4', [1.1, 0.57, 1.26], 0.13],
    ] as const
  ).map(([name, at, radius]) => ({
    name,
    part: 'body',
    at: at as unknown as Vec3,
    radius,
    why: 'the fold on the inside of the first bend, where this neck leaves the shoulder',
  })),
];
