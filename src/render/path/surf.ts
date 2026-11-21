// Reconstruct a ray hit for shading: position, geometric and shading normal (interpolated, then the
// trim sheet's normal map through the triangle's tangent frame), both turned to face the incoming
// ray (every surface is two-sided, as in the raster), strand tangent, albedo = sheet × vertex
// colour, roughness / metalness from the ORM unless the part's look overrides them.

import { dmath } from '../../core/index.ts';
import type { Look } from '../looks.ts';
import { OPAQUE } from '../looks.ts';
import { SET_OUT, setSurface } from '../set-shade.ts';
import { sample } from '../texture.ts';
import type { Hit } from './bvh.ts';
import { CLS } from './classes.ts';
import { dot3 } from './frame.ts';
import type { World } from './world.ts';

export interface Surf {
  readonly p: Float64Array;
  /** Geometric (face) normal, toward the incoming ray. */
  readonly ng: Float64Array;
  /** Shading normal, same side as ng. */
  readonly n: Float64Array;
  /** Unit dP/dU (along strands on hair cards); zero when UVs are degenerate. */
  readonly t: Float64Array;
  readonly albedo: Float64Array;
  rough: number;
  metal: number;
  occ: number;
  look: Look;
  cls: number;
  tri: number;
}

export const newSurf = (): Surf => ({
  p: new Float64Array(3),
  ng: new Float64Array(3),
  n: new Float64Array(3),
  t: new Float64Array(3),
  albedo: new Float64Array(3),
  rough: 0.8,
  metal: 0,
  occ: 1,
  look: OPAQUE,
  cls: 0,
  tri: -1,
});

const texel = new Float32Array(4);

