// The 3D thin-plate spline behind `warpTPS`: from n landmark pairs, solve the smoothest map
// (biharmonic kernel U(r) = r in 3D, plus an affine part) that sends every `from` point to its
// `to` point — exactly with stiffness 0, approximately (smoother) above it. Landmarks are
// normalised (centred, unit RMS radius) before the solve, which runs in float64 Gaussian
// elimination with partial pivoting; a singular system fails with T3D_WARP_INVALID. Pure function
// of its inputs, so the warp is deterministic.

import { Ts23dError, type Vec3 } from '../core/index.ts';

export interface TpsOptions {
  /** Regularisation λ ≥ 0 in normalised units: 0 interpolates every landmark exactly; ~0.01–0.1
   *  relaxes them for a smoother, less local warp (landmarks then land near, not on, `to`). */
  readonly stiffness?: number;
}

/** A solved warp: `map` moves a point, `jacobian` is d(map)/dp (row-major 3×3) at a point. */
export interface Tps {
  readonly map: (p: Vec3) => Vec3;
  readonly jacobian: (p: Vec3) => number[];
}

function invalid(cause: string, fix: string): never {
  throw new Ts23dError('T3D_WARP_INVALID', { cause, fix });
}

function validate(from: readonly Vec3[], to: readonly Vec3[], stiffness: number): void {
  if (from.length !== to.length)
    invalid(
      `${from.length} 'from' landmarks but ${to.length} 'to' landmarks`,
      'pass one target per source landmark, in the same order',
    );
  if (from.length < 4)
    invalid(
      `${from.length} landmarks pin no 3D frame`,
      'pass at least 4 landmarks that are not all on one plane',
    );
  if (!(stiffness >= 0 && Number.isFinite(stiffness)))
    invalid(`stiffness ${stiffness} is not a finite number ≥ 0`, 'use stiffness 0 (exact) or > 0');
  for (const p of [...from, ...to])
    if (!p.every(Number.isFinite))
      invalid(`landmark [${p.join(', ')}] is not finite`, 'compute landmarks from finite numbers');
}

/** Solve A x = B in place (A n×n, B n×k, row-major); returns x as B, or null when singular. */
function solve(A: Float64Array, B: Float64Array, n: number, k: number): Float64Array | null {
  let scale = 0;
  for (const v of A) scale = Math.max(scale, Math.abs(v));
  const eps = 1e-11 * (scale || 1);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++)
      if (Math.abs(A[r * n + c] ?? 0) > Math.abs(A[piv * n + c] ?? 0)) piv = r;
    const pv = A[piv * n + c] ?? 0;
    if (Math.abs(pv) < eps) return null;
    if (piv !== c) {
      for (let j = 0; j < n; j++) {
        const t = A[c * n + j] ?? 0;
        A[c * n + j] = A[piv * n + j] ?? 0;
        A[piv * n + j] = t;
      }
      for (let j = 0; j < k; j++) {
        const t = B[c * k + j] ?? 0;
        B[c * k + j] = B[piv * k + j] ?? 0;
        B[piv * k + j] = t;
      }
    }
    for (let r = c + 1; r < n; r++) {
      const f = (A[r * n + c] ?? 0) / pv;
      if (f === 0) continue;
      for (let j = c; j < n; j++) A[r * n + j] = (A[r * n + j] ?? 0) - f * (A[c * n + j] ?? 0);
      for (let j = 0; j < k; j++) B[r * k + j] = (B[r * k + j] ?? 0) - f * (B[c * k + j] ?? 0);
    }
  }
  for (let c = n - 1; c >= 0; c--) {
    const pv = A[c * n + c] ?? 1;
    for (let j = 0; j < k; j++) {
      let s = B[c * k + j] ?? 0;
      for (let i = c + 1; i < n; i++) s -= (A[c * n + i] ?? 0) * (B[i * k + j] ?? 0);
      B[c * k + j] = s / pv;
    }
  }
  return B;
}

