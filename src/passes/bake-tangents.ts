// Per-vertex tangent frames for a baked normal map: T along +U from each face's UV derivatives,
// area-weighted, Gram–Schmidt against the vertex normal, handedness w so that the shader's
// B = cross(N, T)·w points toward DECREASING v — image "up", glTF's green-up normal maps (the same
// convention as /export's tangentsOf). The bake encodes in exactly
// this frame and the exporter writes these tangents, so the map and the mesh always agree.

import type { Mesh } from '../core/index.ts';

/** VEC4 per vertex (xyz unit tangent, w = ±1). */
export function uvTangents(m: Mesh): Float32Array {
  const n = m.positions.length / 3;
  const t = new Float64Array(n * 3);
  const b = new Float64Array(n * 3);
  const P = m.positions;
  const U = m.uvs;
  for (let f = 0; f < m.indices.length; f += 3) {
    const [i0, i1, i2] = [m.indices[f] ?? 0, m.indices[f + 1] ?? 0, m.indices[f + 2] ?? 0];
    const e1 = [0, 1, 2].map((k) => (P[i1 * 3 + k] ?? 0) - (P[i0 * 3 + k] ?? 0));
    const e2 = [0, 1, 2].map((k) => (P[i2 * 3 + k] ?? 0) - (P[i0 * 3 + k] ?? 0));
    const du1 = (U[i1 * 2] ?? 0) - (U[i0 * 2] ?? 0);
    const dv1 = (U[i1 * 2 + 1] ?? 0) - (U[i0 * 2 + 1] ?? 0);
    const du2 = (U[i2 * 2] ?? 0) - (U[i0 * 2] ?? 0);
    const dv2 = (U[i2 * 2 + 1] ?? 0) - (U[i0 * 2 + 1] ?? 0);
    const det = du1 * dv2 - du2 * dv1;
    if (Math.abs(det) < 1e-20) continue;
    // Area weighting: the raw (unnormalised by |det|) derivative scaled by the UV area sign only.
    const r = 1 / det;
    for (const i of [i0, i1, i2])
      for (let k = 0; k < 3; k++) {
        t[i * 3 + k] =
          (t[i * 3 + k] ?? 0) + ((e1[k] ?? 0) * dv2 - (e2[k] ?? 0) * dv1) * r * Math.abs(det);
        b[i * 3 + k] =
          (b[i * 3 + k] ?? 0) + ((e2[k] ?? 0) * du1 - (e1[k] ?? 0) * du2) * r * Math.abs(det);
      }
  }
  const out = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const N = [m.normals[i * 3] ?? 0, m.normals[i * 3 + 1] ?? 0, m.normals[i * 3 + 2] ?? 1];
    let T = [t[i * 3] ?? 0, t[i * 3 + 1] ?? 0, t[i * 3 + 2] ?? 0];
    const d = (N[0] ?? 0) * (T[0] ?? 0) + (N[1] ?? 0) * (T[1] ?? 0) + (N[2] ?? 0) * (T[2] ?? 0);
    T = T.map((v, k) => v - (N[k] ?? 0) * d);
    let l = Math.hypot(T[0] ?? 0, T[1] ?? 0, T[2] ?? 0);
    if (l < 1e-12) {
      // No usable UV gradient: any vector perpendicular to N.
      T = Math.abs(N[0] ?? 0) < 0.9 ? [0, -(N[2] ?? 0), N[1] ?? 0] : [N[2] ?? 0, 0, -(N[0] ?? 0)];
      l = Math.hypot(T[0] ?? 0, T[1] ?? 0, T[2] ?? 0) || 1;
    }
    T = T.map((v) => v / l);
    const c: [number, number, number] = [
      (N[1] ?? 0) * (T[2] ?? 0) - (N[2] ?? 0) * (T[1] ?? 0),
      (N[2] ?? 0) * (T[0] ?? 0) - (N[0] ?? 0) * (T[2] ?? 0),
      (N[0] ?? 0) * (T[1] ?? 0) - (N[1] ?? 0) * (T[0] ?? 0),
    ];
    const w =
      c[0] * (b[i * 3] ?? 0) + c[1] * (b[i * 3 + 1] ?? 0) + c[2] * (b[i * 3 + 2] ?? 0) < 0 ? 1 : -1;
    out.set([T[0] ?? 1, T[1] ?? 0, T[2] ?? 0, w], i * 4);
  }
  return out;
}
