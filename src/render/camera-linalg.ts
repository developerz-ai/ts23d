// Small dense linear algebra for the camera solve: Gaussian elimination with partial pivoting and
// the smallest eigenvector of a symmetric matrix (cyclic Jacobi). Deterministic, allocation-light;
// sized for 6×6 normal equations and the 12×12 DLT system.

/** Solve A x = b (Gaussian elimination, partial pivoting); null when singular. */
export function solveLinear(A: readonly number[][], b: readonly number[]): number[] | null {
  const n = b.length;
  const m = A.map((row, i) => [...row, b[i] ?? 0]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r]?.[c] ?? 0) > Math.abs(m[p]?.[c] ?? 0)) p = r;
    const pr = m[p];
    const cr = m[c];
    if (!pr || !cr || Math.abs(pr[c] ?? 0) < 1e-300) return null;
    [m[c], m[p]] = [pr, cr];
    for (let r = 0; r < n; r++) {
      const row = m[r];
      if (r === c || !row) continue;
      const k = (row[c] ?? 0) / (pr[c] ?? 1);
      for (let j = c; j <= n; j++) row[j] = (row[j] ?? 0) - k * (pr[j] ?? 0);
    }
  }
  return m.map((row, i) => (row[n] ?? 0) / (row[i] ?? 1));
}

/** Eigenvector of the smallest eigenvalue of a symmetric matrix (cyclic Jacobi). */
export function smallestEigenvector(S: number[][]): number[] {
  const n = S.length;
  const a = S.map((r) => [...r]);
  const v = a.map((_, i) => a.map((__, j) => (i === j ? 1 : 0)));
  const at = (m: number[][], i: number, j: number): number => m[i]?.[j] ?? 0;
  const set = (m: number[][], i: number, j: number, x: number): void => {
    const row = m[i];
    if (row) row[j] = x;
  };
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += at(a, p, q) ** 2;
    if (off < 1e-24) break;
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(at(a, p, q)) < 1e-300) continue;
        const th = (at(a, q, q) - at(a, p, p)) / (2 * at(a, p, q));
        const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const [akp, akq] = [at(a, k, p), at(a, k, q)];
          set(a, k, p, c * akp - s * akq);
          set(a, k, q, s * akp + c * akq);
        }
        for (let k = 0; k < n; k++) {
          const [apk, aqk] = [at(a, p, k), at(a, q, k)];
          set(a, p, k, c * apk - s * aqk);
          set(a, q, k, s * apk + c * aqk);
        }
        for (let k = 0; k < n; k++) {
          const [vkp, vkq] = [at(v, k, p), at(v, k, q)];
          set(v, k, p, c * vkp - s * vkq);
          set(v, k, q, s * vkp + c * vkq);
        }
      }
  }
  let best = 0;
  for (let i = 1; i < n; i++) if (at(a, i, i) < at(a, best, best)) best = i;
  return v.map((row) => row[best] ?? 0);
}