/** Fill `s` for `hit` on ray (o, d). */
export function surfAt(w: World, h: Hit, o: ArrayLike<number>, d: ArrayLike<number>, s: Surf) {
  const sc = w.scene;
  const t = h.tri;
  const ia = (sc.indices[t * 3] ?? 0) * 3;
  const ib = (sc.indices[t * 3 + 1] ?? 0) * 3;
  const ic = (sc.indices[t * 3 + 2] ?? 0) * 3;
  const b1 = h.b1;
  const b2 = h.b2;
  const b0 = 1 - b1 - b2;
  const P = sc.positions;
  const N = sc.normals;
  const C = sc.colors;
  for (let k = 0; k < 3; k++) {
    s.p[k] = (o[k] ?? 0) + (d[k] ?? 0) * h.t;
    s.n[k] = (N[ia + k] ?? 0) * b0 + (N[ib + k] ?? 0) * b1 + (N[ic + k] ?? 0) * b2;
  }
  const e1x = (P[ib] ?? 0) - (P[ia] ?? 0);
  const e1y = (P[ib + 1] ?? 0) - (P[ia + 1] ?? 0);
  const e1z = (P[ib + 2] ?? 0) - (P[ia + 2] ?? 0);
  const e2x = (P[ic] ?? 0) - (P[ia] ?? 0);
  const e2y = (P[ic + 1] ?? 0) - (P[ia + 1] ?? 0);
  const e2z = (P[ic + 2] ?? 0) - (P[ia + 2] ?? 0);
  let gx = e1y * e2z - e1z * e2y;
  let gy = e1z * e2x - e1x * e2z;
  let gz = e1x * e2y - e1y * e2x;
  let gl = dmath.hypot(gx, gy, gz) || 1;
  if (gx * (d[0] ?? 0) + gy * (d[1] ?? 0) + gz * (d[2] ?? 0) > 0) gl = -gl;
  gx /= gl;
  gy /= gl;
  gz /= gl;
  s.ng[0] = gx;
  s.ng[1] = gy;
  s.ng[2] = gz;
  let nl = dmath.hypot(s.n[0] ?? 0, s.n[1] ?? 0, s.n[2] ?? 0);
  if (!(nl > 0)) {
    s.n.set(s.ng);
    nl = 1;
  }
  if ((s.n[0] ?? 0) * gx + (s.n[1] ?? 0) * gy + (s.n[2] ?? 0) * gz < 0) nl = -nl;
  const side = nl < 0 ? -1 : 1;
  for (let k = 0; k < 3; k++) s.n[k] = (s.n[k] ?? 0) / nl;
  const ua = (ia / 3) * 2;
  const ub = (ib / 3) * 2;
  const uc = (ic / 3) * 2;
  const U = sc.uvs;
  const u = (U[ua] ?? 0) * b0 + (U[ub] ?? 0) * b1 + (U[uc] ?? 0) * b2;
  const v = (U[ua + 1] ?? 0) * b0 + (U[ub + 1] ?? 0) * b1 + (U[uc + 1] ?? 0) * b2;
  const mip = w.mip[t] ?? 0;
  const T = sc.tangents;
  const to = t * 6;
  for (let k = 0; k < 3; k++) s.t[k] = T[to + k] ?? 0;
  // A textured part (ADR 016) reads its own set: albedo, ORM and normal map in one call.
  const set = sc.sets[(sc.texSet[t] ?? 0) - 1];
  const O = SET_OUT;
  if (set) {
    const n0 = s.n[0] ?? 0;
    const n1 = s.n[1] ?? 0;
    const n2 = s.n[2] ?? 0;
    setSurface(set, sc.vtan, ia / 3, ib / 3, ic / 3, b0, b1, b2, u, v, mip, n0, n1, n2, side, O);
    s.n[0] = O[0] ?? n0;
    s.n[1] = O[1] ?? n1;
    s.n[2] = O[2] ?? n2;
    texel[0] = O[3] ?? 1;
    texel[1] = O[4] ?? 1;
    texel[2] = O[5] ?? 1;
  } else if (s.t[0] !== 0 || s.t[1] !== 0 || s.t[2] !== 0) {
    sample(w.tex.normal, mip, u, v, texel);
    const mx = texel[0] ?? 0;
    const my = texel[1] ?? 0;
    const mz = texel[2] ?? 1;
    const px = (T[to] ?? 0) * mx + (T[to + 3] ?? 0) * my + (s.n[0] ?? 0) * mz;
    const py = (T[to + 1] ?? 0) * mx + (T[to + 4] ?? 0) * my + (s.n[1] ?? 0) * mz;
    const pz = (T[to + 2] ?? 0) * mx + (T[to + 5] ?? 0) * my + (s.n[2] ?? 0) * mz;
    const pl = dmath.hypot(px, py, pz) || 1;
    s.n[0] = px / pl;
    s.n[1] = py / pl;
    s.n[2] = pz / pl;
  }
  // A shading normal facing away from the eye (normal map at a grazing angle) would leak light.
  const ndo = -(
    (s.n[0] ?? 0) * (d[0] ?? 0) +
    (s.n[1] ?? 0) * (d[1] ?? 0) +
    (s.n[2] ?? 0) * (d[2] ?? 0)
  );
  if (ndo < 0.02) {
    for (let k = 0; k < 3; k++) s.n[k] = (s.n[k] ?? 0) + (s.ng[k] ?? 0) * (0.02 - ndo + 0.05);
    const l = dmath.hypot(s.n[0] ?? 0, s.n[1] ?? 0, s.n[2] ?? 0) || 1;
    for (let k = 0; k < 3; k++) s.n[k] = (s.n[k] ?? 0) / l;
  }
  if (!set) sample(w.tex.albedo, mip, u, v, texel);
  for (let k = 0; k < 3; k++)
    s.albedo[k] =
      (texel[k] ?? 1) * ((C[ia + k] ?? 1) * b0 + (C[ib + k] ?? 1) * b1 + (C[ic + k] ?? 1) * b2);
  if (set) {
    texel[0] = O[7] ?? 1;
    texel[1] = O[8] ?? 0.8;
    texel[2] = O[9] ?? 0;
  } else sample(w.tex.orm, mip, u, v, texel);
  const look = sc.looks[sc.look[t] ?? 0] ?? OPAQUE;
  s.look = look;
  s.occ = texel[0] ?? 1;
  s.rough = Math.max(0.05, look.roughness >= 0 ? look.roughness : (texel[1] ?? 0.8));
  s.metal = look.metallic >= 0 ? look.metallic : (texel[2] ?? 0);
  s.cls = w.cls[t] ?? 0;
  s.tri = t;
  if (s.cls === CLS.hair && w.strand.length > 0)
    strandTangent(w.strand, ia, ib, ic, b0, b1, b2, s.t);
}

/** The strand tangent at a point of a hair card: its vertices' tangents blended (D540: one
 *  tangent per triangle lit each flat segment of a bent card as a plate). Keeps `t` where the
 *  blend cancels out. */
function strandTangent(
  S: Float32Array,
  ia: number,
  ib: number,
  ic: number,
  b0: number,
  b1: number,
  b2: number,
  t: Float64Array,
): void {
  const x = (S[ia] ?? 0) * b0 + (S[ib] ?? 0) * b1 + (S[ic] ?? 0) * b2;
  const y = (S[ia + 1] ?? 0) * b0 + (S[ib + 1] ?? 0) * b1 + (S[ic + 1] ?? 0) * b2;
  const z = (S[ia + 2] ?? 0) * b0 + (S[ib + 2] ?? 0) * b1 + (S[ic + 2] ?? 0) * b2;
  const l = dmath.hypot(x, y, z);
  if (!(l > 1e-6)) return;
  t[0] = x / l;
  t[1] = y / l;
  t[2] = z / l;
}

/**
 * Origin of a ray leaving `s` toward `dir`: off the surface along the geometric normal on the
 * side `dir` goes, and lifted off the skin when `s` is a hair card (World.lift).
 */
export function origin(w: World, s: Surf, dir: ArrayLike<number>, out: Float64Array): void {
  const side = dot3(s.ng, dir) >= 0 ? w.eps : -w.eps;
  const lift = s.cls === CLS.hair ? w.lift : 0;
  for (let k = 0; k < 3; k++) out[k] = (s.p[k] ?? 0) + (s.ng[k] ?? 0) * side + (s.n[k] ?? 0) * lift;
}
