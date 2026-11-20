// dmath gives the same bits everywhere: fingerprints of 20,000 results per function recorded once,
// plus monotonic sweeps and the documented behaviour of trig beyond its accurate range.

import { expect, it } from 'bun:test';
import * as dmath from './dmath.ts';
import { type Fn, inputs, magnitudes } from './dmath-fixtures.ts';

const F = new Float64Array(1);
const U32 = new Uint32Array(F.buffer);

it('is monotonic where the function is, step by step', () => {
  const rising: readonly [Fn, number, number][] = [
    [dmath.sin, -1.5, 1.5],
    [dmath.tan, -1.5, 1.5],
    [dmath.asin, -1, 1],
    [dmath.atan, -50, 50],
    [dmath.exp, -30, 30],
    [dmath.log, 1e-3, 50],
    [dmath.log2, 1e-3, 50],
    [dmath.cbrt, -50, 50],
    [dmath.log10, 1e-3, 50],
    [dmath.expm1, -30, 30],
    [dmath.log1p, -0.999, 50],
    [dmath.sinh, -30, 30],
    [dmath.tanh, -30, 30],
    [dmath.cosh, 0, 30],
    [(x) => -dmath.cos(x), 0, 3.1],
    [(x) => -dmath.acos(x), -1, 1],
    [(x) => dmath.pow(x, 2.4), 0, 4],
    [(x) => dmath.pow(x, 1 / 2.4), 0, 4],
  ];
  for (const [fn, lo, hi] of rising) {
    let last = fn(lo);
    for (let i = 1; i <= 20000; i++) {
      const v = fn(lo + ((hi - lo) * i) / 20000);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  }
});

it('beyond 2^20·π/2 trig folds the argument: lower accuracy, still a sine', () => {
  for (const x of [1647100, 3e6, -5e7, 1e9]) {
    expect(Math.abs(dmath.sin(x) - Math.sin(x))).toBeLessThan(1e-6);
    expect(Math.abs(dmath.cos(x) - Math.cos(x))).toBeLessThan(1e-6);
  }
  expect(Math.abs(dmath.sin(1e22))).toBeLessThanOrEqual(1);
});

/** FNV-1a over the bits of every result: one number for "the same bits". */
function fingerprint(fn: Fn, gen: () => number, n = 20000): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < n; i++) {
    F[0] = fn(gen());
    h = Math.imul(h ^ (U32[0] ?? 0), 0x01000193);
    h = Math.imul(h ^ (U32[1] ?? 0), 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// The point of the module. These fingerprints were recorded once; a CPU, libm or engine that
// computes one last bit differently fails here before it changes a committed render.
it('gives the same bits everywhere: fingerprints of 20,000 results per function', () => {
  const r = inputs(2026);
  const wide = magnitudes(r, -30, 20);
  const unit = (): number => r() * 2 - 1;
  const positive = (): number => Math.abs(magnitudes(r, -1074, 1023)());
  let y = 0;
  const pair = (): number => {
    y = (r() * 2 - 1) * 30;
    return Math.abs(wide());
  };
  const got = {
    sin: fingerprint(dmath.sin, wide),
    cos: fingerprint(dmath.cos, wide),
    tan: fingerprint(dmath.tan, wide),
    asin: fingerprint(dmath.asin, unit),
    acos: fingerprint(dmath.acos, unit),
    atan: fingerprint(dmath.atan, wide),
    atan2: fingerprint((x) => dmath.atan2(x, wide()), wide),
    exp: fingerprint(dmath.exp, () => -745 + r() * 1455),
    log: fingerprint(dmath.log, positive),
    log2: fingerprint(dmath.log2, positive),
    pow: fingerprint((x) => dmath.pow(x, y), pair),
    cbrt: fingerprint(dmath.cbrt, wide),
    hypot: fingerprint((x) => dmath.hypot(x, wide(), wide()), wide),
    log10: fingerprint(dmath.log10, positive),
    expm1: fingerprint(dmath.expm1, () => -745 + r() * 1455),
    log1p: fingerprint(dmath.log1p, () => Math.abs(wide()) - r()),
    sinh: fingerprint(dmath.sinh, () => (r() * 2 - 1) * 711),
    cosh: fingerprint(dmath.cosh, () => (r() * 2 - 1) * 711),
    tanh: fingerprint(dmath.tanh, () => (r() * 2 - 1) * 23),
    powWhole: fingerprint((x) => dmath.pow(x, Math.floor(y)), pair),
    norm: fingerprint((x) => dmath.norm([x, wide(), wide(), wide(), wide()]), wide),
  };
  expect(got).toEqual(GOLDEN);
  const nudged = fingerprint((x) => dmath.sin(x) * (1 + 2.220446049250313e-16), inputs(1));
  expect(fingerprint(dmath.sin, inputs(1))).not.toBe(nudged); // one ulp is seen
});

const GOLDEN = {
  sin: 'c4680a62',
  cos: 'e682a69c',
  tan: 'b8798d5a',
  asin: 'e131859c',
  acos: '0f048020',
  atan: 'c7fce7aa',
  atan2: '06d336cd',
  exp: '98490e72',
  log: '7e8c5cfb',
  log2: '7bb67b6f',
  pow: '3853457d',
  cbrt: '7db17fc8',
  hypot: '4f5d6e30',
  log10: 'b354ab6e',
  expm1: 'b6539310',
  log1p: '929c6883',
  sinh: '276b380c',
  cosh: 'c474f412',
  tanh: '46556389',
  powWhole: 'da1e41b0',
  norm: '380ec27c',
};
