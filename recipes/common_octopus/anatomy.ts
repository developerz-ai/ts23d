// The octopus as a body plan: sourced lengths (README table), a mantle leaning back from the head,
// and eight arms laid out one by one so no two curl alike. An arm is integrated from its heading along
// the arc, which keeps its length exact whatever the curl. Everything here is rest pose.

import type { BodyPlanSpec, ChainSpec, Vec3 } from '@developerz.ai/ts23d';
import { bodyPlan, createRng, dmath } from '@developerz.ai/ts23d';
import { armRelief, armTint, headRelief, mantleRelief, mantleTint, regenTint } from './skin.ts';

export const REAL = {
  /** FAO maximum for females. */
  total: 1.2,
  /** Wikipedia maximum. */
  mantle: 0.25,
  /** 75 % of the total, inside Naturalis' 70 to 85 %. */
  arm: 0.9,
  /** What is left between mantle and arm crown (derived). */
  head: 0.05,
} as const;

/** "Dorsal pair of arms slightly shorter" (FAO); how much is a design value. */
export const DORSAL_ARM = 0.86;
/**
 * Arm 6 lost its outer fifth (to a predator, a moray or a fish) and is regrowing it: a design
 * value. Octopuses regrow lost arm tips; the new tip is thinner and paler than the stump it grows
 * from (README: widely reported, no paper opened, so these lengths are design values).
 */
export const REGEN_ARM = 6;
export const REGEN_LENGTH = 0.74;
/** Where on the regenerating arm the old arm ends and the regrowth begins, arc fraction. */
export const REGEN_FROM = 0.8;
export const ARMS = 8;
export const ARM_LINKS = 16;
const ARM_BASE_RADIUS = 0.043;
const ARM_TIP_RADIUS = 0.0022;
const SEED = 1797;

