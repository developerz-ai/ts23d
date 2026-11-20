// Bit access for the deterministic maths (dmath): the two 32-bit words of a double and exact
// scaling by a power of two. Only typed-array reads and IEEE-754 multiplications, so every CPU,
// libm and engine gives the same result.

const VIEW = new DataView(new ArrayBuffer(8));

/** The high 32 bits of `x` (sign, exponent, top 20 mantissa bits) as a signed integer. */
export function hiWord(x: number): number {
  VIEW.setFloat64(0, x);
  return VIEW.getInt32(0);
}

/** `x` with its high word replaced by `hi`. */
export function withHiWord(x: number, hi: number): number {
  VIEW.setFloat64(0, x);
  VIEW.setInt32(0, hi);
  return VIEW.getFloat64(0);
}

/** `x` with its low 32 mantissa bits cleared: a 21-bit head whose products stay exact. */
export function zeroLow(x: number): number {
  VIEW.setFloat64(0, x);
  VIEW.setUint32(4, 0);
  return VIEW.getFloat64(0);
}

/** The double with high word `hi` and a zero low word. */
export function fromHiWord(hi: number): number {
  VIEW.setInt32(0, hi);
  VIEW.setUint32(4, 0);
  return VIEW.getFloat64(0);
}

const MIN_EXP = -1074;
/** 2^k for k in -1074..1023, built by exact halvings and doublings. */
const POW2 = ((): Float64Array => {
  const t = new Float64Array(1023 - MIN_EXP + 1);
  let up = 1;
  for (let k = 0; k <= 1023; k++) {
    t[k - MIN_EXP] = up;
    up *= 2;
  }
  let down = 1;
  for (let k = 0; k >= MIN_EXP; k--) {
    t[k - MIN_EXP] = down;
    down *= 0.5;
  }
  return t;
})();

const TWO_1023 = POW2[1023 - MIN_EXP] ?? Infinity;

/**
 * `y * 2^k` for `y` near 1 and k in -1080..1030, rounded once (a subnormal result is not rounded
 * twice): what exp and pow need to put the exponent back.
 */
export function scalb(y: number, k: number): number {
  if (k > 1023) return y * TWO_1023 * (POW2[k - 1023 - MIN_EXP] ?? Infinity);
  if (k < MIN_EXP) return y * 0.015625 * (POW2[k + 6 - MIN_EXP] ?? 0);
  return y * (POW2[k - MIN_EXP] ?? 0);
}
