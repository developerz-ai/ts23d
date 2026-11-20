// Deterministic pow, cbrt and hypot. pow is fdlibm's: log2(x) to about 70 bits as head + tail
// (s = (x - b)/(x + b) with b = 1 or 1.5, a polynomial, 2/(3·ln2) in two parts), y·log2(x) in two
// parts, then 2^(n + r) from the exp kernel. Only + - * /, Math.sqrt and word access, so the bits
// do not depend on the CPU or libm. Error < 1 ulp (whole exponents: repeated multiplication, as
// the engine does); special values follow ECMAScript's `**`.

import { fromHiWord, hiWord, scalb, withHiWord, zeroLow } from './dmath-bits.ts';
import { exp, log } from './dmath-exp.ts';

const L1 = 0.5999999999999946;
const L2 = 0.4285714285785502;
const L3 = 0.33333332981837743;
const L4 = 0.272728123808534;
const L5 = 0.23066074577556175;
const L6 = 0.20697501780033842;
const P1 = 0.16666666666666602;
const P2 = -0.0027777777777015593;
const P3 = 0.00006613756321437934;
const P4 = -0.0000016533902205465252;
const P5 = 4.1381367970572385e-8;
const LG2 = Math.LN2;
const LG2_H = 0.6931471824645996;
const LG2_L = -1.904654299957768e-9;
const OVT = 8.008566259537294e-17; // -(1024 - log2(largest double + half an ulp))
const CP = 0.9617966939259756; // 2/(3·ln2)
const CP_H = 0.9617967009544373;
const CP_L = -7.028461650952758e-9;
const IVLN2 = Math.LOG2E;
const IVLN2_H = 1.4426950216293335;
const IVLN2_L = 1.9259629911266175e-8;
const DP_H = 0.5849624872207642; // log2(1.5), head
const DP_L = 1.350039202129749e-8;

/** log2 of the last `log2Parts` argument as head + tail. */
let lHead = 0;
let lTail = 0;

/** log2(ax) for finite ax > 0 with |1 - ax| ≤ 2^-20, by the series of log(1 + t). */
function log2NearOne(ax: number): void {
  const t = ax - 1;
  const w = t * t * (0.5 - t * (0.3333333333333333 - t * 0.25));
  const u = IVLN2_H * t;
  const v = t * IVLN2_L - w * IVLN2;
  lHead = zeroLow(u + v);
  lTail = v - (lHead - u);
}

/** log2(ax) for finite ax > 0. */
function log2Parts(ax: number): void {
  let a = ax;
  let n = 0;
  let ix = hiWord(a);
  if (ix < 0x00100000) {
    a *= 9007199254740992; // subnormal: scale by 2^53
    n = -53;
    ix = hiWord(a);
  }
  n += (ix >> 20) - 0x3ff;
  const j = ix & 0x000fffff;
  ix = j | 0x3ff00000;
  let k = 0;
  if (j > 0x3988e) {
    if (j < 0xbb67a)
      k = 1; // √(3/2) < a < √3: centre on 1.5
    else {
      n += 1;
      ix -= 0x00100000;
    }
  }
  a = withHiWord(a, ix);
  const bp = k === 1 ? 1.5 : 1;
  let u = a - bp;
  let v = 1 / (a + bp);
  const ss = u * v;
  const sH = zeroLow(ss);
  let tH = fromHiWord(((ix >> 1) | 0x20000000) + 0x00080000 + (k << 18));
  let tL = a - (tH - bp);
  const sL = v * (u - sH * tH - sH * tL);
  let s2 = ss * ss;
  let r = s2 * s2 * (L1 + s2 * (L2 + s2 * (L3 + s2 * (L4 + s2 * (L5 + s2 * L6)))));
  r += sL * (sH + ss);
  s2 = sH * sH;
  tH = zeroLow(3 + s2 + r);
  tL = r - (tH - 3 - s2);
  u = sH * tH;
  v = sL * tH + tL * ss;
  const pH = zeroLow(u + v);
  const pL = v - (pH - u);
  const zH = CP_H * pH;
  const zL = CP_L * pH + pL * CP + (k === 1 ? DP_L : 0);
  const dpH = k === 1 ? DP_H : 0;
  lHead = zeroLow(zH + zL + dpH + n);
  lTail = zL - (lHead - n - dpH - zH);
}

/** 0 = not an integer, 1 = odd, 2 = even. */
function parity(y: number): number {
  const ay = Math.abs(y);
  if (ay >= 9007199254740992) return 2;
  if (Math.floor(ay) !== ay) return 0;
  return Math.floor(ay * 0.5) * 2 === ay ? 2 : 1;
}

/** The largest whole exponent taken by repeated multiplication (JavaScriptCore's limit for `**`). */
const WHOLE_MAX = 1000;

