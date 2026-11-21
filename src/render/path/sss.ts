// Subsurface scattering for skin: Burley's normalised diffusion profile (Christensen & Burley
// 2015), R(r) = A·(e^(−r/d) + e^(−r/3d)) ÷ (8π d r), sampled exactly as its two-exponential
// mixture, with the exit point found by a disk probe along the normal (no random walk): pick a
// channel, a radius and an angle, shoot a short ray back at the surface and collect the skin it
// crosses (up to MAX_HITS), then keep one hit chosen in proportion to the profile at its distance.
// The weight per channel is R ÷ (mixture pdf · |n·n_exit| · pick probability): light enters at
// one point and leaves a few millimetres away, red farthest — terminators go warm, and on a thin
// part (an ear, a nostril's wing, a lid) the probe also finds the far face, so light from behind
// shines through (D510; a first-hit-only probe never left a sheet by its back). The exits on one
// probe share one profile's worth of light, in proportion to the profile at each: summing a full
// profile per exit gave a sheet thinner than the diffusion length twice its albedo (D530). Which
// way an exit faces comes from its triangle's winding: on layered skin (scales over a body) the
// second crossing is often another outward face, and calling it a far face by count lit it from
// inside (D515: single-pixel colour grain).

import { dmath } from '../../core/index.ts';
import type { V3 } from '../lighting.ts';
import { type Hit, newHit } from './bvh.ts';
import { CLS } from './classes.ts';
import { axes, basis, dot3 } from './frame.ts';
import type { Surf } from './surf.ts';
import type { World } from './world.ts';

/**
 * Diffuse mean free path of skin per channel, metres: Disney's 3.67 / 1.37 / 0.68 mm × 0.6, so
 * sculpted forms (nasolabial fold, lids) keep their shading on game-scale meshes.
 */
export const SKIN_MFP: V3 = [0.0022, 0.00082, 0.00041];
/** Probes reach this many shape lengths d; beyond it the profile holds < 1% of its energy. */
const REACH = 12;

/** Burley's albedo → shape scale for diffuse mean free path (searchlight fit). */
export const shapeScale = (a: number): number => {
  const t = Math.abs(a - 0.8);
  return 1.85 - a + 7 * (t * t * t);
};

/** The normalised profile (∫ 2πr R dr = 1) at radius r for shape length d. */
export const burley = (r: number, d: number): number =>
  (dmath.exp(-r / d) + dmath.exp(-r / (3 * d))) / (8 * Math.PI * d * Math.max(r, 1e-9));

/** Pdf over r of the profile's radial distribution (2πr · burley). */
export const radiusPdf = (r: number, d: number): number =>
  (0.25 * dmath.exp(-r / d)) / d + (0.75 * dmath.exp(-r / (3 * d))) / (3 * d);

/** Invert the radial CDF by mixture choice: exact for the two exponentials. */
export function sampleRadius(u: number, d: number): number {
  if (u < 0.25) return -d * dmath.log(Math.max(1e-12, 1 - u / 0.25));
  return -3 * d * dmath.log(Math.max(1e-12, 1 - (u - 0.25) / 0.75));
}

/** Skin crossings a probe collects: twice through an ear, four times through scales on a body. */
const MAX_HITS = 8;

const tx = new Float64Array(3);
const bx = new Float64Array(3);
const o = new Float64Array(3);
const at = new Float64Array(3);
const dir = new Float64Array(3);
const shape = new Float64Array(3);
const probeHit: Hit = newHit();
const hits: Hit[] = Array.from({ length: MAX_HITS }, newHit);
const dists = new Float64Array(MAX_HITS);
const cosE = new Float64Array(MAX_HITS);
const pick = new Float64Array(MAX_HITS);
const prof = new Float64Array(MAX_HITS * 3);
const share = new Float64Array(3);

/**
 * Cosine between `n` and the outward (winding) normal of triangle `tri`. Its sign says which way
 * the exit faces: positive, back toward the probe's start (a face the probe entered); negative,
 * away (a face it left by). Only the winding knows: counting crossings fails on layered skin.
 */
function exitCos(w: World, tri: number, n: ArrayLike<number>): number {
  const P = w.scene.positions;
  const I = w.scene.indices;
  const ia = (I[tri * 3] ?? 0) * 3;
  const ib = (I[tri * 3 + 1] ?? 0) * 3;
  const ic = (I[tri * 3 + 2] ?? 0) * 3;
  const e1 = [0, 1, 2].map((k) => (P[ib + k] ?? 0) - (P[ia + k] ?? 0));
  const e2 = [0, 1, 2].map((k) => (P[ic + k] ?? 0) - (P[ia + k] ?? 0));
  const nx = (e1[1] ?? 0) * (e2[2] ?? 0) - (e1[2] ?? 0) * (e2[1] ?? 0);
  const ny = (e1[2] ?? 0) * (e2[0] ?? 0) - (e1[0] ?? 0) * (e2[2] ?? 0);
  const nz = (e1[0] ?? 0) * (e2[1] ?? 0) - (e1[1] ?? 0) * (e2[0] ?? 0);
  return dot3([nx, ny, nz], n) / (dmath.hypot(nx, ny, nz) || 1);
}

/**
 * Exit point for light entering skin surface `s` (colour `s.albedo`); `uc`, `ur`, `ua` pick the
 * channel, radius and angle, `uh` the crossing. Fills `exit` (a hit on the probe ray `po`, `pd`)
 * and `weight`. Returns 0 when the probe found no skin (use the entry point), 1 for an exit whose
 * winding faces back up the probe (surfAt's normals already face out), −1 for one facing down it
 * (the far face of a thin part: the caller turns that hit's normals round).
 */
