// Flatten a compiled asset into one packed, world-space triangle soup for the beauty renderer:
// positions, normals, UVs, colours per vertex; surface code + tangent frame per triangle.
// Packed typed arrays keep the per-pixel loops monomorphic and allocation-free.

import { type CompiledAsset, type Surface, worldMeshes } from '../core/index.ts';

export const SURFACE_CODE: Readonly<Record<Surface, number>> = {
  opaque: 0,
  cutout: 1,
  glass: 2,
  translucent: 3,
};

export interface Scene {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly colors: Float32Array;
  /** Three global vertex indices per triangle. */
  readonly indices: Uint32Array;
  /** SURFACE_CODE per triangle. */
  readonly surface: Uint8Array;
  /** Per-triangle tangent frame for the normal map, 6 floats: T = dP/dU, B = −dP/dV (glTF +Y). */
  readonly tangents: Float32Array;
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
  readonly triangles: number;
}

export function sceneOf(asset: CompiledAsset): Scene {
  const meshes = worldMeshes(asset.parts);
  const surfOf = new Map(asset.parts.map((p) => [p.name, SURFACE_CODE[p.surface ?? 'opaque']]));
  let nv = 0;
  let nt = 0;
  for (const m of meshes.values()) {
    nv += m.positions.length / 3;
    nt += m.indices.length / 3;
  }
  const positions = new Float32Array(nv * 3);
  const normals = new Float32Array(nv * 3);
  const uvs = new Float32Array(nv * 2);
  const colors = new Float32Array(nv * 3);
  const indices = new Uint32Array(nt * 3);
  const surface = new Uint8Array(nt);
  let vo = 0;
  let to = 0;
  for (const [name, m] of meshes) {
    positions.set(m.positions, vo * 3);
    normals.set(m.normals, vo * 3);
    uvs.set(m.uvs, vo * 2);
    colors.set(m.colors, vo * 3);
    for (let i = 0; i < m.indices.length; i++) indices[to * 3 + i] = (m.indices[i] ?? 0) + vo;
    surface.fill(surfOf.get(name) ?? 0, to, to + m.indices.length / 3);
    vo += m.positions.length / 3;
    to += m.indices.length / 3;
  }
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {
    const v = positions[i] ?? 0;
    const k = i % 3;
    if (v < (min[k] ?? 0)) min[k] = v;
    if (v > (max[k] ?? 0)) max[k] = v;
  }
  if (nv === 0) {
    min.fill(-0.5);
    max.fill(0.5);
  }
  return {
    positions,
    normals,
    uvs,
    colors,
    indices,
    surface,
    tangents: tangentsOf(positions, uvs, indices),
    min,
    max,
    triangles: nt,
  };
}

/** Per-triangle dP/dU and −dP/dV from the UV parameterisation; zero frame when UVs degenerate. */
function tangentsOf(p: Float32Array, uv: Float32Array, idx: Uint32Array): Float32Array {
  const out = new Float32Array(idx.length * 2);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] ?? 0;
    const b = idx[t + 1] ?? 0;
    const c = idx[t + 2] ?? 0;
    const e1x = (p[b * 3] ?? 0) - (p[a * 3] ?? 0);
    const e1y = (p[b * 3 + 1] ?? 0) - (p[a * 3 + 1] ?? 0);
    const e1z = (p[b * 3 + 2] ?? 0) - (p[a * 3 + 2] ?? 0);
    const e2x = (p[c * 3] ?? 0) - (p[a * 3] ?? 0);
    const e2y = (p[c * 3 + 1] ?? 0) - (p[a * 3 + 1] ?? 0);
    const e2z = (p[c * 3 + 2] ?? 0) - (p[a * 3 + 2] ?? 0);
    const du1 = (uv[b * 2] ?? 0) - (uv[a * 2] ?? 0);
    const dv1 = (uv[b * 2 + 1] ?? 0) - (uv[a * 2 + 1] ?? 0);
    const du2 = (uv[c * 2] ?? 0) - (uv[a * 2] ?? 0);
    const dv2 = (uv[c * 2 + 1] ?? 0) - (uv[a * 2 + 1] ?? 0);
    const det = du1 * dv2 - du2 * dv1;
    if (Math.abs(det) < 1e-12) continue;
    const tx = (e1x * dv2 - e2x * dv1) / det;
    const ty = (e1y * dv2 - e2y * dv1) / det;
    const tz = (e1z * dv2 - e2z * dv1) / det;
    const bx = (e2x * du1 - e1x * du2) / det;
    const by = (e2y * du1 - e1y * du2) / det;
    const bz = (e2z * du1 - e1z * du2) / det;
    const lt = Math.hypot(tx, ty, tz) || 1;
    const lb = -(Math.hypot(bx, by, bz) || 1);
    const o = t * 2;
    out[o] = tx / lt;
    out[o + 1] = ty / lt;
    out[o + 2] = tz / lt;
    out[o + 3] = bx / lb;
    out[o + 4] = by / lb;
    out[o + 5] = bz / lb;
  }
  return out;
}
