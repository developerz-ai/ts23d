// Roots for strand cards: area-weighted Poisson-disk samples on a mesh (darts oversampled ×2 per
// triangle with `rng`, shuffled, kept when no kept neighbour is closer than the local radius
// 0.62 / √density), and clump membership (each root joins the nearest of every k-th root).

import { cross, type Mesh, type Rng, sub, normalize as unit, type Vec3 } from '../core/index.ts';

export interface Root {
  readonly p: Vec3;
  readonly t: number;
  readonly b1: number;
  readonly b2: number;
  readonly r: number;
}

export const V = (a: ArrayLike<number>, i: number): Vec3 => [
  a[i * 3] ?? 0,
  a[i * 3 + 1] ?? 0,
  a[i * 3 + 2] ?? 0,
];
const lerp3 = (w: readonly number[], a: Vec3, b: Vec3, c: Vec3): Vec3 => {
  const [x, y, z] = [w[0] ?? 0, w[1] ?? 0, w[2] ?? 0];
  return [
    x * a[0] + y * b[0] + z * c[0],
    x * a[1] + y * b[1] + z * c[1],
    x * a[2] + y * b[2] + z * c[2],
  ];
};
export const mad = (a: Vec3, b: Vec3, s: number): Vec3 => [
  a[0] + b[0] * s,
  a[1] + b[1] * s,
  a[2] + b[2] * s,
];

/** Surface point, normal and skin colour at triangle t, barycentrics (1 − b1 − b2, b1, b2). */
export function sample(m: Mesh, t: number, b1: number, b2: number): { p: Vec3; n: Vec3; c: Vec3 } {
  const i = [0, 1, 2].map((k) => m.indices[t * 3 + k] ?? 0);
  const w = [1 - b1 - b2, b1, b2];
  const at = (a: Float32Array): Vec3 => lerp3(w, V(a, i[0] ?? 0), V(a, i[1] ?? 0), V(a, i[2] ?? 0));
  return { p: at(m.positions), n: unit(at(m.normals)), c: at(m.colors) };
}

/** Poisson-disk roots of one zone: oversampled darts, shuffled, kept when no neighbour is closer. */
export function poissonRoots(m: Mesh, density: (p: Vec3, n: Vec3) => number, rng: Rng): Root[] {
  const darts: Root[] = [];
  for (let t = 0; t < m.indices.length / 3; t++) {
    const [a, b, c] = [0, 1, 2].map((k) => V(m.positions, m.indices[t * 3 + k] ?? 0)) as [
      Vec3,
      Vec3,
      Vec3,
    ];
    const e = cross(sub(b, a), sub(c, a));
    const area = Math.hypot(e[0], e[1], e[2]) / 2;
    if (area <= 0) continue;
    const mid = sample(m, t, 1 / 3, 1 / 3);
    const want = area * Math.max(0, density(mid.p, mid.n)) * 2;
    for (let k = Math.floor(want + rng.next()); k > 0; k--) {
      const r1 = Math.sqrt(rng.next());
      const r2 = rng.next();
      const b1 = r1 * (1 - r2);
      const b2 = r1 * r2;
      const s = sample(m, t, b1, b2);
      const d = density(s.p, s.n);
      if (d > 0) darts.push({ p: s.p, t, b1, b2, r: 0.62 / Math.sqrt(d) });
    }
  }
  for (let i = darts.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const a = darts[i];
    const b = darts[j];
    if (a && b) {
      darts[i] = b;
      darts[j] = a;
    }
  }
  const cell = Math.max(1e-6, ...darts.map((d) => d.r));
  const grid = new Map<string, Root[]>();
  const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;
  const kept: Root[] = [];
  for (const d of darts) {
    const g = d.p.map((v) => Math.floor(v / cell));
    let free = true;
    for (let x = -1; x <= 1 && free; x++)
      for (let y = -1; y <= 1 && free; y++)
        for (let w = -1; w <= 1 && free; w++)
          for (const o of grid.get(key((g[0] ?? 0) + x, (g[1] ?? 0) + y, (g[2] ?? 0) + w)) ?? [])
            if (
              Math.hypot(o.p[0] - d.p[0], o.p[1] - d.p[1], o.p[2] - d.p[2]) < Math.min(o.r, d.r)
            ) {
              free = false;
              break;
            }
    if (!free) continue;
    kept.push(d);
    const k = key(g[0] ?? 0, g[1] ?? 0, g[2] ?? 0);
    grid.set(k, [...(grid.get(k) ?? []), d]);
  }
  return kept;
}

/**
 * Index of each root's clump centre: every `k`-th root (emission order is random) leads one; a
 * root joins the nearest leader within 2.5 × its Poisson radius and `reach`, else it leads itself
 * (a clump never bridges two legs).
 */
export function clumpOf(list: readonly Root[], k: number, reach = Infinity): Int32Array {
  const out = new Int32Array(list.length).map((_, i) => i);
  if (k < 2) return out;
  const heads = list.map((_, i) => i).filter((i) => i % k === 0);
  list.forEach((r, i) => {
    if (i % k === 0) return;
    let best = Math.min(2.5 * r.r, reach) ** 2;
    for (const h of heads) {
      const q = list[h]?.p ?? r.p;
      const d = (q[0] - r.p[0]) ** 2 + (q[1] - r.p[1]) ** 2 + (q[2] - r.p[2]) ** 2;
      if (d < best) {
        best = d;
        out[i] = h;
      }
    }
  });
  return out;
}
