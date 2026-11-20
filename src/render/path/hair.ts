// Strand shading for cutout hair and fur cards: a diffuse term for the light that has scattered
// through many fibres (mostly back to the lit side, as off the hair mass), plus "Marschner-lite" lobes about the strand tangent: R (white,
// shifted toward the root), TT (forward scatter through the fibre, tinted by √albedo) and TRT (the
// coloured secondary highlight, shifted toward the tip). Longitudinal Gaussians in θh, simple
// azimuthal shapes in φ; sampled uniformly over the sphere, the lights carry the highlights.

import { dmath } from '../../core/index.ts';
import { schlick } from '../brdf.ts';
import { dot3 } from './frame.ts';

/** Scale-tilt of the cuticles, radians (Marschner: −5…−10°; R shifts by α, TT −α/2, TRT −3α/2). */
const ALPHA = -0.07;
/**
 * Share of the diffuse (multiple-scattering) term: what the lobes leave of a white fibre's energy,
 * so white fibres absorb nothing (hair.test.ts). 0.8 lost a tenth of it (D476).
 */
const DIFFUSE = 0.87;
/** Scale of the R / TT / TRT lobes (white fibres stay under unit albedo, hair.test.ts). */
const LOBES = 0.12;
/**
 * Share of the diffuse term scattered back to the side the light came from. A card stands for the
 * top of a coat: what it scatters inward meets more fur and comes back out, so it returns nearly
 * all of it, as matte skin of its colour would (0.85 shaded cards at 0.7 of that skin, D476). TT
 * still carries a backlit card's glow.
 */
const BACK = 0.97;
const PDF = 1 / (4 * Math.PI);

const gauss = (b: number, x: number): number =>
  dmath.exp((-x * x) / (2 * b * b)) / (Math.sqrt(2 * Math.PI) * b);

/**
 * f·|cos θi| of a strand with unit tangent `t` on a card facing `n` (toward wo), colour `albedo`, roughness `rough`, for wo → wi,
 * into `f`. Returns the pdf of the uniform-sphere sampler. `t` all zero: falls back to diffuse.
 */
export function evalHair(
  t: ArrayLike<number>,
  n: ArrayLike<number>,
  albedo: ArrayLike<number>,
  rough: number,
  wo: ArrayLike<number>,
  wi: ArrayLike<number>,
  f: Float64Array,
): number {
  const so = Math.max(-1, Math.min(1, dot3(wo, t)));
  const si = Math.max(-1, Math.min(1, dot3(wi, t)));
  const ci = Math.sqrt(1 - si * si);
  const thO = dmath.asin(so);
  const thI = dmath.asin(si);
  const thH = 0.5 * (thI + thO);
  const cd = Math.max(0.4, dmath.cos(0.5 * (thO - thI)));
  // Azimuth between the directions projected across the strand.
  const ox = (wo[0] ?? 0) - so * (t[0] ?? 0);
  const oy = (wo[1] ?? 0) - so * (t[1] ?? 0);
  const oz = (wo[2] ?? 0) - so * (t[2] ?? 0);
  const ix = (wi[0] ?? 0) - si * (t[0] ?? 0);
  const iy = (wi[1] ?? 0) - si * (t[1] ?? 0);
  const iz = (wi[2] ?? 0) - si * (t[2] ?? 0);
  const pl = dmath.hypot(ox, oy, oz) * dmath.hypot(ix, iy, iz);
  const cphi = pl > 1e-9 ? Math.max(-1, Math.min(1, (ox * ix + oy * iy + oz * iz) / pl)) : 1;
  const phi = dmath.acos(cphi);
  const half = dmath.cos(phi * 0.5);
  const b = 0.08 + 0.35 * Math.max(0, Math.min(1, rough));
  // R reflects at the azimuthal half-angle; light entering for TT / TRT meets the fibre near-normal.
  const F = schlick(0.046, 1, cd * half);
  const Ft = schlick(0.046, 1, cd);
  const mR = gauss(b, thH - ALPHA);
  const mTT = gauss(b * 0.5, thH + ALPHA * 0.5);
  const mTRT = gauss(b * 2, thH + ALPHA * 1.5);
  const nR = 0.25 * half;
  const nTT = gauss(0.35, Math.PI - phi) / Math.PI;
  const nTRT = 0.25 * half;
  const inv = 1 / (cd * cd);
  // The many-fibre term behaves like the hair mass's surface: mostly back toward the lit side.
  const ni = dot3(n, wi);
  const side = (ni >= 0 ? BACK : 1 - BACK) * Math.abs(ni);
  for (let k = 0; k < 3; k++) {
    const a = Math.max(0, Math.min(1, albedo[k] ?? 0));
    const tt = Math.sqrt(a);
    const r = mR * nR * F;
    const trans = mTT * nTT * (1 - Ft) * (1 - Ft) * tt;
    const trt = mTRT * nTRT * (1 - Ft) * (1 - Ft) * Ft * a * 4;
    const diffuse = ((DIFFUSE * a) / Math.PI) * side;
    f[k] = (r + trans + trt) * inv * LOBES * ci + diffuse;
  }
  return PDF;
}

/** Uniform direction on the sphere from (u, v) into `wi`; returns its pdf. */
export function sampleSphere(u: number, v: number, wi: Float64Array): number {
  const z = 1 - 2 * u;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  wi[0] = r * dmath.cos(2 * Math.PI * v);
  wi[1] = r * dmath.sin(2 * Math.PI * v);
  wi[2] = z;
  return PDF;
}
