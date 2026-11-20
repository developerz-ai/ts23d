// log10, expm1, log1p, sinh, cosh, tanh and norm against the platform's Math (itself within 1 to
// 2 ulp), their exact values and ECMAScript's special values.

import { expect, it } from 'bun:test';
import * as dmath from './dmath.ts';

const F = new Float64Array(1);
const U = new BigInt64Array(F.buffer);
/** Doubles as integers in value order, so a difference is a distance in ulps. */
const ordinal = (x: number): bigint => {
  F[0] = x;
  const b = U[0] ?? 0n;
  return b < 0n ? -(b & 0x7fffffffffffffffn) : b;
};
const ulps = (a: number, b: number): number => {
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.isNaN(a) && Number.isNaN(b) ? 0 : Infinity;
  const d = ordinal(a) - ordinal(b);
  return Number(d < 0n ? -d : d);
};
/** xorshift32: the test's own inputs, the same on every machine. */
function inputs(seed: number): () => number {
  let s = seed;
  const next = (): number => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  return () => next() + next() / 4294967296;
}
/** ±2^[lo, hi], built from exact doublings so the inputs do not depend on libm either. */
const magnitudes = (r: () => number, lo: number, hi: number) => (): number => {
  const e = Math.floor(lo + (hi - lo) * r());
  let v = (r() < 0.5 ? -1 : 1) * (1 + r());
  for (let i = 0; i < Math.abs(e); i++) v *= e < 0 ? 0.5 : 2;
  return v;
};

type Fn = (x: number) => number;
const worst = (mine: Fn, ref: Fn, gen: () => number, n = 20000): number => {
  let max = 0;
  for (let i = 0; i < n; i++) {
    const x = gen();
    max = Math.max(max, ulps(mine(x), ref(x)));
  }
  return max;
};

it('log10, expm1 and log1p stay within 2 ulp of Math.*', () => {
  const r = inputs(17);
  const positive = (): number => Math.abs(magnitudes(r, -1074, 1023)());
  expect(worst((x) => x + 1, Math.log10, positive)).toBeGreaterThan(2); // the measure can fail
  expect(worst(dmath.log10, Math.log10, positive)).toBeLessThanOrEqual(2);
  expect(worst(dmath.log10, Math.log10, () => 0.5 + 1.5 * r())).toBeLessThanOrEqual(2);
  expect(worst(dmath.expm1, Math.expm1, magnitudes(r, -60, 9))).toBeLessThanOrEqual(2);
  expect(worst(dmath.expm1, Math.expm1, () => -40 + 750 * r())).toBeLessThanOrEqual(2);
  expect(worst(dmath.expm1, Math.expm1, () => -2 + 4 * r())).toBeLessThanOrEqual(2);
  expect(worst(dmath.log1p, Math.log1p, positive)).toBeLessThanOrEqual(2);
  expect(worst(dmath.log1p, Math.log1p, () => -1 + 2 * r())).toBeLessThanOrEqual(2);
  expect(
    worst(dmath.log1p, Math.log1p, () => -Math.abs(magnitudes(r, -60, -1)())),
  ).toBeLessThanOrEqual(2);
});

it('sinh, cosh and tanh stay within 3 ulp of Math.*', () => {
  const r = inputs(19);
  const wide = magnitudes(r, -40, 9);
  const all = (): number => -711 + 1422 * r();
  const near = (): number => -3 + 6 * r();
  for (const gen of [wide, all, near]) {
    expect(worst(dmath.sinh, Math.sinh, gen)).toBeLessThanOrEqual(3);
    expect(worst(dmath.cosh, Math.cosh, gen)).toBeLessThanOrEqual(3);
    expect(worst(dmath.tanh, Math.tanh, gen)).toBeLessThanOrEqual(3);
  }
});

it('exact values: powers of ten, zeros keep their sign, limits and NaN propagate', () => {
  for (let n = -22; n <= 22; n++) expect(dmath.log10(Number(`1e${n}`))).toBe(n);
  const special = [0, -0, NaN, Infinity, -Infinity, 1, -1, 5e-324, -1e-320, 1e-20, -1e-20, 22, -22];
  const more = [0.5, -0.5, 709.9, 710.47, 710.48, -710.48, 800, -800, 38.9, -38.9, 1e308, 2 ** 54];
  const pairs: readonly [Fn, Fn][] = [
    [dmath.log10, Math.log10],
    [dmath.expm1, Math.expm1],
    [dmath.log1p, Math.log1p],
    [dmath.sinh, Math.sinh],
    [dmath.cosh, Math.cosh],
    [dmath.tanh, Math.tanh],
  ];
  for (const [fn, refFn] of pairs)
    for (const x of [...special, ...more]) {
      const mine = fn(x);
      const ref = refFn(x);
      if (!Number.isFinite(ref) || ref === 0)
        expect([refFn.name, x, mine]).toEqual([refFn.name, x, ref]);
      else expect(ulps(mine, ref)).toBeLessThanOrEqual(3);
    }
  expect(dmath.tanh(30)).toBe(1);
  expect(dmath.cosh(0)).toBe(1);
});

it('hypot takes up to four components; norm sums a vector of any size in order', () => {
  expect(dmath.hypot(1, 2, 2, 4)).toBe(5);
  expect(dmath.hypot(0.1, 0.2, 0.3)).toBe(dmath.hypot(0.1, 0.2, 0.3, 0));
  expect(dmath.norm([0.1, 0.2, 0.3])).toBe(dmath.hypot(0.1, 0.2, 0.3));
  expect(dmath.norm(new Float32Array([3, 4]))).toBe(5);
  expect(dmath.norm([1, 1, 1, 1, 1, 1, 1, 1, 1])).toBe(3);
  expect(dmath.norm([])).toBe(0);
});
