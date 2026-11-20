// dmath against references: within 2 ulp of the platform's Math over wide random inputs (the
// platform is itself within 1), within 1 ulp of exact BigInt powers, and ECMAScript's special values.

import { expect, it } from 'bun:test';
import * as dmath from './dmath.ts';
import { type Fn, inputs, magnitudes, ulps, worst } from './dmath-fixtures.ts';

// The platform's libm is itself within 1 ulp, so 2 here means "within 1 ulp of the true value".
it('stays within 2 ulp of Math.* over wide random inputs', () => {
  const r = inputs(7);
  const wide = magnitudes(r, -40, 20);
  expect(worst((x) => x + 1, Math.sin, wide)).toBeGreaterThan(2); // the measure can fail
  expect(worst(dmath.sin, Math.sin, wide)).toBeLessThanOrEqual(2);
  expect(worst(dmath.cos, Math.cos, wide)).toBeLessThanOrEqual(2);
  expect(worst(dmath.tan, Math.tan, wide)).toBeLessThanOrEqual(2);
  const nearQuarterTurns = (): number => Math.round((r() * 2 - 1) * 1e5) * (Math.PI / 2);
  expect(worst(dmath.sin, Math.sin, nearQuarterTurns)).toBeLessThanOrEqual(2);
  expect(worst(dmath.cos, Math.cos, nearQuarterTurns)).toBeLessThanOrEqual(2);
  expect(worst(dmath.tan, Math.tan, nearQuarterTurns)).toBeLessThanOrEqual(2);
  const unit = (): number => r() * 2 - 1;
  expect(worst(dmath.asin, Math.asin, unit)).toBeLessThanOrEqual(2);
  expect(worst(dmath.acos, Math.acos, unit)).toBeLessThanOrEqual(2);
  expect(worst(dmath.atan, Math.atan, magnitudes(r, -30, 70))).toBeLessThanOrEqual(2);
  expect(worst(dmath.exp, Math.exp, () => -745 + r() * 1455)).toBeLessThanOrEqual(2);
  const positive = (): number => Math.abs(magnitudes(r, -1074, 1023)());
  expect(worst(dmath.log, Math.log, positive)).toBeLessThanOrEqual(2);
  expect(worst(dmath.log, Math.log, () => 0.5 + 1.5 * r())).toBeLessThanOrEqual(2);
  expect(worst(dmath.log2, Math.log2, () => 0.5 + 1.5 * r())).toBeLessThanOrEqual(3);
  expect(worst(dmath.cbrt, Math.cbrt, magnitudes(r, -1074, 1023))).toBeLessThanOrEqual(2);
});

it('pow and atan2 stay within 2 ulp, hypot within 3 of the engine', () => {
  const r = inputs(11);
  const base = magnitudes(r, -20, 20);
  let y = 0;
  const pair = (span: number) => (): number => {
    y = (r() * 2 - 1) * span;
    return Math.abs(base());
  };
  expect(
    worst(
      (x) => dmath.pow(x, y),
      (x) => x ** y,
      pair(40),
    ),
  ).toBeLessThanOrEqual(2);
  expect(
    worst(
      (x) => dmath.pow(x, 2.4),
      (x) => x ** 2.4,
      r,
    ),
  ).toBeLessThanOrEqual(2);
  expect(
    worst(
      (x) => dmath.pow(x, 1 / 2.4),
      (x) => x ** (1 / 2.4),
      r,
    ),
  ).toBeLessThanOrEqual(2);
  expect(
    worst(
      (x) => dmath.pow(x, y),
      (x) => x ** y,
      pair(1.2),
    ),
  ).toBeLessThanOrEqual(2);
  const point = (): number => {
    y = base();
    return base();
  };
  expect(
    worst(
      (x) => dmath.atan2(y, x),
      (x) => Math.atan2(y, x),
      point,
    ),
  ).toBeLessThanOrEqual(2);
  expect(
    worst(
      (x) => dmath.hypot(x, y, 0.3),
      (x) => Math.hypot(x, y, 0.3),
      point,
    ),
  ).toBeLessThanOrEqual(3);
});

const F = new Float64Array(1);
const U = new BigInt64Array(F.buffer);

/** x^n rounded to nearest from the exact BigInt product: the reference no libm can blur. */
function exactPow(x: number, n: number): number {
  F[0] = Math.abs(x);
  const b = BigInt.asUintN(64, U[0] ?? 0n);
  const mantissa = (b & ((1n << 52n) - 1n)) | (1n << 52n);
  const product = mantissa ** BigInt(n);
  const shift = product.toString(2).length - 54;
  const top = product >> BigInt(shift);
  const sticky = (product & ((1n << BigInt(shift)) - 1n)) !== 0n;
  let m = top >> 1n;
  if ((top & 1n) === 1n && (sticky || (m & 1n) === 1n)) m += 1n;
  const v = Number(m) * 2 ** ((Number(b >> 52n) - 1075) * n + shift + 1);
  return x < 0 && n % 2 === 1 ? -v : v;
}

