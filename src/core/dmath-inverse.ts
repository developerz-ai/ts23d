// Deterministic asin, acos, atan and atan2: the fdlibm algorithms (a rational approximation for
// asin/acos, an odd polynomial on four sub-ranges for atan, π held as head + tail). Only + - * /
// and Math.sqrt, which IEEE-754 rounds exactly, so the bits do not depend on the CPU or libm.
// Error < 1 ulp over the whole domain; special values follow ECMAScript's Math.

import { zeroLow } from './dmath-bits.ts';

const PI = Math.PI;
const PI_LO = 1.2246467991473532e-16;
const PIO2_HI = 1.5707963267948966;
const PIO2_LO = 6.123233995736766e-17;
const PIO4_HI = 0.7853981633974483;

const P0 = 0.16666666666666666;
const P1 = -0.3255658186224009;
const P2 = 0.20121253213486293;
const P3 = -0.04005553450067941;
const P4 = 0.0007915349942898145;
const P5 = 0.00003479331075960212;
const Q1 = -2.403394911734414;
const Q2 = 2.0209457602335057;
const Q3 = -0.6882839716054533;
const Q4 = 0.07703815055590194;

/** (asin(√z) - √z) / (√z·z) on [0, 0.25]. */
function ratio(z: number): number {
  const p = z * (P0 + z * (P1 + z * (P2 + z * (P3 + z * (P4 + z * P5)))));
  const q = 1 + z * (Q1 + z * (Q2 + z * (Q3 + z * Q4)));
  return p / q;
}

/** Arcsine in [-π/2, π/2]; NaN outside [-1, 1]. */
export function asin(x: number): number {
  const ax = Math.abs(x);
  if (!(ax < 1)) return ax === 1 ? x * PIO2_HI + x * PIO2_LO : NaN;
  if (ax < 0.5) return ax < 1.4901161193847656e-8 ? x : x + x * ratio(x * x);
  const z = (1 - ax) * 0.5;
  const s = Math.sqrt(z);
  const r = ratio(z);
  let v: number;
  if (ax >= 0.975) v = PIO2_HI - (2 * (s + s * r) - PIO2_LO);
  else {
    const f = zeroLow(s);
    const c = (z - f * f) / (s + f);
    v = PIO4_HI - (2 * s * r - (PIO2_LO - 2 * c) - (PIO4_HI - 2 * f));
  }
  return x < 0 ? -v : v;
}

/** Arccosine in [0, π]; NaN outside [-1, 1]. */
export function acos(x: number): number {
  const ax = Math.abs(x);
  if (!(ax < 1)) {
    if (ax !== 1) return NaN;
    return x > 0 ? 0 : PI;
  }
  if (ax < 0.5) {
    if (ax <= 6.938893903907228e-18) return PIO2_HI + PIO2_LO;
    return PIO2_HI - (x - (PIO2_LO - x * ratio(x * x)));
  }
  if (x < 0) {
    const z = (1 + x) * 0.5;
    const s = Math.sqrt(z);
    const w = ratio(z) * s - PIO2_LO;
    return 2 * (PIO2_HI - (s + w));
  }
  const z = (1 - x) * 0.5;
  const s = Math.sqrt(z);
  const f = zeroLow(s);
  const c = (z - f * f) / (s + f);
  const w = ratio(z) * s + c;
  return 2 * (f + w);
}

const A0 = 0.3333333333333293;
const A1 = -0.19999999999876483;
const A2 = 0.14285714272503466;
const A3 = -0.11111110405462356;
const A4 = 0.09090887133436507;
const A5 = -0.0769187620504483;
const A6 = 0.06661073137387531;
const A7 = -0.058335701337905735;
const A8 = 0.049768779946159324;
const A9 = -0.036531572744216916;
const A10 = 0.016285820115365782;

/** Arctangent in [-π/2, π/2]. */
export function atan(x: number): number {
  if (Number.isNaN(x)) return NaN;
  const ax = Math.abs(x);
  if (ax >= 73786976294838210000) return x < 0 ? -(PIO2_HI + PIO2_LO) : PIO2_HI + PIO2_LO;
  let hi = 0;
  let lo = 0;
  let t = x;
  if (ax < 0.4375) {
    if (ax < 7.450580596923828e-9) return x;
  } else if (ax < 0.6875) {
    hi = 0.4636476090008061; // atan(0.5)
    lo = 2.2698777452961687e-17;
    t = (2 * ax - 1) / (2 + ax);
  } else if (ax < 1.1875) {
    hi = PIO4_HI; // atan(1)
    lo = 3.061616997868383e-17;
    t = (ax - 1) / (ax + 1);
  } else if (ax < 2.4375) {
    hi = 0.982793723247329; // atan(1.5)
    lo = 1.3903311031230998e-17;
    t = (ax - 1.5) / (1 + 1.5 * ax);
  } else {
    hi = PIO2_HI; // atan(∞)
    lo = PIO2_LO;
    t = -1 / ax;
  }
  const z = t * t;
  const w = z * z;
  const s1 = z * (A0 + w * (A2 + w * (A4 + w * (A6 + w * (A8 + w * A10)))));
  const s2 = w * (A1 + w * (A3 + w * (A5 + w * (A7 + w * A9))));
  if (hi === 0) return t - t * (s1 + s2);
  const v = hi - (t * (s1 + s2) - lo - t);
  return x < 0 ? -v : v;
}

const negative = (v: number): boolean => v < 0 || (v === 0 && 1 / v < 0);

/** The angle of the point (x, y) in [-π, π]. */
export function atan2(y: number, x: number): number {
  if (Number.isNaN(x) || Number.isNaN(y)) return NaN;
  if (x === 1) return atan(y);
  const xNeg = negative(x);
  const yNeg = negative(y);
  if (y === 0) return xNeg ? (yNeg ? -PI : PI) : y;
  const half = PIO2_HI + PIO2_LO;
  if (x === 0) return yNeg ? -half : half;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  if (ax === Infinity) {
    const a = ay === Infinity ? (xNeg ? 3 * PIO4_HI : PIO4_HI) : xNeg ? PI : 0;
    return yNeg ? -a : a;
  }
  if (ay === Infinity) return yNeg ? -half : half;
  const q = ay / ax;
  const z = xNeg && q < 5.421010862427522e-20 ? 0 : atan(q);
  if (!xNeg) return yNeg ? -z : z;
  return yNeg ? z - PI_LO - PI : PI - (z - PI_LO);
}