/** x^n for a whole n ≥ 1 by squaring: the multiplications `x ** n` does in JavaScriptCore. */
function powWhole(x: number, n: number): number {
  let result = 1;
  let base = x;
  for (let k = n; k > 0; k = Math.floor(k / 2)) {
    if (k % 2 === 1) result *= base;
    base *= base;
  }
  return result;
}

/**
 * `x` to the power `y`, as ECMAScript's `x ** y` defines the special cases. A whole `y` up to
 * ±1000 is repeated multiplication (squaring), so `pow(x, 3)` is `x * (x * x)` to the bit and
 * `pow(10, n)` is exact for |n| ≤ 22; a negative whole `y` is the reciprocal of that. Everything
 * else is within 1 ulp.
 */
export function pow(x: number, y: number): number {
  if (y === 2) return x * x; // first: squares are the common call, and x * x is right for every x
  if (y === 0) return 1;
  if (Number.isNaN(x) || Number.isNaN(y)) return NaN;
  if (y === 1) return x;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  if (ay === Infinity) {
    if (ax === 1) return NaN;
    return ax > 1 === y > 0 ? Infinity : 0;
  }
  const xNeg = x < 0 || (x === 0 && 1 / x < 0);
  const par = xNeg ? parity(y) : 2;
  if (ax === 0 || ax === Infinity || ax === 1) {
    if (ax === 1 && par === 0) return NaN;
    const z = y < 0 ? 1 / ax : ax;
    return par === 1 ? -z : z;
  }
  if (par === 0) return NaN;
  if (y === 0.5) return Math.sqrt(x);
  if (ay <= WHOLE_MAX && Math.floor(ay) === ay) {
    const p = powWhole(x, ay);
    if (y > 0) return p;
    if (p !== 0 && p !== Infinity && p !== -Infinity) return 1 / p;
  }
  const sign = par === 1 ? -1 : 1;
  if (ay > 2147483648) {
    // |y| > 2^31: over- or underflows unless x is within 2^-20 of 1.
    if (ay > 1.8446744073709552e19 || ax < 0.9999995231628418 || ax >= 1.0000009536743164)
      return ax > 1 === y > 0 ? sign * Infinity : sign * 0;
    log2NearOne(ax);
  } else log2Parts(ax);
  const y1 = zeroLow(y);
  const pL = (y - y1) * lHead + y * lTail;
  let pH = y1 * lHead;
  let z = pL + pH;
  if (z >= 1024) {
    if (z > 1024 || pL + OVT > z - pH) return sign * Infinity;
  } else if (z <= -1075) {
    if (z < -1075 || pL <= z - pH) return sign * 0;
  }
  let n = 0;
  if (Math.abs(z) > 0.5) {
    n = z < 0 ? -Math.floor(0.5 - z) : Math.floor(z + 0.5);
    pH -= n;
  }
  const t = zeroLow(pL + pH);
  const u = t * LG2_H;
  const v = (pL - (t - pH)) * LG2 + t * LG2_L;
  z = u + v;
  const w = v - (z - u);
  const zz = z * z;
  const t1 = z - zz * (P1 + zz * (P2 + zz * (P3 + zz * (P4 + zz * P5))));
  const r = (z * t1) / (t1 - 2) - (w + z * w);
  return sign * scalb(1 - (r - z), n);
}

/** Cube root, within 1 ulp: e^(log|x| / 3) polished by one Newton step. */
export function cbrt(x: number): number {
  if (x === 0 || Number.isNaN(x) || x === Infinity || x === -Infinity) return x;
  const ax = Math.abs(x);
  // Keep y³ away from the subnormals and from overflow: 2^±162 is a cube, so the scaling is exact.
  if (ax < 1e-200) return cbrt(x * 5.846006549323612e48) * 5.551115123125783e-17;
  if (ax > 1e200) return cbrt(x * 1.7105694144590052e-49) * 18014398509481984;
  const y = exp(log(ax) / 3);
  const r = y - (y * y * y - ax) / (3 * y * y);
  return x < 0 ? -r : r;
}

/**
 * Length of (x, y, z, w): √(x² + y² + z² + w²), no rescaling. Within 1.5 ulp while the squares
 * neither overflow nor underflow (components between about 1e-150 and 1e150, or zero).
 */
export function hypot(x: number, y: number, z = 0, w = 0): number {
  return Math.sqrt(x * x + y * y + z * z + w * w);
}

/** Length of a vector of any size, summed in order: `norm([x, y, z])` is `hypot(x, y, z)`. */
export function norm(v: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    const c = v[i] ?? 0;
    sum += c * c;
  }
  return Math.sqrt(sum);
}