/** x^n by squaring: the multiplications JavaScriptCore does for `x ** n` with a whole n ≤ 1000. */
function bySquaring(x: number, n: number): number {
  let result = 1;
  let base = x;
  for (let k = n; k > 0; k = Math.floor(k / 2)) {
    if (k % 2 === 1) result *= base;
    base *= base;
  }
  return result;
}

it('whole exponents are repeated multiplication: the bits of x * x * x, exact powers of ten', () => {
  const r = inputs(3);
  let cubes = 0;
  for (let i = 0; i < 5000; i++) {
    const n = 1 + Math.floor(r() * 1000);
    const x = (r() < 0.5 ? -1 : 1) * (0.97 + r() * 0.06);
    expect(Object.is(dmath.pow(x, n), bySquaring(x, n))).toBe(true);
    expect(Object.is(dmath.pow(x, -n), 1 / bySquaring(x, n))).toBe(true);
    const y = -(0.125 + r() * 7.875);
    expect(dmath.pow(y, 3)).toBe(y * (y * y));
    expect(dmath.pow(y, 4)).toBe(y * y * (y * y));
    cubes = Math.max(cubes, ulps(dmath.pow(y, 3), exactPow(y, 3)));
  }
  expect(cubes).toBeLessThanOrEqual(1);
  for (let n = 0; n <= 22; n++) {
    expect(dmath.pow(10, n)).toBe(Number(`1e${n}`));
    expect(dmath.pow(10, -n)).toBe(Number(`1e-${n}`));
  }
  expect(dmath.pow(-3, 3)).toBe(-27);
  expect(dmath.pow(7, 2)).toBe(49);
  expect(dmath.pow(2, -1)).toBe(0.5);
  expect(dmath.pow(2, 10)).toBe(1024);
  expect(dmath.pow(2, -1074)).toBe(5e-324);
  expect(dmath.pow(1e-200, -2)).toBe(Infinity);
  expect(dmath.pow(1e200, -2)).toBe(0);
  expect(dmath.pow(9, 0.5)).toBe(3);
});

it('past ±1000 a whole exponent is within 1 ulp of the exact power, negative bases included', () => {
  const r = inputs(5);
  let max = 0;
  for (let i = 0; i < 2000; i++) {
    const n = 1001 + Math.floor(r() * 3000);
    const x = -(0.97 + r() * 0.06);
    max = Math.max(max, ulps(dmath.pow(x, n), exactPow(x, n)));
  }
  expect(max).toBeLessThanOrEqual(1);
});

const SPECIAL = [
  0,
  -0,
  1,
  -1,
  0.5,
  -0.5,
  2,
  -2,
  3,
  -3,
  Infinity,
  -Infinity,
  NaN,
  5e-324,
  -5e-324,
  1e-300,
  2.2250738585072014e-308,
  0.9999999999999999,
  1.0000000000000002,
  Math.PI,
  Math.PI / 2,
  -Math.PI / 2,
  Math.PI / 4,
  709.782712893384,
  709.7827128933841,
  -745.1332191019411,
  -745.1332191019412,
  1024,
  -1074,
  -1075,
  0.4375,
  0.6875,
  1.1875,
  2.4375,
  0.975,
  1.5,
  1e5,
];

it('special values match ECMAScript: zeros keep their sign, NaN and infinities propagate', () => {
  const unary: readonly [Fn, Fn][] = [
    [dmath.sin, Math.sin],
    [dmath.cos, Math.cos],
    [dmath.tan, Math.tan],
    [dmath.asin, Math.asin],
    [dmath.acos, Math.acos],
    [dmath.atan, Math.atan],
    [dmath.exp, Math.exp],
    [dmath.log, Math.log],
    [dmath.log2, Math.log2],
    [dmath.cbrt, Math.cbrt],
  ];
  for (const [fn, refFn] of unary)
    for (const x of SPECIAL) {
      const mine = fn(x);
      const ref = refFn(x);
      if (!Number.isFinite(ref) || ref === 0)
        expect([refFn.name, x, mine]).toEqual([refFn.name, x, ref]);
      else expect(ulps(mine, ref)).toBeLessThanOrEqual(2);
    }
  for (const x of SPECIAL)
    for (const y of SPECIAL) {
      for (const [mine, ref] of [
        [dmath.pow(x, y), x ** y],
        [dmath.atan2(x, y), Math.atan2(x, y)],
      ] as const)
        if (!Number.isFinite(ref) || ref === 0) expect([x, y, mine]).toEqual([x, y, ref]);
        else expect(ulps(mine, ref)).toBeLessThanOrEqual(2);
    }
  expect(dmath.sin(Infinity)).toBeNaN();
  expect(dmath.log2(8)).toBe(3);
  expect(dmath.log2(2 ** -1070)).toBe(-1070);
  expect(dmath.exp(0)).toBe(1);
  expect(dmath.atan2(1, -1)).toBe((3 * Math.PI) / 4);
  expect(dmath.acos(-1)).toBe(Math.PI);
  expect(dmath.hypot(3, 4)).toBe(5);
  expect(dmath.hypot(2, 3, 6)).toBe(7);
});
