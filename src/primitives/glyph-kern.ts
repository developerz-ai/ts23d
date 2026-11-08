// Optical kerning for the vector fonts, measured from the glyphs rather than a pair table: each
// glyph's ink is sampled into 1-unit horizontal bands (leftmost and rightmost ink per band, one
// band of slack up and down so diagonals don't touch). A pair's white space is its mean gap over
// the bands both glyphs share; a pair looser than the font's 'n'+'n' closes half the excess
// (To, LT, AT, Ty, P.), but never so far that its narrowest gap drops under 70 % of n+n's.
// Profiles and pair results are memoised per font.

import { glyph, type VectorFont } from './glyph-hershey.ts';

const BANDS = 48;
/** Band index of y = 0: bands cover y ∈ [−16, 32) font units. */
const ZERO = 16;
const CLOSE = 0.5;
const FLOOR = 0.7;

interface Profile {
  readonly lo: Float64Array;
  readonly hi: Float64Array;
}

const profiles = new Map<string, Profile>();
const pairs = new Map<string, number>();

function band(y: number): number {
  return Math.min(BANDS - 1, Math.max(0, Math.floor(y) + ZERO));
}

function profile(font: VectorFont, ch: string): Profile {
  const key = `${font}:${ch}`;
  const hit = profiles.get(key);
  if (hit) return hit;
  const lo = new Float64Array(BANDS).fill(Number.POSITIVE_INFINITY);
  const hi = new Float64Array(BANDS).fill(Number.NEGATIVE_INFINITY);
  const mark = (x: number, y: number): void => {
    const b = band(y);
    for (let k = Math.max(0, b - 1); k <= Math.min(BANDS - 1, b + 1); k++) {
      if (x < (lo[k] ?? 0)) lo[k] = x;
      if (x > (hi[k] ?? 0)) hi[k] = x;
    }
  };
  for (const s of glyph(font, ch).strokes)
    for (let i = 0; i + 3 < s.length; i += 2) {
      const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = [s[i], s[i + 1], s[i + 2], s[i + 3]];
      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 4));
      for (let t = 0; t <= steps; t++)
        mark(x0 + ((x1 - x0) * t) / steps, y0 + ((y1 - y0) * t) / steps);
    }
  const p = { lo, hi };
  profiles.set(key, p);
  return p;
}

/** Narrowest and mean gap (font units) between `a`'s ink and `b`'s over the bands both ink,
 *  b's box following a's; null if they share no band. */
function gaps(font: VectorFont, a: string, b: string): { min: number; mean: number } | null {
  const pa = profile(font, a);
  const pb = profile(font, b);
  const adv = glyph(font, a).advance;
  let min = Number.POSITIVE_INFINITY;
  let sum = 0;
  let n = 0;
  for (let k = 0; k < BANDS; k++) {
    const r = pa.hi[k] ?? Number.NEGATIVE_INFINITY;
    const l = pb.lo[k] ?? Number.POSITIVE_INFINITY;
    if (r === Number.NEGATIVE_INFINITY || l === Number.POSITIVE_INFINITY) continue;
    const g = adv - r + l;
    min = Math.min(min, g);
    sum += g;
    n++;
  }
  return n > 0 ? { min, mean: sum / n } : null;
}

/** Advance adjustment (≤ 0, font units) between `a` and the following `b`. */
export function kern(font: VectorFont, a: string, b: string): number {
  const key = `${font}:${a}${b}`;
  const hit = pairs.get(key);
  if (hit !== undefined) return hit;
  const ref = gaps(font, 'n', 'n');
  const g = gaps(font, a, b);
  const k =
    ref && g ? -Math.max(0, Math.min(CLOSE * (g.mean - ref.mean), g.min - FLOOR * ref.min)) : 0;
  pairs.set(key, k);
  return k;
}
