// Analytic leg IK for baked gaits (ADR 013: solved here, stored as keys). A leg is four bones:
// upper (humerus / femur), lower (forearm / tibia), metapodial (metacarpus / metatarsus), paw.
// The paw is set by the toe tip and its roll; the metapodial is the coupled third bone (the hock /
// carpus takes `couple` of the leg's length change, the stifle / elbow the rest), then a closed-
// form two-bone solve bends the upper pair toward its rest pole. Directions only: lengths never
// change, so the skin never stretches along a bone. A standing leg (`solvePlanted`) keeps paw and
// metapodial where they rest and lets the upper pair alone follow the body.

import { type Bone, type Quat, quatRotate, type Vec3 } from '../core/index.ts';
import { IDENTITY, qbetween, qconj, qexp, qmul } from './pose.ts';

export type LegBones = readonly [Bone, Bone, Bone, Bone];

export interface LegSolve {
  /** World rotation of each bone (shortest arc from its rest direction). */
  readonly world: readonly [Quat, Quat, Quat, Quat];
  /** Local rotations (parent frame) for keys: the first under `parentRot`. */
  readonly local: readonly [Quat, Quat, Quat, Quat];
  /** Distance the target (toe tip in stance, MCP in swing) is missed by, metres. */
  readonly miss: number;
  /** Metapodial angle at the MCP off the MCP → root line, radians (+ = the rest side). */
  readonly beta: number;
  /** Paw angle about +Y against the metapodial, radians (+ curls the toes). */
  readonly paw: number;
  /** Where the toe tip ends up, world. */
  readonly toe: Vec3;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const addS = (a: Vec3, b: Vec3, s: number): Vec3 => [
  a[0] + b[0] * s,
  a[1] + b[1] * s,
  a[2] + b[2] * s,
];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 => {
  const l = len(a);
  return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 1];
};
/** Component of v perpendicular to unit u, normalised (fallback when v ∥ u). */
const perp = (v: Vec3, u: Vec3, fallback: Vec3): Vec3 => {
  const p = addS(v, u, -dot(v, u));
  return len(p) > 1e-9 ? unit(p) : unit(addS(fallback, u, -dot(fallback, u)));
};
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
/** Widest inside angle the upper pair opens to, radians (FORM19: elbow 175°, stifle 173°). */
const STRAIGHTEST = (172 * Math.PI) / 180;

/** The paw's rest vector tip → MCP pitched by `roll` (radians, + lifts the MCP) about +Y. */
export function pawVector(paw: Bone, roll: number): Vec3 {
  const v = sub(paw.head, paw.tail);
  const c = Math.cos(roll);
  const s = Math.sin(roll);
  return [c * v[0] + s * v[2], v[1], -s * v[0] + c * v[2]];
}

const lengths = (leg: LegBones): [number, number, number] =>
  [0, 1, 2].map((i) => len(sub(leg[i]?.tail ?? [0, 0, 0], leg[i]?.head ?? [0, 0, 0]))) as [
    number,
    number,
    number,
  ];

/** Unit MCP → root direction and the rest side of the metapodial joint off it (turned with it). */
function frame(leg: LegBones, A: Vec3, M: Vec3): { u: Vec3; q: Vec3; d: number } {
  const u = unit(sub(A, M));
  const u0 = unit(sub(leg[0].head, leg[3].head));
  const side = perp(sub(leg[2].head, leg[3].head), u0, [1, 0, 0]);
  return { u, q: perp(quatRotate(qbetween(u0, u), side), u, [1, 0, 0]), d: len(sub(M, A)) };
}

