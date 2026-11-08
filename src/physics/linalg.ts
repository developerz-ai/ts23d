// 3×3 symmetric linear algebra for shape fitting and inertia: cyclic Jacobi eigen-decomposition
// (deterministic: fixed sweep order, sorted output) and rotation matrix → quaternion.

import type { Quat, Vec3 } from '../core/index.ts';

/** Row-major 3×3: m[r][c]. */
export type Mat3 = readonly [Vec3, Vec3, Vec3];

export interface Eigen {
  /** Eigenvalues, descending. */
  readonly values: Vec3;
  /** Unit eigenvectors matching `values`, forming a right-handed frame. */
  readonly axes: readonly [Vec3, Vec3, Vec3];
}

const get = (m: number[][], r: number, c: number): number => m[r]?.[c] ?? 0;
const set = (m: number[][], r: number, c: number, v: number): void => {
  const row = m[r];
  if (row) row[c] = v;
};

/** Eigenvalues/vectors of a symmetric 3×3 (cyclic Jacobi, ≤ 50 sweeps). */
export function eigenSym(a: Mat3): Eigen {
  const m = a.map((r) => [...r]);
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const scaleOf = Math.max(1e-300, ...a.flat().map(Math.abs));
  for (let sweep = 0; sweep < 50; sweep++) {
    const off = Math.abs(get(m, 0, 1)) + Math.abs(get(m, 0, 2)) + Math.abs(get(m, 1, 2));
    if (off <= 1e-14 * scaleOf) break;
    for (const [p, q] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ] as const) {
      const apq = get(m, p, q);
      if (Math.abs(apq) <= 1e-300) continue;
      const theta = (get(m, q, q) - get(m, p, p)) / (2 * apq);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1);
      const s = t * c;
      for (let k = 0; k < 3; k++) {
        const mkp = get(m, k, p);
        const mkq = get(m, k, q);
        set(m, k, p, c * mkp - s * mkq);
        set(m, k, q, s * mkp + c * mkq);
      }
      for (let k = 0; k < 3; k++) {
        const mpk = get(m, p, k);
        const mqk = get(m, q, k);
        set(m, p, k, c * mpk - s * mqk);
        set(m, q, k, s * mpk + c * mqk);
      }
      for (let k = 0; k < 3; k++) {
        const vkp = get(v, k, p);
        const vkq = get(v, k, q);
        set(v, k, p, c * vkp - s * vkq);
        set(v, k, q, s * vkp + c * vkq);
      }
    }
  }
  const order = [0, 1, 2].sort((i, j) => get(m, j, j) - get(m, i, i) || i - j);
  const col = (i: number): Vec3 => canonical([get(v, 0, i), get(v, 1, i), get(v, 2, i)]);
  const [i0, i1, i2] = [order[0] ?? 0, order[1] ?? 1, order[2] ?? 2];
  const x = col(i0);
  const y = col(i1);
  const z = cross3(x, y);
  return { values: [get(m, i0, i0), get(m, i1, i1), get(m, i2, i2)], axes: [x, y, z] };
}

const cross3 = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Sign-normalise an axis (largest component positive) so the same input gives the same frame. */
function canonical(a: Vec3): Vec3 {
  const big = [0, 1, 2].reduce(
    (b, i) => (Math.abs(a[i] ?? 0) > Math.abs(a[b] ?? 0) + 1e-12 ? i : b),
    0,
  );
  return (a[big] ?? 0) < 0 ? [-a[0], -a[1], -a[2]] : a;
}

/** Quaternion [x, y, z, w] of the rotation whose matrix has columns `x`, `y`, `z`. */
export function quatFromAxes(x: Vec3, y: Vec3, z: Vec3): Quat {
  const [m00, m10, m20] = x;
  const [m01, m11, m21] = y;
  const [m02, m12, m22] = z;
  const tr = m00 + m11 + m22;
  let q: [number, number, number, number];
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4];
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    q = [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    q = [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    q = [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s];
  }
  const n = Math.hypot(...q);
  const sign = q[3] < 0 ? -1 : 1;
  return [(sign * q[0]) / n, (sign * q[1]) / n, (sign * q[2]) / n, (sign * q[3]) / n];
}

/** Any right-handed frame whose Y is `axis` (capsule/cylinder colliders are Y-aligned). */
export function frameWithY(axis: Vec3): readonly [Vec3, Vec3, Vec3] {
  const y = axis;
  const helper: Vec3 = Math.abs(y[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const xr = cross3(y, helper);
  const l = Math.hypot(...xr);
  const x: Vec3 = [xr[0] / l, xr[1] / l, xr[2] / l];
  return [x, y, cross3(x, y)];
}

export { cross3 };
