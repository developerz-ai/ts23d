// Symmetric eigendecomposition by cyclic Jacobi rotations — what CMA-ES needs to sample from its
// covariance. Small n (a recipe has a handful of knobs), fixed sweep order: deterministic.

export interface Eigen {
  /** Eigenvalues (≥ 0 after clamping tiny negatives from round-off). */
  readonly values: number[];
  /** Column k is the eigenvector of values[k]; row-major n×n. */
  readonly vectors: number[][];
}

export function symmetricEigen(a: readonly (readonly number[])[]): Eigen {
  const n = a.length;
  const m = a.map((row) => [...row]);
  const v = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );
  const at = (r: number[][], i: number, j: number): number => r[i]?.[j] ?? 0;
  const set = (r: number[][], i: number, j: number, x: number): void => {
    const row = r[i];
    if (row) row[j] = x;
  };
  for (let sweep = 0; sweep < 64; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += at(m, i, j) ** 2;
    if (off < 1e-30) break;
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        const apq = at(m, p, q);
        if (Math.abs(apq) < 1e-300) continue;
        const theta = (at(m, q, q) - at(m, p, p)) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const mkp = at(m, k, p);
          const mkq = at(m, k, q);
          set(m, k, p, c * mkp - s * mkq);
          set(m, k, q, s * mkp + c * mkq);
        }
        for (let k = 0; k < n; k++) {
          const mpk = at(m, p, k);
          const mqk = at(m, q, k);
          set(m, p, k, c * mpk - s * mqk);
          set(m, q, k, s * mpk + c * mqk);
        }
        for (let k = 0; k < n; k++) {
          const vkp = at(v, k, p);
          const vkq = at(v, k, q);
          set(v, k, p, c * vkp - s * vkq);
          set(v, k, q, s * vkp + c * vkq);
        }
      }
  }
  return { values: m.map((_, i) => Math.max(0, at(m, i, i))), vectors: v };
}
