// Low-discrepancy samples for the path tracer: 4-D Sobol with hash-based Owen scrambling and index
// shuffling (Burley 2020, "Practical Hash-based Owen Scrambling"), seeded per pixel from its index
// and per bounce from the dimension group. Pure 32-bit integer maths (Math.imul): the same pixel,
// sample and dimension give the same number on every machine. No Math.random anywhere.

const BITS = 32;

/** Direction numbers of Sobol dimensions 0..3 (Joe–Kuo: s, a, m for dims 2..4; dim 1 is radical inverse). */
const PRIMITIVES: readonly (readonly [number, number, readonly number[]])[] = [
  [1, 0, [1]],
  [2, 1, [1, 3]],
  [3, 1, [1, 3, 1]],
];

function directions(): Uint32Array[] {
  const out = [new Uint32Array(BITS).map((_, i) => (0x80000000 >>> i) >>> 0)];
  for (const [s, a, m] of PRIMITIVES) {
    const v = new Uint32Array(BITS);
    for (let i = 0; i < BITS; i++) {
      if (i < s) {
        v[i] = ((m[i] ?? 1) << (31 - i)) >>> 0;
        continue;
      }
      let x = ((v[i - s] ?? 0) ^ ((v[i - s] ?? 0) >>> s)) >>> 0;
      for (let k = 1; k < s; k++) if ((a >>> (s - 1 - k)) & 1) x = (x ^ (v[i - k] ?? 0)) >>> 0;
      v[i] = x;
    }
    out.push(v);
  }
  return out;
}

const DIR = directions();

/** Unscrambled Sobol value (32-bit fixed point) of `index` in dimension 0..3. */
export function sobol(index: number, dim: number): number {
  const v = DIR[dim] ?? DIR[0];
  let x = 0;
  let i = index >>> 0;
  for (let b = 0; i !== 0; b++, i >>>= 1) if (i & 1) x ^= v?.[b] ?? 0;
  return x >>> 0;
}

function reverse(x: number): number {
  let v = x >>> 0;
  v = ((v >>> 1) & 0x55555555) | ((v & 0x55555555) << 1);
  v = ((v >>> 2) & 0x33333333) | ((v & 0x33333333) << 2);
  v = ((v >>> 4) & 0x0f0f0f0f) | ((v & 0x0f0f0f0f) << 4);
  v = ((v >>> 8) & 0x00ff00ff) | ((v & 0x00ff00ff) << 8);
  return ((v >>> 16) | (v << 16)) >>> 0;
}

/** Laine–Karras style permutation: each bit flips depending only on the bits below it. */
function lk(x: number, seed: number): number {
  let v = (x + seed) >>> 0;
  v = (v ^ Math.imul(v, 0x6c50b47c)) >>> 0;
  v = (v ^ Math.imul(v, 0xb82f1e52)) >>> 0;
  v = (v ^ Math.imul(v, 0xc7afe638)) >>> 0;
  v = (v ^ Math.imul(v, 0x8d22f6e6)) >>> 0;
  return v;
}

/** Nested uniform (Owen) scramble of a 32-bit fixed-point value. */
export const owen = (x: number, seed: number): number => reverse(lk(reverse(x), seed));

/** 32-bit integer hash (lowbias32): decorrelates pixel and dimension seeds. */
export function hash(x: number): number {
  let v = x >>> 0;
  v = Math.imul(v ^ (v >>> 16), 0x7feb352d) >>> 0;
  v = Math.imul(v ^ (v >>> 15), 0x846ca68b) >>> 0;
  return (v ^ (v >>> 16)) >>> 0;
}

export const hashPair = (a: number, b: number): number =>
  hash((a ^ Math.imul(hash(b), 0x9e3779b9)) >>> 0);

const INV = 1 / 4294967296;

/**
 * Four scrambled Sobol coordinates in [0, 1) for sample `index` of pixel seed `seed`, dimension
 * group `group` (camera = 0, then a few groups per bounce). Written into out[0..3].
 */
export function sample4(seed: number, group: number, index: number, out: Float64Array): void {
  const s = hashPair(seed, group);
  const i = owen(index >>> 0, s);
  for (let d = 0; d < 4; d++) out[d] = owen(sobol(i, d), hashPair(s, d + 1)) * INV;
}

/** The seed of pixel (x, y) in an image `width` wide (plus a render-wide salt). */
export const pixelSeed = (x: number, y: number, width: number, salt = 0): number =>
  hashPair(y * width + x, salt);
