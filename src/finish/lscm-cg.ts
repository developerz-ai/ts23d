// The LSCM solver: Jacobi-preconditioned conjugate gradient on the normal equations AᵀA x = 0
// of the conformal energy, matrix-free (each triangle stores its three slots and √area·∇φ, two
// residual rows), pinned unknowns held fixed. Zero dependencies; deterministic (fixed order).

/** y = AᵀA x restricted to the masked unknowns (pinned columns read as zero when `mask`). */
function normalApply(
  x: Float64Array,
  ids: Int32Array,
  coef: Float64Array,
  nt: number,
  out: Float64Array,
): void {
  out.fill(0);
  for (let i = 0; i < nt; i++) {
    let r1 = 0;
    let r2 = 0;
    for (let k = 0; k < 3; k++) {
      const s = ids[i * 3 + k] ?? 0;
      const gx = coef[i * 6 + k * 2] ?? 0;
      const gy = coef[i * 6 + k * 2 + 1] ?? 0;
      const u = x[2 * s] ?? 0;
      const v = x[2 * s + 1] ?? 0;
      r1 += gx * u - gy * v;
      r2 += gy * u + gx * v;
    }
    for (let k = 0; k < 3; k++) {
      const s = ids[i * 3 + k] ?? 0;
      const gx = coef[i * 6 + k * 2] ?? 0;
      const gy = coef[i * 6 + k * 2 + 1] ?? 0;
      out[2 * s] = (out[2 * s] ?? 0) + gx * r1 + gy * r2;
      out[2 * s + 1] = (out[2 * s + 1] ?? 0) - gy * r1 + gx * r2;
    }
  }
}

/** Jacobi-preconditioned CG on AᵀA x = 0 with pinned entries fixed (in place). */
export function cg(
  x: Float64Array,
  free: Uint8Array,
  ids: Int32Array,
  coef: Float64Array,
  nt: number,
): void {
  const n = x.length;
  const diag = new Float64Array(n);
  for (let i = 0; i < nt; i++)
    for (let k = 0; k < 3; k++) {
      const s = ids[i * 3 + k] ?? 0;
      const d = (coef[i * 6 + k * 2] ?? 0) ** 2 + (coef[i * 6 + k * 2 + 1] ?? 0) ** 2;
      diag[2 * s] = (diag[2 * s] ?? 0) + d;
      diag[2 * s + 1] = (diag[2 * s + 1] ?? 0) + d;
    }
  const r = new Float64Array(n);
  const z = new Float64Array(n);
  const p = new Float64Array(n);
  const q = new Float64Array(n);
  normalApply(x, ids, coef, nt, r);
  let rz = 0;
  let r0 = 0;
  for (let i = 0; i < n; i++) {
    r[i] = free[i] ? -(r[i] ?? 0) : 0;
    z[i] = (r[i] ?? 0) / ((diag[i] ?? 0) || 1);
    p[i] = z[i] ?? 0;
    rz += (r[i] ?? 0) * (z[i] ?? 0);
    r0 += (r[i] ?? 0) ** 2;
  }
  const tol = r0 * 1e-12;
  for (let it = 0; it < 2000 && rz > 0; it++) {
    normalApply(p, ids, coef, nt, q);
    let pq = 0;
    for (let i = 0; i < n; i++) {
      if (!free[i]) q[i] = 0;
      pq += (p[i] ?? 0) * (q[i] ?? 0);
    }
    if (pq <= 0) break;
    const alpha = rz / pq;
    let rr = 0;
    let rzNext = 0;
    for (let i = 0; i < n; i++) {
      x[i] = (x[i] ?? 0) + alpha * (p[i] ?? 0);
      r[i] = (r[i] ?? 0) - alpha * (q[i] ?? 0);
      z[i] = (r[i] ?? 0) / ((diag[i] ?? 0) || 1);
      rr += (r[i] ?? 0) ** 2;
      rzNext += (r[i] ?? 0) * (z[i] ?? 0);
    }
    if (rr <= tol) break;
    const beta = rzNext / rz;
    rz = rzNext;
    for (let i = 0; i < n; i++) p[i] = (z[i] ?? 0) + beta * (p[i] ?? 0);
  }
}
