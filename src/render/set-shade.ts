// What a textured part (ADR 016) contributes at one surface point, for every renderer: albedo
// (linear, alpha), occlusion / roughness / metallic from the ORM map or the set's factors, and the
// shading normal bent by the set's normal map.
// Convention (the GLB's, so a Blender / Cycles tangent-space bake renders as baked): UVs are glTF
// UVs (v runs DOWN the image), the map is green-up, and the frame is the exporter's per-vertex one
// (passes uvTangents: T along +U, Gram–Schmidt against the normal, B = cross(N, T) · w pointing
// toward DECREASING v), interpolated and re-orthogonalised per sample:
//   n' = normalise(T · r + B · g + N · b),   (r, g, b) = texel · 2 − 1.
// A back face (the normal was flipped toward the viewer) mirrors the whole frame, as three.js and
// the glTF viewers do.

import { NORMAL_LUT, type SetTextures, SRGB_LUT, sampleSet, UNIT_LUT } from './texture-sets.ts';

/** Layout of the result: normal xyz, albedo rgb, alpha, occlusion, roughness, metallic. */
export const SET_N = 0;
export const SET_RGB = 3;
export const SET_ALPHA = 6;
export const SET_OCC = 7;
export const SET_ROUGH = 8;
export const SET_METAL = 9;

/** The one scratch result every renderer reads right after `setSurface`. */
export const SET_OUT = new Float64Array(10);

const texel = new Float32Array(4);

/**
 * Fill `out` for the point with barycentrics (b0, b1, b2) of the triangle whose vertices are
 * ia, ib, ic (indices into `vtan`, 4 floats per vertex), at UV (u, v) and albedo mip `mip`.
 * (nx, ny, nz) is the unit shading normal already facing the viewer; `side` is −1 when that meant
 * flipping the vertex normal, else 1.
 */
export function setSurface(
  set: SetTextures,
  vtan: Float32Array,
  ia: number,
  ib: number,
  ic: number,
  b0: number,
  b1: number,
  b2: number,
  u: number,
  v: number,
  mip: number,
  nx: number,
  ny: number,
  nz: number,
  side: number,
  out: Float64Array,
): void {
  sampleSet(set.albedo, mip, u, v, SRGB_LUT, texel);
  out[3] = texel[0] ?? 1;
  out[4] = texel[1] ?? 1;
  out[5] = texel[2] ?? 1;
  out[6] = texel[3] ?? 1;
  if (set.orm.length > 0) {
    sampleSet(set.orm, mip - set.ormShift, u, v, UNIT_LUT, texel);
    out[7] = texel[0] ?? 1;
    out[8] = texel[1] ?? 0.8;
    out[9] = texel[2] ?? 0;
  } else {
    out[7] = 1;
    out[8] = set.roughness;
    out[9] = set.metallic;
  }
  out[0] = nx;
  out[1] = ny;
  out[2] = nz;
  if (set.normal.length === 0) return;
  const a = ia * 4;
  const b = ib * 4;
  const c = ic * 4;
  let tx = (vtan[a] ?? 0) * b0 + (vtan[b] ?? 0) * b1 + (vtan[c] ?? 0) * b2;
  let ty = (vtan[a + 1] ?? 0) * b0 + (vtan[b + 1] ?? 0) * b1 + (vtan[c + 1] ?? 0) * b2;
  let tz = (vtan[a + 2] ?? 0) * b0 + (vtan[b + 2] ?? 0) * b1 + (vtan[c + 2] ?? 0) * b2;
  const d = tx * nx + ty * ny + tz * nz;
  tx -= nx * d;
  ty -= ny * d;
  tz -= nz * d;
  const tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
  if (tl < 1e-8) return;
  // side · T, and side · B = side · cross(side · n, T) · w = cross(n, T) · w.
  const ts = side / tl;
  const w = (vtan[a + 3] ?? 1) / tl;
  sampleSet(set.normal, mip - set.normalShift, u, v, NORMAL_LUT, texel);
  const mx = texel[0] ?? 0;
  const my = texel[1] ?? 0;
  const mz = texel[2] ?? 1;
  const px = tx * ts * mx + (ny * tz - nz * ty) * w * my + nx * mz;
  const py = ty * ts * mx + (nz * tx - nx * tz) * w * my + ny * mz;
  const pz = tz * ts * mx + (nx * ty - ny * tx) * w * my + nz * mz;
  const pl = Math.sqrt(px * px + py * py + pz * pz);
  if (pl < 1e-8) return;
  out[0] = px / pl;
  out[1] = py / pl;
  out[2] = pz / pl;
}
