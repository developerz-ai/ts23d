// Per-pixel shading of the visibility buffer: reconstruct position, normal, UV and vertex colour
// from (triangle, barycentrics), perturb by the trim sheet's normal map, read the sheet's ORM and
// the part's look (finish / optics), find sun visibility (PCF shadow) and sky openness (multi-
// direction AO), then hand the sample to shade-light.ts (glTF reference BRDF + KHR layers).

import type { PerspectiveCamera } from './camera.ts';
import { type DepthMap, openness, visibility } from './depth-map.ts';
import type { Rig } from './lighting.ts';
import { OPAQUE } from './looks.ts';
import type { Scene } from './scene.ts';
import { lightSurf, type Surf } from './shade-light.ts';
import { type SheetTextures, sample } from './texture.ts';
import type { VisBuffer } from './vis-buffer.ts';

export interface ShadeContext {
  readonly scene: Scene;
  readonly cam: PerspectiveCamera;
  readonly tex: SheetTextures;
  readonly rig: Rig;
  readonly sunMap: DepthMap;
  readonly aoMaps: readonly DepthMap[];
  readonly pcf: readonly Float32Array[];
  /** AO falloff distance, metres: occluders farther than this along a sky direction don't count. */
  readonly reach: number;
  /** Opaque-only visibility buffer: what see-through surfaces show (absent: nothing transmits). */
  readonly behind?: VisBuffer;
}

const ONE_TAP = new Float32Array([0, 0]);
const hyp = (x: number, y: number, z: number): number => Math.sqrt(x * x + y * y + z * z);
const texel = new Float32Array(4);

/** Sky openness at p for a surface facing n: cosine-weighted share of unoccluded sky directions. */
export function skyOpen(c: ShadeContext, p: readonly number[], n: readonly number[]): number {
  let open = 0;
  let total = 0;
  const dirs = c.rig.skyDirs;
  for (let k = 0; k < dirs.length; k++) {
    const d = dirs[k];
    const m = c.aoMaps[k];
    if (!d || !m) continue;
    const w = 0.5 + 0.5 * ((n[0] ?? 0) * d[0] + (n[1] ?? 0) * d[1] + (n[2] ?? 0) * d[2]);
    if (w <= 0) continue;
    const off = 1.5 / m.k;
    const v = openness(
      m,
      (p[0] ?? 0) + (n[0] ?? 0) * off,
      (p[1] ?? 0) + (n[1] ?? 0) * off,
      (p[2] ?? 0) + (n[2] ?? 0) * off,
      2 / m.k,
      c.reach,
    );
    open += w * v;
    total += w;
  }
  return total > 0 ? open / total : 1;
}

/** Sun visibility at p (geometric normal n), PCF with one of four rotated tap sets. */
export function sunVisible(
  c: ShadeContext,
  p: readonly number[],
  n: readonly number[],
  set: number,
): number {
  const m = c.sunMap;
  const off = 1.2 / m.k;
  return visibility(
    m,
    (p[0] ?? 0) + (n[0] ?? 0) * off,
    (p[1] ?? 0) + (n[1] ?? 0) * off,
    (p[2] ?? 0) + (n[2] ?? 0) * off,
    1.5 / m.k,
    c.pcf[set & 3] ?? ONE_TAP,
  );
}

const pos = [0, 0, 0];
const nrm = [0, 0, 0];
const geo = [0, 0, 0];
const view = [0, 0, 0];
const tan = [0, 0, 0];
const bit = [0, 0, 0];
const S: Surf = {
  pos,
  n: nrm,
  geo,
  v: view,
  t: tan,
  b: bit,
  albedo: [0, 0, 0],
  occ: 1,
  rough: 0.8,
  metal: 0,
  lit: 0,
  open: 1,
};

/**
 * Linear radiance of triangle `t` at barycentrics (b1, b2) into out[0..2]; `through` (see
 * lightSurf) receives what a see-through surface transmits and its refraction offset.
 */
