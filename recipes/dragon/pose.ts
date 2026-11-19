// Cinderhorn's proportions, applied to the bind skeleton (skeleton.ts): every module sculpts
// against the bind landmarks; this module carries the finished parts, their pivots, joints and
// crease regions from the bind pose to the posed skeleton, as a rig carries a bind-pose mesh.
// Two proportions, both read off the skeleton, so no module holds a posed coordinate:
//   legs  the lower leg (paw top → elbow / knee height) is stretched so the trunk stands `lift`
//         higher: forearm, shank and cannon lengthen, paws stay on z = 0, everything above the
//         elbows and knees rises rigidly
//   neck  the neck line is scaled about its base by `neck`: a point on the neck moves with its
//         place along the line, the head and everything on it with the neck's end
// Families: `body` (the trunk sculpt: legs, and the neck by its place along the line), `head`
// (skull, horns, jaw, eyes: rigid on the neck's end), `rigid` (wings, shoulders, tail: legs only).

import type { Mesh, Vec3 } from '@developerz.ai/ts23d';
import { SK } from './skeleton.ts';

/** Legs 13 % longer to the shoulder (the trunk 0.2 m higher), the neck 27 % longer (one more
 *  vertebra's worth on 1.9 m): the bind pose read short-legged and short-necked for its body,
 *  and so did 18 % (critiques 2026-11-19). */
export const PROPORTIONS = { lift: 0.2, neck: 1.27 } as const;

export type Family = 'body' | 'head' | 'rigid';

/** The stretched band: from the top of the paws to the lower of elbow and knee. */
const Z0 = Math.max(SK.fore.palm[2], SK.hind.ball[2]) + 0.07;
const Z1 = Math.min(SK.fore.elbow[2], SK.hind.knee[2]);
const STRETCH = 1 + PROPORTIONS.lift / (Z1 - Z0);

const raise = (z: number): number =>
  z <= Z0 ? z : z >= Z1 ? z + PROPORTIONS.lift : Z0 + (z - Z0) * STRETCH;

const NECK: readonly Vec3[] = SK.neck;
const BASE: Vec3 = SK.neck[0] ?? [0, 0, 0];
const END: Vec3 = NECK[NECK.length - 1] ?? BASE;
const grow = (p: Vec3): Vec3 => [
  (p[0] - BASE[0]) * (PROPORTIONS.neck - 1),
  0,
  (p[2] - BASE[2]) * (PROPORTIONS.neck - 1),
];

/** The nearest point on the neck line to a bind point, and the segment it lies inside (null when
 *  it is a segment's end: there the nearest point does not move with p). */
function nearestOnNeck(p: Vec3): { at: Vec3; ab: Vec3 | null } {
  let best = Infinity;
  let at: Vec3 = BASE;
  let along: Vec3 | null = null;
  for (let i = 0; i + 1 < NECK.length; i++) {
    const a = NECK[i] ?? BASE;
    const b = NECK[i + 1] ?? a;
    const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const raw =
      ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) /
      (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2);
    const t = Math.max(0, Math.min(1, raw));
    const q: Vec3 = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
    const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    if (d < best) [best, at, along] = [d, q, raw > 0 && raw < 1 ? ab : null];
  }
  return { at, ab: along };
}

/** How far the neck's stretch moves a bind point of the body: that of the nearest point on the
 *  neck line (nothing behind its base, the full reach past its end). */
const alongNeck = (p: Vec3): Vec3 => grow(nearestOnNeck(p).at);

/**
 * A bind normal carried through `posePoint`'s deformation: the inverse-transpose of its Jacobian
 * J = D + u vᵀ, D the legs' vertical stretch (diag 1, 1, STRETCH in the band) and u vᵀ the neck's
 * (u = grow(ab), v = ab / |ab|², non-zero only inside a neck segment), by Sherman–Morrison.
 */
function poseNormal(p: Vec3, n: Vec3, family: Family): Vec3 {
  const dz = p[2] > Z0 && p[2] < Z1 ? STRETCH : 1;
  const m: Vec3 = [n[0], n[1], n[2] / dz];
  const ab = family === 'body' ? nearestOnNeck(p).ab : null;
  if (!ab) return unit(m);
  const u = grow([BASE[0] + ab[0], BASE[1] + ab[1], BASE[2] + ab[2]]);
  const ll = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
  const v: Vec3 = [ab[0] / ll, ab[1] / ll, ab[2] / ll];
  const k =
    (u[0] * m[0] + u[1] * m[1] + u[2] * m[2]) /
    (1 + v[0] * u[0] + v[1] * u[1] + (v[2] * u[2]) / dz);
  return unit([m[0] - v[0] * k, m[1] - v[1] * k, m[2] - (v[2] / dz) * k]);
}

const unit = (m: Vec3): Vec3 => {
  const l = Math.hypot(m[0], m[1], m[2]) || 1;
  return [m[0] / l, m[1] / l, m[2] / l];
};

/** A bind-pose point (world) carried to the posed skeleton. */
export function posePoint(p: Vec3, family: Family): Vec3 {
  const d: Vec3 = family === 'head' ? grow(END) : family === 'body' ? alongNeck(p) : [0, 0, 0];
  return [p[0] + d[0], p[1], raise(p[2]) + d[2]];
}

/**
 * A part's mesh carried to the posed skeleton. `pivot` is the part's bind pivot (its vertices
 * are relative to it); the result is relative to the posed pivot `posePoint(pivot, family)`. Normals
 * follow the deformation (`poseNormal`): they lean back in the stretched leg band and along the
 * stretched neck.
 */
export function poseMesh(mesh: Mesh, family: Family, pivot?: Vec3): Mesh {
  const at = pivot ?? [0, 0, 0];
  // A part without a pivot stays in the asset frame.
  const to = pivot ? posePoint(pivot, family) : at;
  const positions = new Float32Array(mesh.positions.length);
  const normals = new Float32Array(mesh.normals);
  const P = mesh.positions;
  for (let i = 0; i < P.length; i += 3) {
    const w: Vec3 = [(P[i] ?? 0) + at[0], (P[i + 1] ?? 0) + at[1], (P[i + 2] ?? 0) + at[2]];
    const q = posePoint(w, family);
    positions[i] = q[0] - to[0];
    positions[i + 1] = q[1] - to[1];
    positions[i + 2] = q[2] - to[2];
    normals.set(
      poseNormal(w, [normals[i] ?? 0, normals[i + 1] ?? 0, normals[i + 2] ?? 0], family),
      i,
    );
  }
  return { ...mesh, positions, normals };
}
