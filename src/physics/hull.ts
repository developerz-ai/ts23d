// 3D convex hull by incremental insertion (the quickhull family, without conflict lists: inputs
// here are a few hundred extreme points). Deterministic: points visited in input order, ties
// broken by index. A point within `eps` of every face is treated as inside; one that clears a
// face is merged against the faces it sees by the exact orient3d predicate (core/predicates).

import { orient3d, type Vec3 } from '../core/index.ts';

export interface Hull {
  /** Hull vertices (a subset of the input, in first-seen order). */
  readonly vertices: readonly Vec3[];
  /** Outward-facing (counter-clockwise) triangles into `vertices`. */
  readonly faces: readonly (readonly [number, number, number])[];
}

type Face = [number, number, number];

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const crs = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dt = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const at = (p: readonly Vec3[], i: number): Vec3 => p[i] ?? [0, 0, 0];

/** Signed distance-ish of `q` above face (a, b, c), scaled by the face's doubled area. */
const above = (p: readonly Vec3[], f: Face, q: Vec3): number =>
  dt(crs(sub(at(p, f[1]), at(p, f[0])), sub(at(p, f[2]), at(p, f[0]))), sub(q, at(p, f[0])));

function seed(p: readonly Vec3[], eps: number): Face[] | null {
  // Extreme pair on X, farthest from that line, farthest from that plane: a non-flat tetrahedron.
  let i0 = 0;
  let i1 = 0;
  p.forEach((q, i) => {
    if (q[0] < at(p, i0)[0]) i0 = i;
    if (q[0] > at(p, i1)[0]) i1 = i;
  });
  if (i0 === i1) {
    // All share one X: pick any two distinct points.
    i1 = p.findIndex((q) => dt(sub(q, at(p, i0)), sub(q, at(p, i0))) > eps * eps);
    if (i1 < 0) return null;
  }
  const d01 = sub(at(p, i1), at(p, i0));
  let i2 = -1;
  let best = eps * Math.hypot(...d01);
  p.forEach((q, i) => {
    const d = Math.hypot(...crs(d01, sub(q, at(p, i0))));
    if (d > best) [best, i2] = [d, i];
  });
  if (i2 < 0) return null;
  const n = crs(d01, sub(at(p, i2), at(p, i0)));
  let i3 = -1;
  best = eps * Math.hypot(...n);
  p.forEach((q, i) => {
    const d = Math.abs(dt(n, sub(q, at(p, i0))));
    if (d > best) [best, i3] = [d, i];
  });
  if (i3 < 0) return null;
  const out = dt(n, sub(at(p, i3), at(p, i0))) > 0;
  const base: Face = out ? [i0, i2, i1] : [i0, i1, i2];
  return [base, ...edges(base).map(([a, b]): Face => [b, a, i3])];
}

const edges = (f: Face): [number, number][] => [
  [f[0], f[1]],
  [f[1], f[2]],
  [f[2], f[0]],
];

/** Convex hull of `points`; null when they are all (near) coplanar. `eps` in metres. */
export function convexHull(points: readonly Vec3[], eps = 1e-6): Hull | null {
  let faces = seed(points, eps);
  if (!faces) return null;
  points.forEach((q, qi) => {
    if (!faces) return;
    // Accept q only if it clears some face by more than eps (near-coplanar points stay out)...
    const clears = faces.some((f) => {
      const n = crs(
        sub(at(points, f[1]), at(points, f[0])),
        sub(at(points, f[2]), at(points, f[0])),
      );
      return above(points, f, q) > eps * Math.hypot(...n);
    });
    if (!clears) return;
    // ...then take EXACTLY the faces it sees: an exact visible set is one connected patch, so the
    // horizon is a single loop and the hull stays closed (an eps test can split it).
    const visible = faces.map(
      (f) => orient3d(at(points, f[0]), at(points, f[1]), at(points, f[2]), q) > 0,
    );
    // Horizon: directed edges of visible faces whose twin belongs to a hidden face.
    const visEdges = new Set<string>();
    faces.forEach((f, i) => {
      if (visible[i]) for (const [a, b] of edges(f)) visEdges.add(`${a},${b}`);
    });
    const kept: Face[] = faces.filter((_, i) => !visible[i]);
    faces.forEach((f, i) => {
      if (!visible[i]) return;
      for (const [a, b] of edges(f)) if (!visEdges.has(`${b},${a}`)) kept.push([a, b, qi]);
    });
    faces = kept;
  });
  const remap = new Map<number, number>();
  const vertices: Vec3[] = [];
  const id = (i: number): number => {
    const known = remap.get(i);
    if (known !== undefined) return known;
    remap.set(i, vertices.length);
    vertices.push(at(points, i));
    return vertices.length - 1;
  };
  const out = faces.map((f): readonly [number, number, number] => [id(f[0]), id(f[1]), id(f[2])]);
  return { vertices, faces: out };
}

/** Enclosed volume of a closed, outward-wound triangle set (divergence theorem). */
export function hullVolume(h: Hull): number {
  let v = 0;
  for (const [a, b, c] of h.faces)
    v += dt(at(h.vertices, a), crs(at(h.vertices, b), at(h.vertices, c)));
  return v / 6;
}
