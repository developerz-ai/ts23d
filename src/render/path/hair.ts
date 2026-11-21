// Strand shading for cutout hair and fur cards: a diffuse term for the light that has scattered
// through many fibres (mostly back to the lit side, as off the hair mass), plus "Marschner-lite" lobes about the strand tangent: R (white,
// shifted toward the root), TT (forward scatter through the fibre, tinted by √albedo) and TRT (the
// coloured secondary highlight, shifted toward the tip). Longitudinal Gaussians in θh, simple
// azimuthal shapes in φ; sampled uniformly over the sphere, the lights carry the highlights.
// Smooth fibres (roughness under GLOSSY: head hair, D525) give R and TRT a real share of the
// energy, taken from the diffuse term, so the sheen band along the strands shows; rough fibres
// (fur, at the strand atlas's 0.5) keep the matte coat of D476 exactly.
// `strandTangents` gives every card vertex the mean of its triangles' tangents, so the tangent
// turns smoothly along a bent card and the sheen is a band across the hair, not a flash per
// flat segment (D540).

import { dmath } from '../../core/index.ts';
import { schlick } from '../brdf.ts';
import type { Scene } from '../scene.ts';
import { CLS } from './classes.ts';
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
/** Below this roughness a fibre counts as smooth (cuticle intact): its R and TRT lobes grow.
 *  (Head hair sits at 0.4 in the atlas, not lower: an engine's GGX on a card at 0.3 shone like
 *  grey plastic plates.) */
const GLOSSY = 0.48;
/** At full gloss (roughness GLOSSY − GLOSS_RAMP and under): the R and TRT scales, and the diffuse
 *  share that keeps a white fibre's energy under one (hair.test.ts). */
const GLOSS_RAMP = 0.08;
const R_GLOSS = 0.6;
const TRT_GLOSS = 0.7;
const DIFFUSE_GLOSS = 0.66;
/** A smooth fibre's R and TRT lobes are this share of the rough width (cuticle scales lie flat). */
const NARROW = 0.65;
/**
 * The sheen band (D541). Light scattered on through the neighbouring fibres of smooth hair stays
 * about the specular cone, so the many-fibre term is not matte: BAND of it is gathered into a
 * Gaussian of width BAND_WIDTH (radians of θh) about the cone, shifted toward the tip as TRT is.
 * BAND_MEAN is a little over that Gaussian's cosine-weighted mean over the lit side for a view
 * across the strand (0.71), where it is largest: dividing by it keeps a white fibre's energy
 * under one from any view (hair.test.ts). Seen along the strand the band is out of reach and the
 * hair is darker, as hair is.
 */
const BAND = 0.6;
const BAND_WIDTH = 0.3;
const BAND_MEAN = 0.75;
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
  // 0 for a rough fibre (fur: unchanged), 1 for a smooth one.
  const gloss = Math.max(0, Math.min(1, (GLOSSY - rough) / GLOSS_RAMP));
  const bs = b * (1 + (NARROW - 1) * gloss);
  const mR = gauss(bs, thH - ALPHA);
  const mTT = gauss(b * 0.5, thH + ALPHA * 0.5);
  const mTRT = gauss(bs * 2, thH + ALPHA * 1.5);
  const nR = 0.25 * half;
  const nTT = gauss(0.35, Math.PI - phi) / Math.PI;
  const nTRT = 0.25 * half;
  const inv = 1 / (cd * cd);
  const kR = LOBES + (R_GLOSS - LOBES) * gloss;
  const kTRT = LOBES + (TRT_GLOSS - LOBES) * gloss;
  const kD = DIFFUSE + (DIFFUSE_GLOSS - DIFFUSE) * gloss;
  // The many-fibre term behaves like the hair mass's surface: mostly back toward the lit side.
  const ni = dot3(n, wi);
  const sheen = dmath.exp(
    -((thH + ALPHA * 1.5) * (thH + ALPHA * 1.5)) / (2 * BAND_WIDTH * BAND_WIDTH),
  );
  const band = 1 + BAND * gloss * (sheen / BAND_MEAN - 1);
  const side = (ni >= 0 ? BACK : 1 - BACK) * Math.abs(ni) * band;
  for (let k = 0; k < 3; k++) {
    const a = Math.max(0, Math.min(1, albedo[k] ?? 0));
    const tt = Math.sqrt(a);
    const r = mR * nR * F;
    const trans = mTT * nTT * (1 - Ft) * (1 - Ft) * tt;
    const trt = mTRT * nTRT * (1 - Ft) * (1 - Ft) * Ft * a * 4;
    const diffuse = ((kD * a) / Math.PI) * side;
    // The gloss's extra R and TRT under min(1, ·): 1/cos²θd over-weights an oblique view, which
    // LOBES' small share hid but a real one would turn into more light out than in.
    const extra = ((kR - LOBES) * r + (kTRT - LOBES) * trt) * Math.min(1, inv * ci);
    f[k] = (r + trans + trt) * inv * LOBES * ci + extra + diffuse;
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

/** Corner angle at vertex `a` of the triangle (a, b, c) in `P`, radians. */
function corner(P: Float32Array, a: number, b: number, c: number): number {
  const ux = (P[b] ?? 0) - (P[a] ?? 0);
  const uy = (P[b + 1] ?? 0) - (P[a + 1] ?? 0);
  const uz = (P[b + 2] ?? 0) - (P[a + 2] ?? 0);
  const vx = (P[c] ?? 0) - (P[a] ?? 0);
  const vy = (P[c + 1] ?? 0) - (P[a + 1] ?? 0);
  const vz = (P[c + 2] ?? 0) - (P[a + 2] ?? 0);
  const l = dmath.hypot(ux, uy, uz) * dmath.hypot(vx, vy, vz);
  return l > 0 ? dmath.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy + uz * vz) / l))) : 0;
}

/**
 * Unit strand tangent per vertex (3 floats) for the vertices of hair cards: the mean of the
 * per-triangle dP/dU (`Scene.tangents`) of the card triangles round each vertex, weighted by
 * each triangle's corner angle there (so a quad's diagonal does not lean it). Zero for a vertex
 * no card uses; empty when the scene has no hair.
 */
export function strandTangents(
  s: Pick<Scene, 'positions' | 'indices' | 'tangents' | 'triangles'>,
  cls: Uint8Array,
): Float32Array {
  if (!cls.includes(CLS.hair)) return new Float32Array(0);
  const out = new Float32Array(s.positions.length);
  for (let t = 0; t < s.triangles; t++) {
    if (cls[t] !== CLS.hair) continue;
    for (let c = 0; c < 3; c++) {
      const v = (s.indices[t * 3 + c] ?? 0) * 3;
      const b = (s.indices[t * 3 + ((c + 1) % 3)] ?? 0) * 3;
      const e = (s.indices[t * 3 + ((c + 2) % 3)] ?? 0) * 3;
      const w = corner(s.positions, v, b, e);
      for (let k = 0; k < 3; k++) out[v + k] = (out[v + k] ?? 0) + w * (s.tangents[t * 6 + k] ?? 0);
    }
  }
  for (let v = 0; v < out.length; v += 3) {
    const l = dmath.hypot(out[v] ?? 0, out[v + 1] ?? 0, out[v + 2] ?? 0);
    if (!(l > 0)) continue;
    for (let k = 0; k < 3; k++) out[v + k] = (out[v + k] ?? 0) / l;
  }
  return out;
}
