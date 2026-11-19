// Rim contact: a piece that meets its holder along a closed line instead of over a face. A cone
// roof on a tank's rim, an open-backed sign on a wall, a panel fitted in its frame and a lamp hood
// on its bracket have no contact FACE (the area-weighted samples sit inside the triangles, off the
// rim), yet they are seated all round. The points of the piece that touch (within its `eps`, or
// inside a solid holder) must spread in two directions, and along each cover at least half of
// what the whole piece covers there: a ring or a perimeter does, a corner (a point) and one edge
// (a line) do not.

import type { Vec3 } from '../core/index.ts';
import { dot, principalAxis, sub } from './connections-partner.ts';
import type { Shell } from './connections-shells.ts';
import { probeOf, type Samples, samplesIn, stepOf } from './contact.ts';
import { CONTACT_EPS } from './types.ts';

/** Share of the piece the touching points must span, along both of their own directions. */
export const RIM_SHARE = 0.5;

const cloud = (xyz: ArrayLike<number>): Samples => {
  const count = Math.floor(xyz.length / 3);
  return {
    p: Float64Array.from(xyz),
    n: new Float64Array(count * 3),
    w: new Float64Array(count).fill(1),
    count,
  };
};

/** How far the points reach along `axis`. */
function range(xyz: ArrayLike<number>, axis: Vec3): number {
  let [lo, hi] = [Infinity, -Infinity];
  for (let i = 0; i + 2 < xyz.length; i += 3) {
    const t = (xyz[i] ?? 0) * axis[0] + (xyz[i + 1] ?? 0) * axis[1] + (xyz[i + 2] ?? 0) * axis[2];
    lo = Math.min(lo, t);
    hi = Math.max(hi, t);
  }
  return hi - lo;
}

/** The long direction of a point cloud and the long direction of what is left across it
 *  (null when nothing is left: the points lie on one line). */
function directions(S: Samples): [Vec3, Vec3 | null] {
  const first = principalAxis(S);
  const flat = new Float64Array(S.count * 3);
  for (let i = 0; i < S.count; i++) {
    const d = sub([S.p[i * 3] ?? 0, S.p[i * 3 + 1] ?? 0, S.p[i * 3 + 2] ?? 0], first.centre);
    const t = dot(d, first.axis);
    for (const k of [0, 1, 2] as const) flat[i * 3 + k] = d[k] - first.axis[k] * t;
  }
  const second = principalAxis({ ...S, p: flat }).axis;
  return [first.axis, range(flat, second) > 1e-9 ? second : null];
}

/** True when the points of `a` touching `b` ring `a`: two directions, RIM_SHARE of it in each. */
export function rimContact(a: Shell, b: Shell, eps: number): boolean {
  const S = samplesIn(a, b.bounds, CONTACT_EPS, stepOf(a));
  const q = probeOf(b);
  const touching: number[] = [];
  for (let i = 0; i < S.count; i++) {
    const p: Vec3 = [S.p[i * 3] ?? 0, S.p[i * 3 + 1] ?? 0, S.p[i * 3 + 2] ?? 0];
    if (q.dist(p, eps) <= eps || (b.solid && q.inside(p))) touching.push(p[0], p[1], p[2]);
  }
  if (touching.length < 9) return false;
  const [along, across] = directions(cloud(touching));
  if (!across) return false;
  const whole = a.mesh.positions;
  return [along, across].every((axis) => {
    const reach = range(touching, axis);
    // A band of touching points one tolerance wide is a line seen with its tolerance, not a rim.
    return reach > 2 * eps && reach >= RIM_SHARE * range(whole, axis);
  });
}
