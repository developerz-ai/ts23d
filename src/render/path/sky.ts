// The path tracer's lights: a procedural studio sky (cool zenith, bright horizon band, dim ground
// below) and a warm key sun as a small disc. Both are importance sampled for next-event estimation
// (sun: uniform cone; sky: a tabulated CDF over cos θ, azimuth uniform since the sky is round) and
// report their pdfs so BSDF-sampled rays can be MIS-weighted. Calibrated to the raster studio rig:
// an open, sun-facing surface receives ≈ the same irradiance (lighting.ts), so palettes stay true.

import type { V3 } from '../lighting.ts';

export interface Sky {
  /** Unit vector toward the sun. */
  readonly sun: V3;
  /** Sun radiance per channel (irradiance at normal incidence ÷ disc solid angle). */
  readonly sunL: V3;
  /** cos of the disc's half-angle and its solid angle. */
  readonly cosDisc: number;
  readonly omega: number;
  readonly zenith: V3;
  readonly horizon: V3;
  readonly ground: V3;
  /** CDF over cos θ bins (−1…1), BINS + 1 entries, last = 1. */
  readonly cdf: Float64Array;
  /** Probability of each bin. */
  readonly pbin: Float64Array;
  /** Probability that next-event estimation picks the sun (else the sky). */
  readonly pSun: number;
}

const BINS = 64;
const DZ = 2 / BINS;

export interface SkyOptions {
  readonly sun: V3;
  readonly sunColor: V3;
  /** Disc half-angle, degrees. Default 2.5 (a studio soft box, not the 0.27° real sun). */
  readonly discDeg?: number;
  readonly zenith?: V3;
  readonly horizon?: V3;
  readonly ground?: V3;
}

/** Sky radiance of channel k toward direction z (up component). */
export function skyAt(s: Sky, z: number, k: number): number {
  if (z < 0) {
    const g = s.ground[k] ?? 0;
    const h = s.horizon[k] ?? 0;
    return g + (h - g) * Math.exp(z * 12);
  }
  const h = s.horizon[k] ?? 0;
  return h + ((s.zenith[k] ?? 0) - h) * Math.sqrt(z);
}

const lum = (s: Sky, z: number): number =>
  0.2126 * skyAt(s, z, 0) + 0.7152 * skyAt(s, z, 1) + 0.0722 * skyAt(s, z, 2);

export function makeSky(o: SkyOptions): Sky {
  const cosDisc = Math.cos(((o.discDeg ?? 2.5) * Math.PI) / 180);
  const omega = 2 * Math.PI * (1 - cosDisc);
  const base = {
    sun: o.sun,
    sunL: o.sunColor.map((c) => c / omega) as V3,
    cosDisc,
    omega,
    zenith: o.zenith ?? [0.3, 0.33, 0.42],
    horizon: o.horizon ?? [0.5, 0.49, 0.46],
    ground: o.ground ?? [0.15, 0.14, 0.13],
    cdf: new Float64Array(BINS + 1),
    pbin: new Float64Array(BINS),
    pSun: 0,
  };
  let total = 0;
  for (let i = 0; i < BINS; i++) {
    // Floor so dark bins still get samples (variance, not bias, is what the floor buys).
    const w = Math.max(1e-3, lum(base, -1 + (i + 0.5) * DZ));
    base.pbin[i] = w;
    total += w;
  }
  let acc = 0;
  for (let i = 0; i < BINS; i++) {
    base.pbin[i] = (base.pbin[i] ?? 0) / total;
    acc += base.pbin[i] ?? 0;
    base.cdf[i + 1] = acc;
  }
  base.cdf[BINS] = 1;
  const sunE = Math.max(...o.sunColor);
  const skyE = Math.PI * Math.max(...base.zenith, ...base.horizon);
  return { ...base, pSun: sunE + skyE > 0 ? sunE / (sunE + skyE) : 0 };
}

/** Pdf (solid angle) of sampling direction d from the sky table. */
export function skyPdf(s: Sky, z: number): number {
  const i = Math.max(0, Math.min(BINS - 1, Math.floor((z + 1) / DZ)));
  return (s.pbin[i] ?? 0) / (2 * Math.PI * DZ);
}

/** Pdf (solid angle) of sampling direction d inside the sun disc (0 outside). */
export const sunPdf = (s: Sky, d: ArrayLike<number>): number => (inDisc(s, d) ? 1 / s.omega : 0);

export const inDisc = (s: Sky, d: ArrayLike<number>): boolean =>
  (d[0] ?? 0) * s.sun[0] + (d[1] ?? 0) * s.sun[1] + (d[2] ?? 0) * s.sun[2] >= s.cosDisc;

/** Sample the sky table with (u, v): direction into `d`, returns its pdf. */
export function sampleSky(s: Sky, u: number, v: number, d: Float64Array): number {
  let lo = 0;
  let hi = BINS;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if ((s.cdf[m] ?? 0) <= u) lo = m;
    else hi = m;
  }
  const c0 = s.cdf[lo] ?? 0;
  const p = s.pbin[lo] ?? 1;
  const z = Math.min(1, -1 + (lo + (u - c0) / Math.max(p, 1e-12)) * DZ);
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  const phi = 2 * Math.PI * v;
  d[0] = r * Math.cos(phi);
  d[1] = r * Math.sin(phi);
  d[2] = z;
  return p / (2 * Math.PI * DZ);
}

/** Sample a direction uniformly inside the sun disc; returns its pdf (1 / Ω). */
export function sampleSun(s: Sky, u: number, v: number, d: Float64Array): number {
  const z = 1 - u * (1 - s.cosDisc);
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  const phi = 2 * Math.PI * v;
  const [ax, ay, az] = s.sun;
  // Orthonormal frame about the sun direction (Duff et al. branchless basis).
  const sign = az >= 0 ? 1 : -1;
  const a = -1 / (sign + az);
  const b = ax * ay * a;
  const tx = 1 + sign * ax * ax * a;
  const ty = sign * b;
  const tz = -sign * ax;
  const bx = b;
  const by = sign + ay * ay * a;
  const bz = -ay;
  const x = r * Math.cos(phi);
  const y = r * Math.sin(phi);
  d[0] = tx * x + bx * y + ax * z;
  d[1] = ty * x + by * y + ay * z;
  d[2] = tz * x + bz * y + az * z;
  return 1 / s.omega;
}
