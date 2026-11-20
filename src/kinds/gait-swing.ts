// The swing leg of a baked gait (gait-bake.ts): the MCP on its path between the lift-off and
// touch-down stance solutions, the metapodial angle and the paw blended between them, the carpus
// folding (fore) and the hock flexing (hind) on the way, every joint held inside its limit — and
// the toe kept off the ground from the first frame: where it would drag, the MCP rises, and where
// the leg cannot reach that high, the carpus / hock folds further.

import {
  type Bone,
  dmath,
  type JointLimit,
  type Quat,
  quatRotate,
  type Vec3,
} from '../core/index.ts';
import { type LegBones, type LegSolve, solveSwing } from './gait-ik.ts';
import { qexp, qmul } from './pose.ts';

const deg = Math.PI / 180;
/** Extra metapodial angle at mid-swing: the carpus folds through straight (fore), the hock flexes
 *  (hind); and the toes curl [P, after Muybridge's dog plates]. */
const FOLD_FORE = -75 * deg;
const FOLD_HIND = 25 * deg;
const CURL = 10 * deg;
/** Least toe height through the swing: this share of the lift on √sin (the toe peels at once). */
const CLEAR = 0.6;

/** A local rotation turned back about its limit axis (+Y hinges) into the limit's range. */
export function withinLimit(q: Quat, limit: JointLimit | undefined): Quat {
  if (!limit || Math.abs(limit.axis[1]) < 0.99) return q;
  const a = (2 * dmath.atan2(q[1], q[3]) * 180) / Math.PI;
  const s = Math.sign(limit.axis[1]);
  const lo = s > 0 ? limit.min : -limit.max;
  const hi = s > 0 ? limit.max : -limit.min;
  const c = Math.min(hi, Math.max(lo, a));
  return c === a ? q : qmul(q, qexp([0, ((c - a) * Math.PI) / 180, 0]));
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** Locals clamped to their limits and the toe tip they put where (forward kinematics). */
function clamped(
  leg: LegBones,
  A: Vec3,
  parent: Quat,
  s: LegSolve,
  free: boolean,
): { local: Quat[]; toe: Vec3 } {
  const local = leg.map((b: Bone, i): Quat => {
    const q: Quat = s.local[i] ?? [0, 0, 0, 1];
    return free ? q : withinLimit(q, b.limit);
  });
  let rot = parent;
  let at = A;
  leg.forEach((b, i) => {
    rot = qmul(rot, local[i] ?? [0, 0, 0, 1]);
    const o = quatRotate(rot, sub(b.tail, b.head));
    at = [at[0] + o[0], at[1] + o[1], at[2] + o[2]];
  });
  return { local, toe: at };
}

export interface SwingPath {
  /** MCP target at swing progress s (against the root). */
  readonly M: (s: number) => Vec3;
  readonly lo: LegSolve;
  readonly td: LegSolve;
  /** Lift at mid-swing, metres. */
  readonly lift: number;
  readonly fore: boolean;
}

const length = (b: Bone): number => dmath.norm(sub(b.tail, b.head));

/** A plantigrade foot: the paw (the whole sole, wrist / heel to toe) is over twice the short
 *  metapodial segment. Its carpus does not fold through straight like a dog's: folding the long
 *  sole forward drives the toe through the ground, so it flexes back like a hock. */
const isSole = (leg: LegBones): boolean => length(leg[3]) > 2 * length(leg[2]);

/** Local rotations of a swing leg at progress s. */
export function swingLeg(leg: LegBones, A: Vec3, parent: Quat, s: number, p: SwingPath): Quat[] {
  const bump = dmath.sin(Math.PI * s);
  // Next to lift-off and touch-down the leg is its stance pose (loaded joints may sit past their
  // passive range); only the free middle of the swing is held to the limits.
  const ends = s < 0.15 || s > 0.85;
  const foldBy = p.fore && !isSole(leg) ? FOLD_FORE : FOLD_HIND;
  let beta = p.lo.beta + (p.td.beta - p.lo.beta) * s + foldBy * bump;
  const paw = p.lo.paw + (p.td.paw - p.lo.paw) * s + CURL * bump;
  let M = p.M(s);
  const floor = leg[3].tail[2] + CLEAR * p.lift * Math.sqrt(bump);
  let solve = solveSwing(leg, A, parent, M, beta, paw);
  let out = clamped(leg, A, parent, solve, ends);
  for (let k = 0; k < 8 && out.toe[2] < floor - 1e-5; k++) {
    const reached = solve.miss < 1e-3 && Math.abs((out.toe[2] ?? 0) - solve.toe[2]) < 1e-4;
    if (reached) M = [M[0], M[1], M[2] + floor - out.toe[2]];
    else beta += foldBy * 0.2;
    solve = solveSwing(leg, A, parent, M, beta, paw);
    out = clamped(leg, A, parent, solve, ends);
  }
  return out.local;
}
