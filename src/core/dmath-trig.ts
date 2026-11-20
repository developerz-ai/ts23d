// Deterministic sin, cos and tan: the fdlibm/musl kernels (minimax polynomials on [-π/4, π/4])
// behind an argument reduction that subtracts a multiple of π/2 held in three parts (33 + 33 + 53
// bits, as in __rem_pio2). Only + - * / on doubles, so the bits do not depend on the CPU or libm.
//
// Range: full accuracy (< 1 ulp) for |x| < 2^20·π/2 ≈ 1.6e6. Beyond that the argument is first
// folded with `%` by the double nearest 2π: still the same bits everywhere, but the absolute error
// grows as |x|·1.2e-16. ±Infinity and NaN give NaN.

import { zeroLow } from './dmath-bits.ts';

const PIO4 = 0.7853981633974483;
const PIO4_LO = 3.061616997868383e-17;
const TWO_PI = 6.283185307179586;
const MEDIUM = 1647099.3291652855; // 2^20·π/2
const TOINT = 6755399441055744; // 1.5·2^52: adding and subtracting it rounds to an integer
const INVPIO2 = 0.6366197723675814;
const PIO2_1 = 1.5707963267341256; // first 33 bits of π/2
const PIO2_1T = 6.077100506506192e-11; // π/2 - PIO2_1
const PIO2_2 = 6.077100506303966e-11; // second 33 bits
const PIO2_2T = 2.0222662487959506e-21;
const PIO2_3 = 2.0222662487111665e-21; // third 33 bits
const PIO2_3T = 8.4784276603689e-32;

const S1 = -0.16666666666666632;
const S2 = 0.00833333333332249;
const S3 = -0.0001984126982985795;
const S4 = 0.0000027557313707070068;
const S5 = -2.5050760253406863e-8;
const S6 = 1.58969099521155e-10;

const C1 = 0.0416666666666666;
const C2 = -0.001388888888887411;
const C3 = 0.00002480158728947673;
const C4 = -2.7557314351390663e-7;
const C5 = 2.087572321298175e-9;
const C6 = -1.1359647557788195e-11;

const T0 = 0.3333333333333341;
const T1 = 0.13333333333320124;
const T2 = 0.05396825397622605;
const T3 = 0.021869488294859542;
const T4 = 0.0088632398235993;
const T5 = 0.0035920791075913124;
const T6 = 0.0014562094543252903;
const T7 = 0.0005880412408202641;
const T8 = 0.0002464631348184699;
const T9 = 0.00007817944429395571;
const T10 = 0.00007140724913826082;
const T11 = -0.000018558637485527546;
const T12 = 0.00002590730518636337;

/** The reduced argument as head + tail, written by `reduce`. */
let rHead = 0;
let rTail = 0;

/** x = n·π/2 + (rHead + rTail) with |rHead| ≤ π/4; returns n mod 4. `x` is finite. */
function reduce(x: number): number {
  const v = Math.abs(x) < MEDIUM ? x : x % TWO_PI;
  const fn = v * INVPIO2 + TOINT - TOINT;
  let r = v - fn * PIO2_1;
  let w = fn * PIO2_1T; // first round, good to 85 bits
  let head = r - w;
  const mag = Math.abs(v);
  if (Math.abs(head) < mag * 0.0000152587890625) {
    const t = r; // cancelled more than 16 bits: second round, good to 118 bits
    w = fn * PIO2_2;
    r = t - w;
    w = fn * PIO2_2T - (t - r - w);
    head = r - w;
    if (Math.abs(head) < mag * 1.7763568394002505e-15) {
      const t2 = r; // cancelled more than 49 bits: third round, 151 bits, covers every double
      w = fn * PIO2_3;
      r = t2 - w;
      w = fn * PIO2_3T - (t2 - r - w);
      head = r - w;
    }
  }
  rHead = head;
  rTail = r - head - w;
  return fn & 3;
}

/** sin(x + y) for |x| ≤ π/4, y the tail of x (`tailed` says whether there is one). */
function kSin(x: number, y: number, tailed: boolean): number {
  const z = x * x;
  const w = z * z;
  const r = S2 + z * (S3 + z * S4) + z * w * (S5 + z * S6);
  const v = z * x;
  return tailed ? x - (z * (0.5 * y - v * r) - y - v * S1) : x + v * (S1 + z * r);
}

/** cos(x + y) for |x| ≤ π/4. */
function kCos(x: number, y: number): number {
  const z = x * x;
  const w = z * z;
  const r = z * (C1 + z * (C2 + z * C3)) + w * w * (C4 + z * (C5 + z * C6));
  const hz = 0.5 * z;
  const u = 1 - hz;
  return u + (1 - u - hz + (z * r - x * y));
}

/** tan(x + y) for |x| ≤ π/4, or -1/tan when `odd` (an odd multiple of π/2 was removed). */
function kTan(x0: number, y0: number, odd: boolean): number {
  let x = x0;
  let y = y0;
  const big = Math.abs(x) >= 0.6743316650390625;
  if (big) {
    if (x < 0) {
      x = -x;
      y = -y;
    }
    x = PIO4 - x + (PIO4_LO - y);
    y = 0;
  }
  const z = x * x;
  const w = z * z;
  const even = T1 + w * (T3 + w * (T5 + w * (T7 + w * (T9 + w * T11))));
  const oddP = z * (T2 + w * (T4 + w * (T6 + w * (T8 + w * (T10 + w * T12)))));
  const s = z * x;
  const r = y + z * (s * (even + oddP) + y) + s * T0;
  const t = x + r;
  if (big) {
    const sg = odd ? -1 : 1;
    const v = sg - 2 * (x + (r - (t * t) / (t + sg)));
    return x0 < 0 ? -v : v;
  }
  if (!odd) return t;
  const t0 = zeroLow(t); // -1/(x + r) to full accuracy
  const v = r - (t0 - x);
  const a = -1 / t;
  const a0 = zeroLow(a);
  return a0 + a * (1 + a0 * t0 + a0 * v);
}

/** Sine of `x` radians. */
export function sin(x: number): number {
  const ax = Math.abs(x);
  if (ax <= PIO4) return ax < 1.4901161193847656e-8 ? x : kSin(x, 0, false);
  if (!(ax < Infinity)) return NaN;
  const n = reduce(x);
  if (n === 0) return kSin(rHead, rTail, true);
  if (n === 1) return kCos(rHead, rTail);
  return n === 2 ? -kSin(rHead, rTail, true) : -kCos(rHead, rTail);
}

/** Cosine of `x` radians. */
export function cos(x: number): number {
  const ax = Math.abs(x);
  if (ax <= PIO4) return ax < 7.450580596923828e-9 ? 1 : kCos(x, 0);
  if (!(ax < Infinity)) return NaN;
  const n = reduce(x);
  if (n === 0) return kCos(rHead, rTail);
  if (n === 1) return -kSin(rHead, rTail, true);
  return n === 2 ? -kCos(rHead, rTail) : kSin(rHead, rTail, true);
}

/** Tangent of `x` radians. */
export function tan(x: number): number {
  const ax = Math.abs(x);
  if (ax <= PIO4) return ax < 7.450580596923828e-9 ? x : kTan(x, 0, false);
  if (!(ax < Infinity)) return NaN;
  const n = reduce(x);
  return kTan(rHead, rTail, (n & 1) === 1);
}
