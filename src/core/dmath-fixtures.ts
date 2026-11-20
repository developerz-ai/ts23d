// Test fixtures for dmath's tests: a distance in ulps, the tests' own seeded inputs (the same on
// every machine, built without libm) and the worst ulp error over a run. Not exported publicly.

const F = new Float64Array(1);
const U = new BigInt64Array(F.buffer);

/** Doubles as integers in value order, so a difference is a distance in ulps. */
const ordinal = (x: number): bigint => {
  F[0] = x;
  const b = U[0] ?? 0n;
  return b < 0n ? -(b & 0x7fffffffffffffffn) : b;
};

/** Distance between two doubles in ulps (0 for two NaNs, Infinity for one). */
export const ulps = (a: number, b: number): number => {
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.isNaN(a) && Number.isNaN(b) ? 0 : Infinity;
  const d = ordinal(a) - ordinal(b);
  return Number(d < 0n ? -d : d);
};

/** xorshift32: the test's own inputs, the same on every machine. */
export function inputs(seed: number): () => number {
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
export const magnitudes = (r: () => number, lo: number, hi: number) => (): number => {
  const e = Math.floor(lo + (hi - lo) * r());
  let v = (r() < 0.5 ? -1 : 1) * (1 + r());
  for (let i = 0; i < Math.abs(e); i++) v *= e < 0 ? 0.5 : 2;
  return v;
};

export type Fn = (x: number) => number;

/** The largest ulp distance between `mine` and `ref` over `n` inputs from `gen`. */
export const worst = (mine: Fn, ref: Fn, gen: () => number, n = 20000): number => {
  let max = 0;
  for (let i = 0; i < n; i++) {
    const x = gen();
    max = Math.max(max, ulps(mine(x), ref(x)));
  }
  return max;
};
