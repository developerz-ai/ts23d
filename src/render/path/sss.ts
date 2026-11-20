// Subsurface scattering for skin: Burley's normalised diffusion profile (Christensen & Burley
// 2015), R(r) = A·(e^(−r/d) + e^(−r/3d)) ÷ (8π d r), sampled exactly as its two-exponential
// mixture, with the exit point found by a disk probe along the normal (no random walk): pick a
// channel, a radius and an angle, shoot a short ray back at the surface, keep the first skin hit.
// The weight per channel is R ÷ (mixture pdf · |n·n_exit|): light enters at one point and leaves
// a few millimetres away, red farthest — ears and nostrils glow, terminators go warm.

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

const tx = new Float64Array(3);
const bx = new Float64Array(3);
const o = new Float64Array(3);
const dir = new Float64Array(3);
const shape = new Float64Array(3);
const probeHit: Hit = newHit();

/**
 * Exit point for light entering skin surface `s` (colour `s.albedo`). Fills `exit` (a hit on the
 * probe ray `po`, `pd`) and `weight`; false when the probe found no skin (use the entry point).
 */
export function probeExit(
  w: World,
  s: Surf,
  uc: number,
  ur: number,
  ua: number,
  exit: Hit,
  po: Float64Array,
  pd: Float64Array,
  weight: Float64Array,
): boolean {
  let dmax = 0;
  for (let k = 0; k < 3; k++) {
    const a = Math.max(0.01, Math.min(0.99, s.albedo[k] ?? 0));
    shape[k] = (SKIN_MFP[k] ?? 0.001) / shapeScale(a);
    dmax = Math.max(dmax, shape[k] ?? 0);
  }
  const c = Math.min(2, Math.floor(uc * 3));
  const r = sampleRadius(ur, shape[c] ?? dmax);
  const rmax = REACH * dmax;
  if (r >= rmax) return false;
  basis(s.n);
  axes(tx, bx);
  const hh = Math.sqrt(rmax * rmax - r * r);
  const ca = dmath.cos(2 * Math.PI * ua) * r;
  const sa = dmath.sin(2 * Math.PI * ua) * r;
  for (let k = 0; k < 3; k++) {
    o[k] = (s.p[k] ?? 0) + (tx[k] ?? 0) * ca + (bx[k] ?? 0) * sa + (s.n[k] ?? 0) * hh;
    dir[k] = -(s.n[k] ?? 0);
  }
  const found = w.bvh.closest(o, dir, 2 * hh, probeHit, (t) => w.cls[t] === CLS.skin);
  if (!found) return false;
  exit.t = probeHit.t;
  exit.tri = probeHit.tri;
  exit.b1 = probeHit.b1;
  exit.b2 = probeHit.b2;
  po.set(o);
  pd.set(dir);
  // Exit geometric normal for the area-measure pdf.
  const sc = w.scene;
  const P = sc.positions;
  const ia = (sc.indices[exit.tri * 3] ?? 0) * 3;
  const ib = (sc.indices[exit.tri * 3 + 1] ?? 0) * 3;
  const ic = (sc.indices[exit.tri * 3 + 2] ?? 0) * 3;
  const e1 = [0, 1, 2].map((k) => (P[ib + k] ?? 0) - (P[ia + k] ?? 0));
  const e2 = [0, 1, 2].map((k) => (P[ic + k] ?? 0) - (P[ia + k] ?? 0));
  const nx = (e1[1] ?? 0) * (e2[2] ?? 0) - (e1[2] ?? 0) * (e2[1] ?? 0);
  const ny = (e1[2] ?? 0) * (e2[0] ?? 0) - (e1[0] ?? 0) * (e2[2] ?? 0);
  const nz = (e1[0] ?? 0) * (e2[1] ?? 0) - (e1[1] ?? 0) * (e2[0] ?? 0);
  const cosE = Math.max(0.3, Math.abs(dot3([nx, ny, nz], s.n)) / (dmath.hypot(nx, ny, nz) || 1));
  let dist = 0;
  for (let k = 0; k < 3; k++) {
    const x = (o[k] ?? 0) + (dir[k] ?? 0) * exit.t - (s.p[k] ?? 0);
    dist += x * x;
  }
  dist = Math.sqrt(dist);
  const pdf =
    (radiusPdf(r, shape[0] ?? 1) + radiusPdf(r, shape[1] ?? 1) + radiusPdf(r, shape[2] ?? 1)) /
    (3 * 2 * Math.PI * Math.max(r, 1e-9));
  for (let k = 0; k < 3; k++) {
    const a = s.albedo[k] ?? 0;
    weight[k] = Math.min(4, (a * burley(dist, shape[k] ?? 1)) / (pdf * cosE));
  }
  return true;
}
