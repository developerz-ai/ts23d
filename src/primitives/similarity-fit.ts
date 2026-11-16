// Similarity fits (uniform scale · rotation · translation) for bringing a model's mesh onto the
// code skeleton: `similarityFit` solves point pairs in closed form (Horn 1987: the rotation is the
// top eigenvector of a 4×4 symmetric matrix, found by cyclic Jacobi — deterministic, no SVD
// sign flips; scale and translation follow, as in Umeyama 1991). `fitToSurface` is a trimmed ICP
// onto a surface (a field via `fieldProjector`, or a mesh's closest point): each point pairs with
// its projection, the worst `trim` share is dropped (a model's missing tail or extra floor),
// and the fit is re-solved; tried from four yaw starts so a model facing any way lands front-on.

import type { Vec3 } from '../core/index.ts';
import { invalid } from './check.ts';
import type { Field } from './sdf-ops.ts';

/** p ↦ s · R p + t (R row-major 3×3). */
export interface Similarity {
  readonly s: number;
  readonly r: readonly number[];
  readonly t: Vec3;
}

export const IDENTITY: Similarity = { s: 1, r: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] };

export function applySimilarity(m: Similarity, p: Vec3): Vec3 {
  const r = m.r;
  return [
    m.s * ((r[0] ?? 0) * p[0] + (r[1] ?? 0) * p[1] + (r[2] ?? 0) * p[2]) + m.t[0],
    m.s * ((r[3] ?? 0) * p[0] + (r[4] ?? 0) * p[1] + (r[5] ?? 0) * p[2]) + m.t[1],
    m.s * ((r[6] ?? 0) * p[0] + (r[7] ?? 0) * p[1] + (r[8] ?? 0) * p[2]) + m.t[2],
  ];
}

/** b ∘ a: apply a first. */
export function composeSimilarity(b: Similarity, a: Similarity): Similarity {
  const r: number[] = [];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      let v = 0;
      for (let k = 0; k < 3; k++) v += (b.r[i * 3 + k] ?? 0) * (a.r[k * 3 + j] ?? 0);
      r.push(v);
    }
  return { s: b.s * a.s, r, t: applySimilarity(b, a.t) };
}

/** Rotation about +Z by `deg`. */
export const yawSimilarity = (deg: number): Similarity => {
  const a = (deg * Math.PI) / 180;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return { s: 1, r: [c, -s, 0, s, c, 0, 0, 0, 1], t: [0, 0, 0] };
};

/** Largest-eigenvalue eigenvector of a symmetric 4×4 (row-major), cyclic Jacobi. */
function topEigen(m: number[]): number[] {
  const a = [...m];
  const v = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0;
    for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) off += (a[p * 4 + q] ?? 0) ** 2;
    if (off < 1e-30) break;
    for (let p = 0; p < 4; p++)
      for (let q = p + 1; q < 4; q++) {
        const apq = a[p * 4 + q] ?? 0;
        if (Math.abs(apq) < 1e-300) continue;
        const theta = ((a[q * 4 + q] ?? 0) - (a[p * 4 + p] ?? 0)) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < 4; k++) {
          const akp = a[k * 4 + p] ?? 0;
          const akq = a[k * 4 + q] ?? 0;
          a[k * 4 + p] = c * akp - s * akq;
          a[k * 4 + q] = s * akp + c * akq;
        }
        for (let k = 0; k < 4; k++) {
          const apk = a[p * 4 + k] ?? 0;
          const aqk = a[q * 4 + k] ?? 0;
          a[p * 4 + k] = c * apk - s * aqk;
          a[q * 4 + k] = s * apk + c * aqk;
        }
        for (let k = 0; k < 4; k++) {
          const vkp = v[k * 4 + p] ?? 0;
          const vkq = v[k * 4 + q] ?? 0;
          v[k * 4 + p] = c * vkp - s * vkq;
          v[k * 4 + q] = s * vkp + c * vkq;
        }
      }
  }
  let best = 0;
  for (let i = 1; i < 4; i++) if ((a[i * 5] ?? 0) > (a[best * 5] ?? 0)) best = i;
  return [0, 1, 2, 3].map((k) => v[k * 4 + best] ?? 0);
}

