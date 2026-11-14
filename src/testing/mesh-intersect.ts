// assertNoSelfIntersection: no two triangles of one part cut through each other. Triangles are
// bucketed in a uniform grid; each candidate pair that shares no welded vertex is tested edge-by-
// edge (a segment of one crossing the other's interior). Coplanar overlaps are not counted.
//   it('hull does not fold through itself', () => assertNoSelfIntersection(tank, { parts: 'hull' }));

import { boundsOf, type Mesh, type Vec3 } from '../core/index.ts';
import { failOn } from './compiled.ts';
import {
  corners,
  cross3,
  dot3,
  type MeshInput,
  type MeshScope,
  meshesOf,
  sub3,
  weldIds,
} from './mesh-input.ts';
import { fmtPoint } from './mesh-topology.ts';

const EPS = 1e-9;

/** Where segment pq crosses triangle abc's interior, or null (parallel, outside, or at an end). */
function segmentHit(p: Vec3, q: Vec3, tri: readonly [Vec3, Vec3, Vec3]): Vec3 | null {
  const [a, b, c] = tri;
  const d = sub3(q, p);
  const e1 = sub3(b, a);
  const e2 = sub3(c, a);
  const h = cross3(d, e2);
  const det = dot3(e1, h);
  if (Math.abs(det) < EPS) return null;
  const s = sub3(p, a);
  const u = dot3(s, h) / det;
  const k = cross3(s, e1);
  const v = dot3(d, k) / det;
  const t = dot3(e2, k) / det;
  const m = 1e-6;
  if (u <= m || v <= m || u + v >= 1 - m || t <= m || t >= 1 - m) return null;
  return [p[0] + d[0] * t, p[1] + d[1] * t, p[2] + d[2] * t];
}

function triTri(A: readonly [Vec3, Vec3, Vec3], B: readonly [Vec3, Vec3, Vec3]): Vec3 | null {
  for (let i = 0; i < 3; i++) {
    const hit =
      segmentHit(A[i] ?? A[0], A[(i + 1) % 3] ?? A[0], B) ??
      segmentHit(B[i] ?? B[0], B[(i + 1) % 3] ?? B[0], A);
    if (hit) return hit;
  }
  return null;
}

/** Count of intersecting triangle pairs in one mesh, and where the first one is. */
export function selfIntersections(m: Mesh, limit = 1000): { pairs: number; at?: Vec3 } {
  const n = m.indices.length / 3;
  const ids = weldIds(m);
  const b = boundsOf(m);
  const diag = Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
  const C = Math.max(diag / Math.max(8, Math.cbrt(n) * 2), 1e-4);
  const cells = new Map<string, number[]>();
  const tris = Array.from({ length: n }, (_, t) => corners(m, t));
  tris.forEach((tri, t) => {
    const lo = [0, 1, 2].map((k) => Math.floor(Math.min(...tri.map((p) => p[k] ?? 0)) / C));
    const hi = [0, 1, 2].map((k) => Math.floor(Math.max(...tri.map((p) => p[k] ?? 0)) / C));
    for (let x = lo[0] ?? 0; x <= (hi[0] ?? 0); x++)
      for (let y = lo[1] ?? 0; y <= (hi[1] ?? 0); y++)
        for (let z = lo[2] ?? 0; z <= (hi[2] ?? 0); z++) {
          const k = `${x},${y},${z}`;
          const list = cells.get(k);
          if (list) list.push(t);
          else cells.set(k, [t]);
        }
  });
  const shares = (s: number, t: number): boolean => {
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        if (ids[m.indices[s * 3 + i] ?? 0] === ids[m.indices[t * 3 + j] ?? 0]) return true;
    return false;
  };
  const tested = new Set<number>();
  let pairs = 0;
  let at: Vec3 | undefined;
  for (const list of cells.values())
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const s = Math.min(list[i] ?? 0, list[j] ?? 0);
        const t = Math.max(list[i] ?? 0, list[j] ?? 0);
        const pk = s * n + t;
        if (tested.has(pk)) continue;
        tested.add(pk);
        if (shares(s, t)) continue;
        const A = tris[s];
        const B = tris[t];
        const hit = A && B ? triTri(A, B) : null;
        if (!hit) continue;
        pairs++;
        at ??= hit;
        if (pairs >= limit) return { pairs, at };
      }
  return at ? { pairs, at } : { pairs };
}

/** No triangle of a part passes through another triangle of the same part. */
export function assertNoSelfIntersection(input: MeshInput, o: MeshScope = {}): number {
  let worst = 0;
  failOn(
    'self-intersection',
    meshesOf(input, o).flatMap(({ name, mesh }) => {
      const r = selfIntersections(mesh);
      worst = Math.max(worst, r.pairs);
      return r.pairs === 0
        ? []
        : [
            {
              finding: {
                gate: 'self-intersection',
                code: 'T3D_QA_SELF_INTERSECTION',
                part: name,
                message: `'${name}' folds through itself: ${r.pairs} crossing triangle pair(s), first at ${fmtPoint(r.at)}`,
                fix: 'split the overlapping solids into separate parts (ctx.part per solid), or rebuild the fold (a sweep radius smaller than its bend, a loft that twists)',
              },
            },
          ];
    }),
  );
  return worst;
}
