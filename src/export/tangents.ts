// Per-vertex tangents (glTF TANGENT, VEC4) for normal-mapped meshes: Lengyel's UV-derivative
// method, Gram-Schmidt against the vertex normal, w = handedness. The bitangent cross(N, T) · w
// points toward DECREASING glTF v (the "green up" convention the painter writes). Identical to
// MikkTSpace on flat-shaded quads; close, not bit-equal, on smooth curved surfaces.

import type { Mesh } from '../core/index.ts';

export function tangentsOf(m: Mesh): Float32Array {
  const n = m.positions.length / 3;
  const tan = new Float32Array(n * 3);
  const bit = new Float32Array(n * 3);
  const P = m.positions;
  const U = m.uvs;
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = m.indices[t] ?? 0;
    const b = m.indices[t + 1] ?? 0;
    const c = m.indices[t + 2] ?? 0;
    const e1x = (P[b * 3] ?? 0) - (P[a * 3] ?? 0);
    const e1y = (P[b * 3 + 1] ?? 0) - (P[a * 3 + 1] ?? 0);
    const e1z = (P[b * 3 + 2] ?? 0) - (P[a * 3 + 2] ?? 0);
    const e2x = (P[c * 3] ?? 0) - (P[a * 3] ?? 0);
    const e2y = (P[c * 3 + 1] ?? 0) - (P[a * 3 + 1] ?? 0);
    const e2z = (P[c * 3 + 2] ?? 0) - (P[a * 3 + 2] ?? 0);
    const du1 = (U[b * 2] ?? 0) - (U[a * 2] ?? 0);
    const dv1 = -((U[b * 2 + 1] ?? 0) - (U[a * 2 + 1] ?? 0));
    const du2 = (U[c * 2] ?? 0) - (U[a * 2] ?? 0);
    const dv2 = -((U[c * 2 + 1] ?? 0) - (U[a * 2 + 1] ?? 0));
    const det = du1 * dv2 - du2 * dv1;
    if (Math.abs(det) < 1e-12) continue;
    const r = 1 / det;
    const tx = (e1x * dv2 - e2x * dv1) * r;
    const ty = (e1y * dv2 - e2y * dv1) * r;
    const tz = (e1z * dv2 - e2z * dv1) * r;
    const bx = (e2x * du1 - e1x * du2) * r;
    const by = (e2y * du1 - e1y * du2) * r;
    const bz = (e2z * du1 - e1z * du2) * r;
    for (const v of [a, b, c]) {
      tan[v * 3] = (tan[v * 3] ?? 0) + tx;
      tan[v * 3 + 1] = (tan[v * 3 + 1] ?? 0) + ty;
      tan[v * 3 + 2] = (tan[v * 3 + 2] ?? 0) + tz;
      bit[v * 3] = (bit[v * 3] ?? 0) + bx;
      bit[v * 3 + 1] = (bit[v * 3 + 1] ?? 0) + by;
      bit[v * 3 + 2] = (bit[v * 3 + 2] ?? 0) + bz;
    }
  }
  const out = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) {
    const nx = m.normals[v * 3] ?? 0;
    const ny = m.normals[v * 3 + 1] ?? 0;
    const nz = m.normals[v * 3 + 2] ?? 1;
    let tx = tan[v * 3] ?? 0;
    let ty = tan[v * 3 + 1] ?? 0;
    let tz = tan[v * 3 + 2] ?? 0;
    const d = nx * tx + ny * ty + nz * tz;
    tx -= nx * d;
    ty -= ny * d;
    tz -= nz * d;
    let len = Math.hypot(tx, ty, tz);
    if (len < 1e-8) {
      // No usable UV gradient: any unit vector perpendicular to the normal.
      [tx, ty, tz] = Math.abs(nx) < 0.9 ? [0, -nz, ny] : [nz, 0, -nx];
      len = Math.hypot(tx, ty, tz) || 1;
    }
    tx /= len;
    ty /= len;
    tz /= len;
    // Handedness: does cross(N, T) agree with the accumulated bitangent?
    const cx = ny * tz - nz * ty;
    const cy = nz * tx - nx * tz;
    const cz = nx * ty - ny * tx;
    const w = cx * (bit[v * 3] ?? 0) + cy * (bit[v * 3 + 1] ?? 0) + cz * (bit[v * 3 + 2] ?? 0);
    out.set([tx, ty, tz, w < 0 ? -1 : 1], v * 4);
  }
  return out;
}
