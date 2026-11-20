// How well a skeleton sits in a model-built body (QA `model`, T3D_MODEL_FIT): `skeletonHug` (the
// area-median distance from the surface to the nearest bone), `hugTurn` (that against the same
// skeleton turned a quarter or half a turn: a wrong yaw) and `skeletonSpan` (the skeleton's reach
// along the body's longest side: a wrong scale).

import type { Armature, Mesh, Vec3 } from '../core/index.ts';
import { dmath } from '../core/index.ts';

/** Largest `hugTurn`: how closely the skeleton hugs the surface as it stands ÷ its best copy
 *  turned a quarter or half a turn about its own vertical axis. Over this a turned copy fits
 *  clearly better: the mesh is registered wrongly. An absolute limit cannot serve two builds: by
 *  height a lean wolf reads 0.097 registered and 0.130 half a turn off, a barrel-bodied bear
 *  0.148 and 0.220. Against their own turned copies: wolf 0.75, bear 0.67 registered; 1.34 and
 *  1.49 half a turn off. A body the same front and back (a table, a figure in A-pose) reads 1.0
 *  either way: its half turn cannot be told by this measure, only its quarter turn. */
export const FIT_TURN = 1.15;

export const segment = (p: Vec3, a: Vec3, b: Vec3): number => {
  const u: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const l2 = u[0] * u[0] + u[1] * u[1] + u[2] * u[2];
  const t =
    l2 > 0
      ? Math.min(
          1,
          Math.max(0, ((p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1] + (p[2] - a[2]) * u[2]) / l2),
        )
      : 0;
  return dmath.hypot(p[0] - a[0] - u[0] * t, p[1] - a[1] - u[1] * t, p[2] - a[2] - u[2] * t);
};

/** Most triangles sampled for the hug (every n-th beyond that). */
const HUG_SAMPLES = 4000;

/**
 * Median distance from the part's surface to the nearest bone ÷ the skeleton's height. The
 * median is over AREA (triangle centroids weighted by triangle area), not over vertices: a mesh
 * decimated with more vertices kept on the head and paws read 0.142 / 0.132 / 0.112 by vertex on
 * LOD 0 / 1 / 2 of one wolf on one skeleton, and 0.115 on all three by area.
 */
export function skeletonHug(mesh: Mesh, at: Vec3, sk: Armature): number {
  const [P, T] = [mesh.positions, mesh.indices];
  const count = T.length / 3;
  const step = Math.max(1, Math.floor(count / HUG_SAMPLES));
  const d: [number, number][] = [];
  let total = 0;
  for (let t = 0; t < count; t += step) {
    const v = [0, 1, 2].map((k): Vec3 => {
      const i = (T[t * 3 + k] ?? 0) * 3;
      return [(P[i] ?? 0) + at[0], (P[i + 1] ?? 0) + at[1], (P[i + 2] ?? 0) + at[2]];
    }) as [Vec3, Vec3, Vec3];
    const [e, f] = [1, 2].map((j) => [0, 1, 2].map((k) => (v[j]?.[k] ?? 0) - (v[0][k] ?? 0))) as [
      number[],
      number[],
    ];
    const area =
      dmath.hypot(
        (e[1] ?? 0) * (f[2] ?? 0) - (e[2] ?? 0) * (f[1] ?? 0),
        (e[2] ?? 0) * (f[0] ?? 0) - (e[0] ?? 0) * (f[2] ?? 0),
        (e[0] ?? 0) * (f[1] ?? 0) - (e[1] ?? 0) * (f[0] ?? 0),
      ) / 2;
    const centre: Vec3 = [
      (v[0][0] + v[1][0] + v[2][0]) / 3,
      (v[0][1] + v[1][1] + v[2][1]) / 3,
      (v[0][2] + v[1][2] + v[2][2]) / 3,
    ];
    d.push([Math.min(...sk.bones.map((b) => segment(centre, b.head, b.tail))), area]);
    total += area;
  }
  d.sort((a, b) => a[0] - b[0]);
  let seen = 0;
  let median = Number.POSITIVE_INFINITY;
  for (const [distance, area] of d) {
    seen += area;
    if (seen >= total / 2) {
      median = distance;
      break;
    }
  }
  const top = Math.max(...sk.bones.map((b) => Math.max(b.head[2], b.tail[2])));
  return median / Math.max(top, 1e-9);
}

/** Least share of the body's longest bounding-box side the skeleton's bones must reach along.
 *  Wolf 1.00, bear 0.95, dragon 0.93 (x: nose to tail), ranger 0.96 (z); a skeleton at half
 *  scale reads half that. */
export const FIT_SPAN = 0.6;

/** The skeleton's extent ÷ the mesh's, along the mesh's longest bounding-box side. */
export function skeletonSpan(mesh: Mesh, sk: Armature): number {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  const P = mesh.positions;
  for (let i = 0; i < P.length; i++) {
    const v = P[i] ?? 0;
    const k = i % 3;
    lo[k] = Math.min(lo[k] ?? v, v);
    hi[k] = Math.max(hi[k] ?? v, v);
  }
  const size = [0, 1, 2].map((k) => (hi[k] ?? 0) - (lo[k] ?? 0));
  const axis = size.indexOf(Math.max(...size));
  const at = sk.bones.flatMap((b) => [b.head[axis] ?? 0, b.tail[axis] ?? 0]);
  return (Math.max(...at) - Math.min(...at)) / Math.max(size[axis] ?? 0, 1e-9);
}

/**
 * `skeletonHug` of the skeleton as it stands ÷ the best `skeletonHug` of the same skeleton turned
 * 90°, 180° and 270° about the vertical axis through its middle: under 1 when the skeleton faces
 * the way the mesh does, over 1 when a turned copy fits better (the mesh is registered wrongly).
 */
export function hugTurn(mesh: Mesh, at: Vec3, sk: Armature): number {
  const n = Math.max(sk.bones.length, 1);
  const cx = sk.bones.reduce((s, b) => s + (b.head[0] + b.tail[0]) / 2, 0) / n;
  const cy = sk.bones.reduce((s, b) => s + (b.head[1] + b.tail[1]) / 2, 0) / n;
  const turned = (quarters: number): Armature => {
    const [c, s] = [
      Math.round(dmath.cos((quarters * Math.PI) / 2)),
      Math.round(dmath.sin((quarters * Math.PI) / 2)),
    ];
    const turn = (p: Vec3): Vec3 => [
      cx + (p[0] - cx) * c - (p[1] - cy) * s,
      cy + (p[0] - cx) * s + (p[1] - cy) * c,
      p[2],
    ];
    return { bones: sk.bones.map((b) => ({ ...b, head: turn(b.head), tail: turn(b.tail) })) };
  };
  const others = Math.min(...[1, 2, 3].map((q) => skeletonHug(mesh, at, turned(q))));
  return skeletonHug(mesh, at, sk) / Math.max(others, 1e-9);
}
