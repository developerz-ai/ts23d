// Deterministic expm1, log1p, sinh, cosh and tanh: the fdlibm algorithms. expm1 reduces x to
// r = x - k·ln2 and evaluates a rational approximation of e^r - 1 without cancelling near zero;
// log1p folds the rounding of 1 + x back in as a correction term; the hyperbolics are built on
// expm1 and exp. Only + - * / and word access, so the bits do not depend on the CPU or libm.
// Error < 1 ulp (expm1, log1p), < 2 ulp (sinh, cosh, tanh).

import { hiWord, scalb, withHiWord } from './dmath-bits.ts';
import { exp } from './dmath-exp.ts';

const LN2_HI = 0.6931471803691238;
const LN2_LO = 1.9082149292705877e-10;
const INV_LN2 = Math.LOG2E;
const Q1 = -0.03333333333333313;
const Q2 = 0.0015873015872548146;
const Q3 = -0.0000793650757867488;
const Q4 = 0.000004008217827329362;
const Q5 = -2.0109921818362437e-7;

/** e^x - 1, accurate where e^x is close to 1. */
export function expm1(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x > 709.782712893384) return Infinity;
  if (x < -38.816242111356935) return -1; // below -56·ln2 the result rounds to -1
  const ax = Math.abs(x);
  if (ax < 5.551115123125783e-17) return x; // |x| < 2^-54, keeps -0
  let r = x;
  let c = 0;
  let k = 0;
  if (ax > 0.34657359027997264) {
    let hi: number;
    let lo: number;
    if (ax < 1.0397207708399179) {
      k = x < 0 ? -1 : 1;
      hi = x - k * LN2_HI;
      lo = k * LN2_LO;
    } else {
      k = Math.trunc(INV_LN2 * x + (x < 0 ? -0.5 : 0.5));
      hi = x - k * LN2_HI;
      lo = k * LN2_LO;
    }
    r = hi - lo;
    c = hi - r - lo;
  }
  const hfx = 0.5 * r;
  const hxs = r * hfx;
  const r1 = 1 + hxs * (Q1 + hxs * (Q2 + hxs * (Q3 + hxs * (Q4 + hxs * Q5))));
  const t = 3 - r1 * hfx;
  let e = hxs * ((r1 - t) / (6 - r * t));
  if (k === 0) return r - (r * e - hxs);
  e = r * (e - c) - c - hxs;
  if (k === -1) return 0.5 * (r - e) - 0.5;
  if (k === 1) return r < -0.25 ? -2 * (e - (r + 0.5)) : 1 + 2 * (r - e);
  if (k <= -2 || k > 56) return scalb(1 - (e - r), k) - 1;
  if (k < 20) return scalb(1 - scalb(1, -k) - (e - r), k);
  return scalb(r - (e + scalb(1, -k)) + 1, k);
}

const LP1 = 0.6666666666666735;
const LP2 = 0.3999999999940942;
const LP3 = 0.2857142874366239;
const LP4 = 0.22222198432149784;
const LP5 = 0.1818357216161805;
const LP6 = 0.15313837699209373;
const LP7 = 0.14798198605116586;

/** log(1 + x), accurate where x is close to 0. NaN below -1, -Infinity at -1. */
export function log1p(x: number): number {
  if (Number.isNaN(x) || x < -1) return NaN;
  if (x === -1) return -Infinity;
  if (x === Infinity) return Infinity;
  const ax = Math.abs(x);
  if (ax < 1.862645149230957e-9) return ax < 5.551115123125783e-17 ? x : x - x * x * 0.5;
  let k = 0;
  let f = x;
  let c = 0;
  let small = false; // |f| < 2^-20: a short series is exact enough
  // 1 + x outside [√2/2, √2): take the exponent out.
  if (!(x > -0.2928932188134525 && x < 0.41421356237309503)) {
    let u = x;
    if (x < 9007199254740992) {
      u = 1 + x;
      k = (hiWord(u) >> 20) - 1023;
      c = (k > 0 ? 1 - (u - x) : x - (u - 1)) / u; // what rounding 1 + x lost
    } else k = (hiWord(u) >> 20) - 1023;
    const hu = hiWord(u) & 0x000fffff;
    if (hu < 0x6a09e) u = withHiWord(u, hu | 0x3ff00000);
    else {
      k += 1;
      u = withHiWord(u, hu | 0x3fe00000);
    }
    small = hu === 0;
    f = u - 1;
  }
  const hfsq = 0.5 * f * f;
  if (small) {
    if (f === 0) return k === 0 ? 0 : k * LN2_HI + (c + k * LN2_LO);
    const R = hfsq * (1 - 0.6666666666666666 * f);
    return k === 0 ? f - R : k * LN2_HI - (R - (k * LN2_LO + c) - f);
  }
  const s = f / (2 + f);
  const z = s * s;
  const R = z * (LP1 + z * (LP2 + z * (LP3 + z * (LP4 + z * (LP5 + z * (LP6 + z * LP7))))));
  if (k === 0) return f - (hfsq - s * (hfsq + R));
  return k * LN2_HI - (hfsq - (s * (hfsq + R) + (k * LN2_LO + c)) - f);
}

/** exp(|x|)/2 for |x| ≥ 22, without overflowing before the halving. */
function halfExp(ax: number): number {
  if (ax < 709.782712893384) return 0.5 * exp(ax);
  if (ax > 710.4758600739439) return Infinity;
  const w = exp(0.5 * ax);
  return 0.5 * w * w;
}

/** Hyperbolic sine. */
export function sinh(x: number): number {
  if (Number.isNaN(x)) return NaN;
  const ax = Math.abs(x);
  if (ax < 3.725290298461914e-9) return x; // |x| < 2^-28, keeps -0
  const h = x < 0 ? -0.5 : 0.5;
  if (ax >= 22) return 2 * h * halfExp(ax);
  const t = expm1(ax);
  return ax < 1 ? h * (2 * t - (t * t) / (t + 1)) : h * (t + t / (t + 1));
}

/** Hyperbolic cosine. */
export function cosh(x: number): number {
  if (Number.isNaN(x)) return NaN;
  const ax = Math.abs(x);
  if (ax < 0.34657359027997264) {
    const t = expm1(ax);
    const w = 1 + t;
    return ax < 2.7755575615628914e-17 ? w : 1 + (t * t) / (w + w);
  }
  if (ax >= 22) return halfExp(ax);
  const t = exp(ax);
  return 0.5 * t + 0.5 / t;
}

/** Hyperbolic tangent, in [-1, 1]. */
export function tanh(x: number): number {
  if (Number.isNaN(x)) return NaN;
  const ax = Math.abs(x);
  if (ax < 3.725290298461914e-9) return x; // |x| < 2^-28, keeps -0
  let z = 1;
  if (ax < 22) {
    if (ax >= 1) z = 1 - 2 / (expm1(2 * ax) + 2);
    else {
      const t = expm1(-2 * ax);
      z = -t / (t + 2);
    }
  }
  return x < 0 ? -z : z;
}
