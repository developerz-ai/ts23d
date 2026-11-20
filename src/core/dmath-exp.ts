// Deterministic exp, log, log2 and log10: the fdlibm algorithms. exp(x) = 2^k · e^r with r = x - k·ln2
// (ln2 held as head + tail) and a rational approximation of e^r; log splits x = 2^k · m with m in
// [√2/2, √2] and sums a polynomial in s = (m - 1)/(m + 1). Only + - * / and word access, so the
// bits do not depend on the CPU or libm. Error < 1 ulp (log2: < 2 ulp, exact at powers of two;
// log10 carries the logarithm as head + tail and is exact at 1, 10, … 1e22).

import { hiWord, scalb, withHiWord, zeroLow } from './dmath-bits.ts';

const LN2_HI = 0.6931471803691238;
const LN2_LO = 1.9082149292705877e-10;
const INV_LN2 = Math.LOG2E;
const P1 = 0.16666666666666602;
const P2 = -0.0027777777777015593;
const P3 = 0.00006613756321437934;
const P4 = -0.0000016533902205465252;
const P5 = 4.1381367970572385e-8;

/** e^x. Overflows to Infinity above 709.78, underflows to 0 below -745.13. */
export function exp(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x > 709.782712893384) return Infinity;
  if (x < -745.1332191019411) return 0;
  const ax = Math.abs(x);
  let hi = x;
  let lo = 0;
  let k = 0;
  if (ax > 0.34657359027997264) {
    if (ax < 1.0397207708399179) k = x < 0 ? -1 : 1;
    else k = Math.trunc(INV_LN2 * x + (x < 0 ? -0.5 : 0.5));
    hi = x - k * LN2_HI;
    lo = k * LN2_LO;
  } else if (ax < 3.725290298461914e-9) return 1 + x;
  const r = hi - lo;
  const rr = r * r;
  const c = r - rr * (P1 + rr * (P2 + rr * (P3 + rr * (P4 + rr * P5))));
  const y = 1 + ((r * c) / (2 - c) - lo + hi);
  return k === 0 ? y : scalb(y, k);
}

const LG1 = 0.6666666666666735;
const LG2 = 0.3999999999940942;
const LG3 = 0.2857142874366239;
const LG4 = 0.22222198432149784;
const LG5 = 0.1818357216161805;
const LG6 = 0.15313837699209373;
const LG7 = 0.14798198605116586;

/** The binary exponent of the last `split`. */
let exponent = 0;

/** x = 2^exponent · m for finite x > 0; returns m in [√2/2, √2). */
function split(x: number): number {
  let v = x;
  let k = 0;
  let hx = hiWord(v);
  if (hx < 0x00100000) {
    v *= 18014398509481984; // subnormal: scale by 2^54
    k = -54;
    hx = hiWord(v);
  }
  hx += 0x3ff00000 - 0x3fe6a09e;
  exponent = k + (hx >> 20) - 0x3ff;
  return withHiWord(v, (hx & 0x000fffff) + 0x3fe6a09e);
}

/** s·(f²/2 + R(s²)) for f = m - 1: log(m) = f - f²/2 + this. */
function series(f: number): number {
  const s = f / (2 + f);
  const z = s * s;
  const w = z * z;
  const t1 = w * (LG2 + w * (LG4 + w * LG6));
  const t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
  return s * (0.5 * f * f + (t2 + t1));
}

/** Natural logarithm. NaN below 0, -Infinity at 0. */
export function log(x: number): number {
  if (Number.isNaN(x) || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  const f = split(x) - 1;
  const k = exponent;
  return series(f) + k * LN2_LO - 0.5 * f * f + f + k * LN2_HI;
}

/** Base-2 logarithm; exact when `x` is a power of two. */
export function log2(x: number): number {
  if (Number.isNaN(x) || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  const f = split(x) - 1;
  return exponent + (series(f) - 0.5 * f * f + f) * INV_LN2;
}

const IVLN10_HI = 0.4342944818781689;
const IVLN10_LO = 2.5082946711645275e-11;
const LOG10_2_HI = 0.30102999566361177;
const LOG10_2_LO = 3.694239077158931e-13;

/** Base-10 logarithm; exact when `x` is a power of ten up to 1e22. */
export function log10(x: number): number {
  if (Number.isNaN(x) || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  const f = split(x) - 1;
  const k = exponent;
  const hfsq = 0.5 * f * f;
  const hi = zeroLow(f - hfsq);
  const lo = f - hi - hfsq + series(f);
  const head = hi * IVLN10_HI;
  const y2 = k * LOG10_2_HI;
  const w = y2 + head;
  return k * LOG10_2_LO + (lo + hi) * IVLN10_LO + lo * IVLN10_HI + (y2 - w + head) + w;
}