export function shadeSample(
  c: ShadeContext,
  t: number,
  b1: number,
  b2: number,
  mip: number,
  set: number,
  out: Float32Array,
  through?: Float32Array,
): void {
  const s = c.scene;
  const ia = (s.indices[t * 3] ?? 0) * 3;
  const ib = (s.indices[t * 3 + 1] ?? 0) * 3;
  const ic = (s.indices[t * 3 + 2] ?? 0) * 3;
  const b0 = 1 - b1 - b2;
  const P = s.positions;
  const N = s.normals;
  const C = s.colors;
  for (let k = 0; k < 3; k++) {
    pos[k] = (P[ia + k] ?? 0) * b0 + (P[ib + k] ?? 0) * b1 + (P[ic + k] ?? 0) * b2;
    nrm[k] = (N[ia + k] ?? 0) * b0 + (N[ib + k] ?? 0) * b1 + (N[ic + k] ?? 0) * b2;
  }
  const ua = (ia / 3) * 2;
  const ub = (ib / 3) * 2;
  const uc = (ic / 3) * 2;
  const U = s.uvs;
  const u = (U[ua] ?? 0) * b0 + (U[ub] ?? 0) * b1 + (U[uc] ?? 0) * b2;
  const v = (U[ua + 1] ?? 0) * b0 + (U[ub + 1] ?? 0) * b1 + (U[uc + 1] ?? 0) * b2;
  const e = c.cam.eye;
  let vx = e[0] - (pos[0] ?? 0);
  let vy = e[1] - (pos[1] ?? 0);
  let vz = e[2] - (pos[2] ?? 0);
  const vl = hyp(vx, vy, vz) || 1;
  vx /= vl;
  vy /= vl;
  vz /= vl;
  let nl = hyp(nrm[0] ?? 0, nrm[1] ?? 0, nrm[2] ?? 1) || 1;
  // Double-sided view: a normal facing away from the eye is lit as its back face.
  if ((nrm[0] ?? 0) * vx + (nrm[1] ?? 0) * vy + (nrm[2] ?? 0) * vz < 0) nl = -nl;
  for (let k = 0; k < 3; k++) {
    nrm[k] = (nrm[k] ?? 0) / nl;
    geo[k] = nrm[k] ?? 0;
  }
  // Normal map through the triangle's tangent frame (skipped where UVs are degenerate).
  const T = s.tangents;
  const to = t * 6;
  const tx = T[to] ?? 0;
  const ty = T[to + 1] ?? 0;
  const tz = T[to + 2] ?? 0;
  if (tx !== 0 || ty !== 0 || tz !== 0) {
    sample(c.tex.normal, mip, u, v, texel);
    const mx = texel[0] ?? 0;
    const my = texel[1] ?? 0;
    const mz = texel[2] ?? 1;
    const n0 = nrm[0] ?? 0;
    const n1 = nrm[1] ?? 0;
    const n2 = nrm[2] ?? 0;
    const bx = T[to + 3] ?? 0;
    const by = T[to + 4] ?? 0;
    const bz = T[to + 5] ?? 0;
    const px = tx * mx + bx * my + n0 * mz;
    const py = ty * mx + by * my + n1 * mz;
    const pz = tz * mx + bz * my + n2 * mz;
    const pl = hyp(px, py, pz) || 1;
    nrm[0] = px / pl;
    nrm[1] = py / pl;
    nrm[2] = pz / pl;
  }
  sample(c.tex.albedo, mip, u, v, texel);
  const al = S.albedo;
  al[0] = (texel[0] ?? 1) * ((C[ia] ?? 1) * b0 + (C[ib] ?? 1) * b1 + (C[ic] ?? 1) * b2);
  al[1] = (texel[1] ?? 1) * ((C[ia + 1] ?? 1) * b0 + (C[ib + 1] ?? 1) * b1 + (C[ic + 1] ?? 1) * b2);
  al[2] = (texel[2] ?? 1) * ((C[ia + 2] ?? 1) * b0 + (C[ib + 2] ?? 1) * b1 + (C[ic + 2] ?? 1) * b2);
  sample(c.tex.orm, mip, u, v, texel);
  const look = s.looks[s.look[t] ?? 0] ?? OPAQUE;
  S.occ = texel[0] ?? 1;
  S.rough = Math.max(0.05, look.roughness >= 0 ? look.roughness : (texel[1] ?? 0.8));
  S.metal = look.metallic >= 0 ? look.metallic : (texel[2] ?? 0);
  const r = c.rig;
  const ndl = (nrm[0] ?? 0) * r.sun[0] + (nrm[1] ?? 0) * r.sun[1] + (nrm[2] ?? 0) * r.sun[2];
  const gdl = (geo[0] ?? 0) * r.sun[0] + (geo[1] ?? 0) * r.sun[1] + (geo[2] ?? 0) * r.sun[2];
  S.lit = ndl > 0 && gdl > -0.05 ? sunVisible(c, pos, geo, set) * ndl : 0;
  S.open = skyOpen(c, pos, geo);
  for (let k = 0; k < 3; k++) {
    tan[k] = T[to + k] ?? 0;
    bit[k] = T[to + 3 + k] ?? 0;
  }
  view[0] = vx;
  view[1] = vy;
  view[2] = vz;
  lightSurf(S, look, r, c.cam, out, through);
}