/** The similarity that best maps `src[i]` onto `dst[i]` (least squares, optional weights). */
export function similarityFit(
  src: readonly Vec3[],
  dst: readonly Vec3[],
  weights?: readonly number[],
): Similarity {
  if (src.length !== dst.length || src.length < 3)
    invalid(
      `similarityFit: ${src.length} source and ${dst.length} target points`,
      'pass ≥ 3 matching point pairs (landmarks), not all on one line',
    );
  let W = 0;
  const cs = [0, 0, 0];
  const cd = [0, 0, 0];
  src.forEach((p, i) => {
    const w = weights?.[i] ?? 1;
    W += w;
    for (let a = 0; a < 3; a++) {
      cs[a] = (cs[a] ?? 0) + w * (p[a] ?? 0);
      cd[a] = (cd[a] ?? 0) + w * (dst[i]?.[a] ?? 0);
    }
  });
  if (!(W > 0)) invalid('similarityFit: weights sum to 0', 'give the pairs positive weights');
  for (let a = 0; a < 3; a++) {
    cs[a] = (cs[a] ?? 0) / W;
    cd[a] = (cd[a] ?? 0) / W;
  }
  const S = new Array<number>(9).fill(0);
  let ss = 0;
  src.forEach((p, i) => {
    const w = weights?.[i] ?? 1;
    const x = [0, 1, 2].map((a) => (p[a] ?? 0) - (cs[a] ?? 0));
    const y = [0, 1, 2].map((a) => (dst[i]?.[a] ?? 0) - (cd[a] ?? 0));
    for (let a = 0; a < 3; a++) {
      ss += w * (x[a] ?? 0) ** 2;
      for (let b = 0; b < 3; b++)
        S[a * 3 + b] = (S[a * 3 + b] ?? 0) + w * (x[a] ?? 0) * (y[b] ?? 0);
    }
  });
  const g = (a: number, b: number): number => S[a * 3 + b] ?? 0;
  const [xx, xy, xz, yx, yy, yz, zx, zy, zz] = [
    g(0, 0),
    g(0, 1),
    g(0, 2),
    g(1, 0),
    g(1, 1),
    g(1, 2),
    g(2, 0),
    g(2, 1),
    g(2, 2),
  ];
  const N = [
    xx + yy + zz,
    yz - zy,
    zx - xz,
    xy - yx,
    yz - zy,
    xx - yy - zz,
    xy + yx,
    zx + xz,
    zx - xz,
    xy + yx,
    -xx + yy - zz,
    yz + zy,
    xy - yx,
    zx + xz,
    yz + zy,
    -xx - yy + zz,
  ];
  const [q0, q1, q2, q3] = topEigen(N) as [number, number, number, number];
  const r = [
    q0 * q0 + q1 * q1 - q2 * q2 - q3 * q3,
    2 * (q1 * q2 - q0 * q3),
    2 * (q1 * q3 + q0 * q2),
    2 * (q1 * q2 + q0 * q3),
    q0 * q0 - q1 * q1 + q2 * q2 - q3 * q3,
    2 * (q2 * q3 - q0 * q1),
    2 * (q1 * q3 - q0 * q2),
    2 * (q2 * q3 + q0 * q1),
    q0 * q0 - q1 * q1 - q2 * q2 + q3 * q3,
  ];
  let num = 0;
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) num += (r[a * 3 + b] ?? 0) * g(b, a);
  if (!(ss > 0)) invalid('similarityFit: the source points coincide', 'pass distinct landmarks');
  const s = num / ss;
  const rc = applySimilarity({ s, r, t: [0, 0, 0] }, cs as unknown as Vec3);
  return { s, r, t: [(cd[0] ?? 0) - rc[0], (cd[1] ?? 0) - rc[1], (cd[2] ?? 0) - rc[2]] };
}

export interface SurfaceFit {
  readonly fit: Similarity;
  /** Mean distance to the surface over the kept pairs after the fit, metres. */
  readonly residual: number;
}

/** Where a point lands on the target surface, and how far it was. */
export type Projector = (p: Vec3) => { readonly q: Vec3; readonly e: number };

/** Project onto a field's zero set: p − f(p) ∇f / |∇f| (central differences, step h). */
export function fieldProjector(field: Field, h = 1e-3): Projector {
  return (p) => {
    const d = field(p);
    const gx = field([p[0] + h, p[1], p[2]]) - field([p[0] - h, p[1], p[2]]);
    const gy = field([p[0], p[1] + h, p[2]]) - field([p[0], p[1] - h, p[2]]);
    const gz = field([p[0], p[1], p[2] + h]) - field([p[0], p[1], p[2] - h]);
    const l = Math.hypot(gx, gy, gz) || 1;
    return { q: [p[0] - (d * gx) / l, p[1] - (d * gy) / l, p[2] - (d * gz) / l], e: Math.abs(d) };
  };
}

/** Trimmed ICP of `points` onto a surface (a field's projector, a mesh's closest point), from each
 *  start; the best fit wins. */
export function fitToSurface(
  points: readonly Vec3[],
  project: Projector,
  starts: readonly Similarity[],
  o: { readonly iterations?: number; readonly trim?: number } = {},
): SurfaceFit {
  const iters = o.iterations ?? 12;
  const keep = 1 - (o.trim ?? 0.2);
  const step = (m: Similarity): { residual: number; next: Similarity } => {
    const pairs = points.map((p0) => ({ p0, ...project(applySimilarity(m, p0)) }));
    const kept = [...pairs]
      .sort((a, b) => a.e - b.e)
      .slice(0, Math.max(3, Math.floor(pairs.length * keep)));
    const residual = kept.reduce((s, k) => s + k.e, 0) / kept.length;
    const next = similarityFit(
      kept.map((k) => k.p0),
      kept.map((k) => k.q),
    );
    return { residual, next };
  };
  let best: SurfaceFit | null = null;
  for (const start of starts) {
    let m = start;
    let last: SurfaceFit = { fit: m, residual: Infinity };
    for (let i = 0; i <= iters; i++) {
      const r = step(m);
      if (r.residual >= last.residual) break;
      last = { fit: m, residual: r.residual };
      m = r.next;
    }
    if (!best || last.residual < best.residual) best = last;
  }
  if (!best) invalid('fitToSurface: no start pose given', 'pass at least one start similarity');
  return best;
}