const unit = (v: Vec3): Vec3 => {
  const l = dmath.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const along = (o: Vec3, d: Vec3, k: number): Vec3 => [
  o[0] + d[0] * k,
  o[1] + d[1] * k,
  o[2] + d[2] * k,
];

/** Arm crown: where the eight arms meet round the mouth. */
export const CROWN: Vec3 = [0.03, 0, 0.135];
/** Body axis, crown → mantle tip: leaning back about 34 degrees from vertical. */
export const AXIS: Vec3 = unit([-0.56, 0, 0.83]);
/** Ventral side of the head and mantle: the funnel's side. */
export const VENTRAL: Vec3 = unit([-0.83, 0, -0.56]);
/** Where the head ends and the mantle begins. */
export const NECK: Vec3 = along(CROWN, AXIS, REAL.head);

/** Arc length of a chain's spline as the kind resolves it. */
function arcOf(c: ChainSpec): number {
  const { parent: _parent, ...free } = c;
  const rough = c.path.reduce((sum, q, i) => {
    const a = c.path[i - 1] ?? q;
    return sum + dmath.hypot(q[0] - a[0], q[1] - a[1], q[2] - a[2]);
  }, 0);
  const p = bodyPlan({ name: 'probe', length: rough, chains: [free] });
  return p.chains[0]?.length ?? 0;
}

/** Scales a path about its root until its spline is `length` long (within 0.1 %). */
function fitArc(c: ChainSpec, length: number): ChainSpec {
  const root = c.path[0] ?? [0, 0, 0];
  let out = c;
  for (let i = 0; i < 4; i++) {
    const k = length / arcOf(out);
    out = {
      ...out,
      path: out.path.map((p) => along(root, [p[0] - root[0], p[1] - root[1], p[2] - root[2]], k)),
    };
  }
  return out;
}

const RIB_STATIONS = [0.3, 0.55, 0.8] as const;
export const RIB_NAMES = RIB_STATIONS.map((_, i) => `rib_${i}`);

/** Leaf ring joints inside the mantle: scaling them across the axis makes it breathe. */
function ribChain(u: number, i: number): ChainSpec {
  const at = along(NECK, AXIS, REAL.mantle * u);
  return {
    name: `rib_${i}`,
    parent: { chain: 'mantle', link: Math.min(3, Math.floor((1 - u) * 4)) },
    path: [at, along(at, AXIS, 0.02)],
    radius: [0.1, 0.1],
    links: 1,
    skin: false,
  };
}

function mantleChain(): ChainSpec {
  // Stations from the neck back to the tip, the tip sagging toward the ventral side.
  const at = (u: number): Vec3 =>
    along(
      along(NECK, AXIS, REAL.mantle * u),
      VENTRAL,
      0.03 * u * u - 0.012 * dmath.sin(Math.PI * u),
    );
  const path = [1, 0.84, 0.62, 0.36, 0.14, 0].map(at);
  const fitted = fitArc(
    {
      name: 'mantle',
      path: [...path].reverse().reverse(),
      // The neck end nearly as wide as the head that grows out of it: at 0.046 under a 0.07 head
      // the head read as a separate collar band under the eyes (wider still folds into a seam
      // against the arm roots: QA connections).
      radius: [0.02, 0.078, 0.106, 0.096, 0.062, 0.049],
      links: 4,
      // The mantle is what the eye goes to: it gets the rings the hidden sucker undersides gave up.
      detail: { rings: [14, 5, 3], sides: [48, 18, 10] },
      relief: mantleRelief,
      tint: mantleTint,
      weightWith: [...RIB_NAMES],
    },
    REAL.mantle,
  );
  return fitted;
}

function headChain(): ChainSpec {
  return {
    name: 'head',
    parent: { chain: 'mantle', link: 3 },
    path: [
      along(NECK, AXIS, 0.012),
      along(CROWN, AXIS, 0.028),
      along(CROWN, AXIS, 0.004),
      along(CROWN, AXIS, -0.05),
    ],
    // From the mantle's neck, swelling less where the eyes sit (a 0.07 bulge was the collar),
    // then flaring a little at the crown into the arm roots instead of running straight down as
    // a cylinder under the eyes (the band, D483).
    radius: [0.051, 0.064, 0.066, 0.045],
    links: 1,
    blend: 0.05,
    detail: { rings: [26, 8, 3], sides: [48, 16, 10] },
    relief: headRelief,
    tint: mantleTint,
  };
}

/** One arm's character: how it leaves the crown, how it wanders, how its tip curls. */
interface ArmPose {
  /** Elevation of the arm's first stretch, radians. */
  readonly rise: number;
  /** Sideways wander: amplitude (radians) and how many waves along the arm. */
  readonly sway: number;
  readonly waves: number;
  /** Total upward curl of the tip, radians, and where along the arm it starts. */
  readonly curl: number;
  readonly from: number;
  /** Sideways curl of the tip over the seabed, radians: a flat spiral seen from above. */
  readonly twirl?: number;
}

/** Hand-set so the silhouette reads from every side: two raised curls in front, two tips coiled
 *  flat under themselves on the seabed, one arm reaching out straight, lazy curls behind. */
const POSES: readonly ArmPose[] = [
  { rise: 0.85, sway: 0.2, waves: 1.1, curl: 5.2, from: 0.36 },
  { rise: 0.2, sway: 0.34, waves: 1.5, curl: 3.4, from: 0.48 },
  { rise: 0.04, sway: 0.18, waves: 0.8, curl: 0.9, from: 0.62, twirl: 7.2 },
  { rise: 0.08, sway: 0.1, waves: 0.6, curl: 0.5, from: 0.86 },
  { rise: 0.04, sway: 0.3, waves: 1.25, curl: 0.9, from: 0.5, twirl: -7.2 },
  { rise: 0.16, sway: 0.34, waves: 1.6, curl: 5.8, from: 0.4 },
  { rise: 0.05, sway: 0.26, waves: 1.35, curl: 3.0, from: 0.54 },
  { rise: 0.6, sway: 0.22, waves: 0.95, curl: 4.2, from: 0.42 },
];

export const armAngle = (k: number): number => ((k + 0.5) * Math.PI * 2) / ARMS;
export const armLength = (k: number): number =>
  k === REGEN_ARM ? REGEN_LENGTH : k === 0 || k === ARMS - 1 ? DORSAL_ARM : REAL.arm;
/** Arm half-width at arc fraction u: tapering all the way from the web to the tip. */
export const armRadius = (u: number): number =>
  ARM_TIP_RADIUS + (ARM_BASE_RADIUS - ARM_TIP_RADIUS) * dmath.pow(1 - u, 1.0);
/** The regenerating arm: the old arm's taper to the break, then a thinner regrowth bud. */
const regenRadius = (u: number): number => {
  const old = armRadius((u * REGEN_LENGTH) / REAL.arm);
  if (u <= REGEN_FROM) return old;
  const k = (u - REGEN_FROM) / (1 - REGEN_FROM);
  const at = armRadius((REGEN_FROM * REGEN_LENGTH) / REAL.arm);
  return ARM_TIP_RADIUS + (at * 0.62 - ARM_TIP_RADIUS) * dmath.pow(1 - k, 0.9);
};
export const radiusOf = (k: number, u: number): number =>
  k === REGEN_ARM ? regenRadius(u) : armRadius(u);

/** The arm's centreline, integrated from its heading along the arc. */
function armPath(k: number): Vec3[] {
  const rng = createRng(SEED).fork(`arm_${k}`);
  const pose = POSES[k] ?? { rise: 0, sway: 0.15, waves: 1, curl: 3, from: 0.5 };
  const L = armLength(k);
  const a = armAngle(k);
  const out: Vec3 = [dmath.cos(a), dmath.sin(a), 0];
  const side: Vec3 = [-dmath.sin(a), dmath.cos(a), 0];
  const phase = rng.range(0, Math.PI * 2);
  const flip = rng.next() < 0.5 ? -1 : 1;
  const start = along([CROWN[0], CROWN[1], CROWN[2] - 0.012], out, 0.042);
  const steps = 240;
  const ds = L / steps;
  let p: Vec3 = start;
  const pts: Vec3[] = [p];
  for (let i = 0; i < steps; i++) {
    const u = (i + 0.5) / steps;
    // Down off the crown onto the seabed, along it, then the tip curls up and over.
    const leave =
      -0.95 * dmath.exp(-u / 0.075) + pose.rise * dmath.exp(-dmath.pow((u - 0.2) / 0.16, 2));
    const t = Math.max(0, (u - pose.from) / (1 - pose.from));
    const elevation = leave + pose.curl * t * t;
    const yaw =
      flip * pose.sway * dmath.sin(Math.PI * 2 * pose.waves * u + phase) * (0.4 + u) +
      (pose.twirl ?? 0) * t * t;
    const dir: Vec3 = unit([
      dmath.cos(elevation) * dmath.cos(yaw) * out[0] +
        dmath.cos(elevation) * dmath.sin(yaw) * side[0],
      dmath.cos(elevation) * dmath.cos(yaw) * out[1] +
        dmath.cos(elevation) * dmath.sin(yaw) * side[1],
      dmath.sin(elevation),
    ]);
    p = along(p, dir, ds);
    const floor = radiusOf(k, u) + 0.002;
    if (p[2] < floor) p = [p[0], p[1], floor];
    pts.push(p);
  }
  // A coiled tip needs more stations for the spline to follow the coil at its true length.
  const stations = pose.twirl ? 29 : 15;
  return Array.from({ length: stations }, (_, i) => {
    const q = pts[Math.round((i / (stations - 1)) * steps)];
    return q ?? start;
  });
}

const ARM_IDS_LOCAL: readonly string[] = Array.from({ length: ARMS }, (_, k) => `arm_${k}`);

function armChain(k: number): ChainSpec {
  const stations = armPath(k);
  const radius = stations.map((_, i) => radiusOf(k, i / (stations.length - 1)));
  return fitArc(
    {
      name: `arm_${k}`,
      parent: { chain: 'head', link: 0 },
      path: stations,
      radius,
      links: ARM_LINKS,
      bias: 1.12,
      antiFold: true,
      blend: 0.034,
      blendWith: ARM_IDS_LOCAL,
      // LOD2 keeps two rings a link so the curled tips stay curves, not segments.
      detail: { rings: [6, 2, 2], sides: [20, 8, 5] },
      relief: armRelief,
      tint: k === REGEN_ARM ? regenTint(REGEN_FROM) : armTint,
    },
    armLength(k),
  );
}

function funnelChain(): ChainSpec {
  const base = along(along(CROWN, AXIS, 0.052), VENTRAL, 0.038);
  const dir = unit([VENTRAL[0] * 0.72 - AXIS[0] * 0.42, 0.42, VENTRAL[2] * 0.72 - AXIS[2] * 0.42]);
  return {
    name: 'funnel',
    parent: { chain: 'head', link: 0 },
    path: [base, along(base, dir, 0.04), along(base, dir, 0.082)],
    radius: [0.024, 0.0155, 0.0175],
    links: 2,
    antiFold: true,
    blend: 0.028,
    detail: { rings: [8, 3, 1], sides: [16, 10, 6] },
    tint: (q, c) => (q.u > 0.94 ? [0.02, 0.012, 0.012] : mantleTint(q, c)),
  };
}

export const OCTOPUS_SPEC: BodyPlanSpec = {
  name: 'common_octopus',
  length: REAL.total,
  chains: [
    mantleChain(),
    ...RIB_STATIONS.map(ribChain),
    headChain(),
    funnelChain(),
    ...Array.from({ length: ARMS }, (_, k) => armChain(k)),
  ],
};

export const ARM_IDS: readonly string[] = ARM_IDS_LOCAL;