/** Solve the thin-plate spline taking `from[i]` to `to[i]`. */
export function tpsWarp(from: readonly Vec3[], to: readonly Vec3[], o: TpsOptions = {}): Tps {
  const lambda = o.stiffness ?? 0;
  validate(from, to, lambda);
  const n = from.length;
  const c = [0, 0, 0];
  for (const p of from) for (let k = 0; k < 3; k++) c[k] = (c[k] ?? 0) + (p[k] ?? 0) / n;
  let rms = 0;
  for (const p of from)
    rms += ((p[0] - (c[0] ?? 0)) ** 2 + (p[1] - (c[1] ?? 0)) ** 2 + (p[2] - (c[2] ?? 0)) ** 2) / n;
  const s = Math.sqrt(rms) || 1;
  const u = new Float64Array(n * 3);
  for (let i = 0; i < n; i++)
    for (let k = 0; k < 3; k++) u[i * 3 + k] = ((from[i]?.[k] ?? 0) - (c[k] ?? 0)) / s;
  const m = n + 4;
  const A = new Float64Array(m * m);
  const B = new Float64Array(m * 3);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const r = Math.hypot(
        (u[i * 3] ?? 0) - (u[j * 3] ?? 0),
        (u[i * 3 + 1] ?? 0) - (u[j * 3 + 1] ?? 0),
        (u[i * 3 + 2] ?? 0) - (u[j * 3 + 2] ?? 0),
      );
      A[i * m + j] = i === j ? lambda : r;
    }
    const row = [1, u[i * 3] ?? 0, u[i * 3 + 1] ?? 0, u[i * 3 + 2] ?? 0];
    for (let k = 0; k < 4; k++) {
      A[i * m + n + k] = row[k] ?? 0;
      A[(n + k) * m + i] = row[k] ?? 0;
    }
    for (let k = 0; k < 3; k++) B[i * 3 + k] = ((to[i]?.[k] ?? 0) - (from[i]?.[k] ?? 0)) / s;
  }
  const x = solve(A, B, m, 3);
  if (!x)
    invalid(
      `the ${n} landmarks are coplanar, collinear or duplicated, so the spline is singular`,
      'spread the landmarks over all three axes and drop duplicates, or set stiffness > 0',
    );
  const w = x;
  const map = (p: Vec3): Vec3 => {
    const q = [(p[0] - (c[0] ?? 0)) / s, (p[1] - (c[1] ?? 0)) / s, (p[2] - (c[2] ?? 0)) / s];
    const d = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const r = Math.hypot(
        (q[0] ?? 0) - (u[i * 3] ?? 0),
        (q[1] ?? 0) - (u[i * 3 + 1] ?? 0),
        (q[2] ?? 0) - (u[i * 3 + 2] ?? 0),
      );
      for (let k = 0; k < 3; k++) d[k] = (d[k] ?? 0) + (w[i * 3 + k] ?? 0) * r;
    }
    for (let k = 0; k < 3; k++)
      d[k] =
        (d[k] ?? 0) +
        (w[n * 3 + k] ?? 0) +
        (w[(n + 1) * 3 + k] ?? 0) * (q[0] ?? 0) +
        (w[(n + 2) * 3 + k] ?? 0) * (q[1] ?? 0) +
        (w[(n + 3) * 3 + k] ?? 0) * (q[2] ?? 0);
    return [p[0] + s * (d[0] ?? 0), p[1] + s * (d[1] ?? 0), p[2] + s * (d[2] ?? 0)];
  };
  const jacobian = (p: Vec3): number[] => {
    const q = [(p[0] - (c[0] ?? 0)) / s, (p[1] - (c[1] ?? 0)) / s, (p[2] - (c[2] ?? 0)) / s];
    // J[k][j] = δkj + a_jk + Σ w_ik (q − u_i)_j / |q − u_i|
    const J = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    for (let k = 0; k < 3; k++)
      for (let j = 0; j < 3; j++)
        J[k * 3 + j] = (J[k * 3 + j] ?? 0) + (w[(n + 1 + j) * 3 + k] ?? 0);
    for (let i = 0; i < n; i++) {
      const dv = [
        (q[0] ?? 0) - (u[i * 3] ?? 0),
        (q[1] ?? 0) - (u[i * 3 + 1] ?? 0),
        (q[2] ?? 0) - (u[i * 3 + 2] ?? 0),
      ];
      const r = Math.hypot(dv[0] ?? 0, dv[1] ?? 0, dv[2] ?? 0);
      if (r < 1e-12) continue;
      for (let k = 0; k < 3; k++)
        for (let j = 0; j < 3; j++)
          J[k * 3 + j] = (J[k * 3 + j] ?? 0) + ((w[i * 3 + k] ?? 0) * (dv[j] ?? 0)) / r;
    }
    return J;
  };
  return { map, jacobian };
}
