// Per-vertex tangents (glTF TANGENT, VEC4) for normal-mapped meshes: Lengyel's UV-derivative
// method, Gram-Schmidt against the vertex normal, w = handedness. The bitangent cross(N, T) · w
// points toward DECREASING glTF v (the "green up" convention the painter writes). Identical to
// MikkTSpace on flat-shaded quads; close, not bit-equal, on smooth curved surfaces.
// `mikkTangents` is the frame for a part's OWN baked normal map (ADR 016), built the way
// MikkTSpace (Blender / Cycles bakes, Substance, the glTF reference) builds it; see its comment.

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

type V3 = [number, number, number];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** `a` flattened into the plane perpendicular to the unit normal `n`, unit length (or zero). */
function inPlane(a: V3, n: V3): V3 {
  const d = dot(a, n);
  const p: V3 = [a[0] - n[0] * d, a[1] - n[1] * d, a[2] - n[2] * d];
  const len = Math.hypot(p[0], p[1], p[2]);
  return len < 1e-20 ? [0, 0, 0] : [p[0] / len, p[1] / len, p[2] / len];
}

/**
 * TANGENT (VEC4) the MikkTSpace way, for normal maps baked on this mesh's UVs: per triangle the
 * unit dP/du; per corner that direction flattened into the vertex normal's plane, weighted by the
 * corner's angle (measured in that plane); summed per vertex and normalised. w = +1 where the UV
 * map keeps orientation (glTF v points down, so where the v-down UV area is negative), −1 where it
 * is mirrored: B = cross(N, T) · w, toward decreasing v, green up.
 * Limits: MikkTSpace also SPLITS a vertex whose triangles disagree in orientation; here the
 * vertex count is fixed, so such a vertex (a mirror seam welded with identical UVs) takes the
 * angle-weighted majority. Triangles with zero UV area are skipped. Results match the reference
 * to float rounding elsewhere, not bit for bit.
 */
export function mikkTangents(m: Mesh): Float32Array {
  const n = m.positions.length / 3;
  const sum = new Float64Array(n * 3);
  const side = new Float64Array(n);
  const P = (v: number): V3 => [
    m.positions[v * 3] ?? 0,
    m.positions[v * 3 + 1] ?? 0,
    m.positions[v * 3 + 2] ?? 0,
  ];
  const N = (v: number): V3 => [
    m.normals[v * 3] ?? 0,
    m.normals[v * 3 + 1] ?? 0,
    m.normals[v * 3 + 2] ?? 1,
  ];
  const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  for (let t = 0; t < m.indices.length; t += 3) {
    const tri = [m.indices[t] ?? 0, m.indices[t + 1] ?? 0, m.indices[t + 2] ?? 0];
    const [a = 0, b = 0, c = 0] = tri;
    const e1 = sub(P(b), P(a));
    const e2 = sub(P(c), P(a));
    const du1 = (m.uvs[b * 2] ?? 0) - (m.uvs[a * 2] ?? 0);
    const du2 = (m.uvs[c * 2] ?? 0) - (m.uvs[a * 2] ?? 0);
    // v up, as the baker saw it.
    const dv1 = (m.uvs[a * 2 + 1] ?? 0) - (m.uvs[b * 2 + 1] ?? 0);
    const dv2 = (m.uvs[a * 2 + 1] ?? 0) - (m.uvs[c * 2 + 1] ?? 0);
    const det = du1 * dv2 - du2 * dv1;
    if (Math.abs(det) < 1e-20) continue;
    const s = det > 0 ? 1 : -1;
    const dPdu: V3 = [
      (e1[0] * dv2 - e2[0] * dv1) * s,
      (e1[1] * dv2 - e2[1] * dv1) * s,
      (e1[2] * dv2 - e2[2] * dv1) * s,
    ];
    for (let k = 0; k < 3; k++) {
      const v = tri[k] ?? 0;
      const nv = N(v);
      const to1 = inPlane(sub(P(tri[(k + 1) % 3] ?? 0), P(v)), nv);
      const to2 = inPlane(sub(P(tri[(k + 2) % 3] ?? 0), P(v)), nv);
      const angle = Math.acos(Math.min(1, Math.max(-1, dot(to1, to2))));
      const dir = inPlane(dPdu, nv);
      for (let j = 0; j < 3; j++) sum[v * 3 + j] = (sum[v * 3 + j] ?? 0) + (dir[j] ?? 0) * angle;
      side[v] = (side[v] ?? 0) + s * angle;
    }
  }
  const out = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) {
    const nv = N(v);
    let T = inPlane([sum[v * 3] ?? 0, sum[v * 3 + 1] ?? 0, sum[v * 3 + 2] ?? 0], nv);
    // No usable UV gradient: any unit vector perpendicular to the normal.
    if (dot(T, T) === 0) T = inPlane(Math.abs(nv[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], nv);
    out.set([T[0], T[1], T[2], (side[v] ?? 0) < 0 ? -1 : 1], v * 4);
  }
  return out;
}