/** Two-bone A → K → W toward the rest pole, the metapodial to M, the paw by `pawWorld`. */
function chain(
  leg: LegBones,
  A: Vec3,
  W: Vec3,
  M: Vec3,
  parentRot: Quat,
  pawWorld: (r2: Quat) => Quat,
): { world: [Quat, Quat, Quat, Quat]; local: [Quat, Quat, Quat, Quat]; Mr: Vec3 } {
  const [b0, b1, b2, b3] = leg;
  const [l0, l1] = lengths(leg);
  // Never quite straight: the elbow / stifle stops at STRAIGHTEST (passive extension ≈ 173–175°).
  const ec = clamp(
    len(sub(W, A)),
    Math.abs(l0 - l1) + 1e-6,
    Math.sqrt(l0 * l0 + l1 * l1 - 2 * l0 * l1 * Math.cos(STRAIGHTEST)),
  );
  const ua = unit(sub(W, A));
  const ua0 = unit(sub(b2.head, b0.head));
  const side = perp(sub(b1.head, b0.head), ua0, [1, 0, 0]);
  const pole = perp(quatRotate(qbetween(ua0, ua), side), ua, [1, 0, 0]);
  const a = (l0 * l0 - l1 * l1 + ec * ec) / (2 * ec);
  const K = addS(addS(A, ua, a), pole, Math.sqrt(Math.max(0, l0 * l0 - a * a)));
  const Wr = addS(A, ua, ec);
  const Mr = addS(Wr, sub(M, W), 1);
  const r0 = qbetween(sub(b1.head, b0.head), sub(K, A));
  const r1 = qbetween(sub(b2.head, b1.head), sub(Wr, K));
  const r2 = qbetween(sub(b3.head, b2.head), sub(Mr, Wr));
  const r3 = pawWorld(r2);
  return {
    world: [r0, r1, r2, r3],
    local: [
      qmul(qconj(parentRot), r0),
      qmul(qconj(r0), r1),
      qmul(qconj(r1), r2),
      qmul(qconj(r2), r3),
    ],
    Mr,
  };
}

const pawAngle = (local: Quat): number => 2 * Math.atan2(local[1], local[3]);

/**
 * Stance: the toe tip locked at `tip`, the paw pitched by `roll` (radians, + lifts the MCP) in the
 * world; the metapodial joint takes `couple` (0..1) of the leg's length change, on its rest side.
 * `root` = world head of the upper bone, `parentRot` = world rotation of the bone it hangs from.
 */
export function solveStance(
  leg: LegBones,
  root: Vec3,
  parentRot: Quat,
  tip: Vec3,
  roll: number,
  couple: number,
): LegSolve {
  const [l0, l1, l2] = lengths(leg);
  const M = addS(tip, pawVector(leg[3], roll), 1);
  const { u, q, d } = frame(leg, root, M);
  const D = clamp(
    len(sub(leg[2].head, leg[0].head)) + (1 - couple) * (d - len(sub(leg[3].head, leg[0].head))),
    Math.abs(l0 - l1) * 1.05,
    (l0 + l1) * 0.999,
  );
  const cb = clamp((l2 * l2 + d * d - D * D) / (2 * l2 * Math.max(d, 1e-9)), -1, 1);
  const beta = Math.acos(cb);
  const W = addS(addS(M, u, l2 * cb), q, l2 * Math.sin(beta));
  const pawRest = sub(leg[3].tail, leg[3].head);
  const c = chain(leg, root, W, M, parentRot, () => qbetween(pawRest, sub(tip, M)));
  const toe = addS(c.Mr, quatRotate(c.world[3], pawRest), 1);
  return { ...c, miss: len(sub(toe, tip)), beta, paw: pawAngle(c.local[3]), toe };
}

/** Swing: the MCP at `M`, the metapodial at angle `beta` off the MCP → root line, the paw at
 *  `paw` against it (both as `solveStance` reports them, so the two meet at lift-off). */
export function solveSwing(
  leg: LegBones,
  root: Vec3,
  parentRot: Quat,
  M: Vec3,
  beta: number,
  paw: number,
): LegSolve {
  const [, , l2] = lengths(leg);
  const { u, q } = frame(leg, root, M);
  const W = addS(addS(M, u, l2 * Math.cos(beta)), q, l2 * Math.sin(beta));
  const c = chain(leg, root, W, M, parentRot, (r2) => qmul(r2, qexp([0, paw, 0])));
  const toe = addS(c.Mr, quatRotate(c.world[3], sub(leg[3].tail, leg[3].head)), 1);
  return { ...c, miss: len(sub(c.Mr, M)), beta, paw, toe };
}

/** Standing: paw and metapodial stay where they rest in the world; the upper pair alone follows
 *  `root` (the body breathing over a planted foot). `miss` = how far the toe tip leaves its rest
 *  point when the root is out of the pair's reach. */
export function solvePlanted(
  leg: LegBones,
  root: Vec3,
  parentRot: Quat,
): Pick<LegSolve, 'world' | 'local' | 'miss' | 'toe'> {
  const paw = leg[3];
  const c = chain(leg, root, leg[2].head, paw.head, parentRot, () => IDENTITY);
  const toe = addS(c.Mr, sub(paw.tail, paw.head), 1);
  return { world: c.world, local: c.local, miss: len(sub(toe, paw.tail)), toe };
}
