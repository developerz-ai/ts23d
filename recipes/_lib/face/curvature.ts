// Mean curvature per vertex of a face quad mesh, for the skin painter (./paint.ts): crevices
// darker, ridges lifted. Scale-free across LODs (curvature × edge length).

import { dmath } from '@developerz.ai/ts23d';
import type { QuadMesh } from './base.ts';

/** Mean-curvature proxy per vertex: + convex, − concave (umbrella Laplacian along the normal). */
export function curvature(m: QuadMesh, n: Float64Array): Float64Array {
  const V = m.p.length / 3;
  const sum = new Float64Array(V * 3);
  const cnt = new Float64Array(V);
  const el = new Float64Array(V);
  for (let f = 0; f < m.q.length; f += 4)
    for (let k = 0; k < 4; k++) {
      const a = m.q[f + k] ?? 0;
      const b = m.q[f + ((k + 1) % 4)] ?? 0;
      for (const [u, v] of [
        [a, b],
        [b, a],
      ] as const) {
        for (let e = 0; e < 3; e++) sum[u * 3 + e] = (sum[u * 3 + e] ?? 0) + (m.p[v * 3 + e] ?? 0);
        cnt[u] = (cnt[u] ?? 0) + 1;
        el[u] =
          (el[u] ?? 0) +
          dmath.hypot(
            (m.p[u * 3] ?? 0) - (m.p[v * 3] ?? 0),
            (m.p[u * 3 + 1] ?? 0) - (m.p[v * 3 + 1] ?? 0),
            (m.p[u * 3 + 2] ?? 0) - (m.p[v * 3 + 2] ?? 0),
          );
      }
    }
  const k = new Float64Array(V);
  for (let v = 0; v < V; v++) {
    const c = cnt[v] || 1;
    const h = (el[v] ?? 0) / c || 1;
    let dot = 0;
    for (let e = 0; e < 3; e++)
      dot += ((sum[v * 3 + e] ?? 0) / c - (m.p[v * 3 + e] ?? 0)) * (n[v * 3 + e] ?? 0);
    k[v] = (-dot / (h * h)) * h; // ≈ curvature × edge length: scale-free across LODs
  }
  return k;
}
