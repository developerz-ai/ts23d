// Per-pixel shading of the visibility buffer: reconstruct position, normal, UV and vertex colour
// from (triangle, barycentrics), perturb by the trim sheet's normal map, then light it — key sun
// with a PCF shadow, sky/bounce hemisphere × multi-direction AO × the sheet's baked occlusion,
// a roughness-driven sun specular (normalised Blinn–Phong + Schlick Fresnel) and a studio
// environment reflection (envRadiance) per texel from the sheet's ORM, so metal reads as metal.

import type { PerspectiveCamera } from './camera.ts';
import { type DepthMap, openness, visibility } from './depth-map.ts';
import { envRadiance, type Rig } from './lighting.ts';
import type { Scene } from './scene.ts';
import { type SheetTextures, sample } from './texture.ts';

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

/** Linear radiance of triangle `t` at barycentrics (b1, b2) into out[0..2]. */
export function shadeSample(
  c: ShadeContext,
  t: number,
  b1: number,
  b2: number,
  mip: number,
  set: number,
  out: Float32Array,
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
  const surf = s.surface[t] ?? 0;
  const glass = surf === 2;
  let ar = (texel[0] ?? 1) * ((C[ia] ?? 1) * b0 + (C[ib] ?? 1) * b1 + (C[ic] ?? 1) * b2);
  let ag =
    (texel[1] ?? 1) * ((C[ia + 1] ?? 1) * b0 + (C[ib + 1] ?? 1) * b1 + (C[ic + 1] ?? 1) * b2);
  let ab =
    (texel[2] ?? 1) * ((C[ia + 2] ?? 1) * b0 + (C[ib + 2] ?? 1) * b1 + (C[ic + 2] ?? 1) * b2);
  sample(c.tex.orm, mip, u, v, texel);
  const occ = texel[0] ?? 1;
  const rough = glass ? 0.06 : Math.max(0.08, texel[1] ?? 0.8);
  const metal = glass ? 0 : (texel[2] ?? 0);
  if (glass) {
    ar *= 0.12;
    ag *= 0.14;
    ab *= 0.16;
  }
  const r = c.rig;
  const n0 = nrm[0] ?? 0;
  const n1 = nrm[1] ?? 0;
  const n2 = nrm[2] ?? 1;
  const ndl = n0 * r.sun[0] + n1 * r.sun[1] + n2 * r.sun[2];
  const gdl = (geo[0] ?? 0) * r.sun[0] + (geo[1] ?? 0) * r.sun[1] + (geo[2] ?? 0) * r.sun[2];
  const lit = ndl > 0 && gdl > -0.05 ? sunVisible(c, pos, geo, set) * ndl : 0;
  const open = skyOpen(c, pos, geo);
  const hemi = 0.5 + 0.5 * n2;
  const amb = open * (0.35 + 0.65 * occ);
  const dk = 1 - metal;
  // Specular: half vector, normalised Blinn–Phong lobe, Schlick Fresnel against F0.
  let hx = r.sun[0] + vx;
  let hy = r.sun[1] + vy;
  let hz = r.sun[2] + vz;
  const hl = hyp(hx, hy, hz) || 1;
  hx /= hl;
  hy /= hl;
  hz /= hl;
  const ndh = Math.max(0, n0 * hx + n1 * hy + n2 * hz);
  const vdh = Math.max(0, vx * hx + vy * hy + vz * hz);
  const ndv = Math.max(0, n0 * vx + n1 * vy + n2 * vz);
  const shin = Math.min(2048, 2 / (rough * rough * rough * rough) - 2);
  const lobe = ((shin + 8) / 25.13) * ndh ** shin;
  const fr = (1 - vdh) ** 5;
  const fv = (1 - ndv) ** 5;
  // Image-based term: the studio seen along the reflection, occluded like the sky (+ cavity AO).
  const rz = 2 * ndv * n2 - vz;
  const specOcc = open * (0.4 + 0.6 * occ);
  const ch = [ar, ag, ab];
  for (let k = 0; k < 3; k++) {
    const al = ch[k] ?? 0;
    const f0 = 0.04 * dk + al * metal;
    const sky = (r.bounce[k] ?? 0) * (1 - hemi) + (r.sky[k] ?? 0) * hemi;
    const diffuse = al * dk * ((r.sunColor[k] ?? 0) * lit + sky * amb);
    const spec = (f0 + (1 - f0) * fr) * lobe * lit * (r.sunColor[k] ?? 0) * 0.8;
    const env = glass
      ? (f0 + (1 - f0) * fv * (1 - rough) * (1 - rough)) * (r.sky[k] ?? 0) * open * 2.5
      : (f0 + (Math.max(1 - rough, f0) - f0) * fv) * envRadiance(rz, rough, k) * specOcc;
    out[k] = (diffuse + spec + env) * r.exposure;
  }
}