export function probeExit(
  w: World,
  s: Surf,
  uc: number,
  ur: number,
  ua: number,
  uh: number,
  exit: Hit,
  po: Float64Array,
  pd: Float64Array,
  weight: Float64Array,
): 0 | 1 | -1 {
  let dmax = 0;
  for (let k = 0; k < 3; k++) {
    const a = Math.max(0.01, Math.min(0.99, s.albedo[k] ?? 0));
    shape[k] = (SKIN_MFP[k] ?? 0.001) / shapeScale(a);
    dmax = Math.max(dmax, shape[k] ?? 0);
  }
  const c = Math.min(2, Math.floor(uc * 3));
  const r = sampleRadius(ur, shape[c] ?? dmax);
  const rmax = REACH * dmax;
  if (r >= rmax) return 0;
  basis(s.n);
  axes(tx, bx);
  const hh = Math.sqrt(rmax * rmax - r * r);
  const ca = dmath.cos(2 * Math.PI * ua) * r;
  const sa = dmath.sin(2 * Math.PI * ua) * r;
  for (let k = 0; k < 3; k++) {
    o[k] = (s.p[k] ?? 0) + (tx[k] ?? 0) * ca + (bx[k] ?? 0) * sa + (s.n[k] ?? 0) * hh;
    dir[k] = -(s.n[k] ?? 0);
  }
  // Every skin crossing along the probe, nearest first: each search starts just past the last.
  const skin = (t: number): boolean => w.cls[t] === CLS.skin;
  let n = 0;
  let from = 0;
  while (n < MAX_HITS) {
    for (let k = 0; k < 3; k++) at[k] = (o[k] ?? 0) + (dir[k] ?? 0) * from;
    if (!w.bvh.closest(at, dir, 2 * hh - from, probeHit, skin)) break;
    const h = hits[n] as Hit;
    h.t = from + probeHit.t;
    h.tri = probeHit.tri;
    h.b1 = probeHit.b1;
    h.b2 = probeHit.b2;
    let dist = 0;
    for (let k = 0; k < 3; k++) {
      const x = (o[k] ?? 0) + (dir[k] ?? 0) * h.t - (s.p[k] ?? 0);
      dist += x * x;
    }
    dists[n] = Math.sqrt(dist);
    cosE[n] = exitCos(w, h.tri, s.n);
    from = h.t + w.eps;
    n++;
  }
  // Light leaves skin only where skin meets air. The winding says whether the probe goes in (+)
  // or out (−) at each crossing; a crossing between nested layers (a scale over the body under
  // it) is inside the skin and no exit. A probe starting under an overlapping plate starts at
  // the depth that never goes below zero.
  let depth = 0;
  let low = 0;
  for (let i = 0; i < n; i++) {
    depth += (cosE[i] ?? 1) >= 0 ? 1 : -1;
    low = Math.min(low, depth);
  }
  depth = -low;
  let total = 0;
  let sum0 = 0;
  let sum1 = 0;
  let sum2 = 0;
  let top0 = 0;
  let top1 = 0;
  let top2 = 0;
  for (let i = 0; i < n; i++) {
    const into = (cosE[i] ?? 1) >= 0;
    const air = depth === (into ? 0 : 1);
    depth += into ? 1 : -1;
    // Pick an exit in proportion to the profile summed over the channels at its distance.
    const r0 = dists[i] ?? 0;
    const p0 = air ? burley(r0, shape[0] ?? 1) : 0;
    const p1 = air ? burley(r0, shape[1] ?? 1) : 0;
    const p2 = air ? burley(r0, shape[2] ?? 1) : 0;
    prof[i * 3] = p0;
    prof[i * 3 + 1] = p1;
    prof[i * 3 + 2] = p2;
    sum0 += p0;
    sum1 += p1;
    sum2 += p2;
    top0 = Math.max(top0, p0);
    top1 = Math.max(top1, p1);
    top2 = Math.max(top2, p2);
    pick[i] = air ? p0 + p1 + p2 : 0;
    total += pick[i] ?? 0;
  }
  if (!(total > 0)) return 0;
  // One profile's worth of light per probe, the nearest exit's (what a single surface returns),
  // split over the exits in proportion to the profile at each: exactly 1 with one exit.
  share[0] = sum0 > 0 ? top0 / sum0 : 0;
  share[1] = sum1 > 0 ? top1 / sum1 : 0;
  share[2] = sum2 > 0 ? top2 / sum2 : 0;
  let j = 0;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    if (!((pick[i] ?? 0) > 0)) continue;
    j = i;
    acc += (pick[i] ?? 0) / total;
    if (uh < acc) break;
  }
  const h = hits[j] as Hit;
  exit.t = h.t;
  exit.tri = h.tri;
  exit.b1 = h.b1;
  exit.b2 = h.b2;
  po.set(o);
  pd.set(dir);
  const pj = (pick[j] ?? 0) / total;
  // Area-measure pdf at the exit: |cos| floored at 0.3 so a grazing face cannot blow up.
  const cosJ = Math.max(0.3, Math.abs(cosE[j] ?? 1));
  const pdf =
    ((radiusPdf(r, shape[0] ?? 1) + radiusPdf(r, shape[1] ?? 1) + radiusPdf(r, shape[2] ?? 1)) /
      (3 * 2 * Math.PI * Math.max(r, 1e-9))) *
    pj;
  for (let k = 0; k < 3; k++) {
    const a = s.albedo[k] ?? 0;
    weight[k] = Math.min(4, (a * (prof[j * 3 + k] ?? 0) * (share[k] ?? 0)) / (pdf * cosJ));
  }
  return (cosE[j] ?? 1) >= 0 ? 1 : -1;
}
