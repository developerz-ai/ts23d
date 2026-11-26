// The power of every harmonic of a periodic signal, for the swim gate's tail-beat search. Harmonics
// are spaced 1/T and samples grow with T, so testing them one by one is quadratic in clip length
// however narrow the frequency band. Bluestein's chirp transform gives the exact DFT at any length
// (the samples stay on the clip's keys) through power-of-two FFTs, in O(n log n).

import { dmath } from '../core/index.ts';

/** One cosine/sine table per stage, indexed by stage from size 2 upwards. */
type Twiddles = { cos: Float64Array[]; sin: Float64Array[] };

/** Build each stage's twiddles once, in the butterfly's k order, for one transform sign. */
function twiddlesOf(size: number, sign: 1 | -1): Twiddles {
  const cos: Float64Array[] = [];
  const sin: Float64Array[] = [];
  for (let half = 1; half < size; half *= 2) {
    const step = (sign * 2 * Math.PI) / (2 * half);
    const stageCos = new Float64Array(half);
    const stageSin = new Float64Array(half);
    for (let k = 0; k < half; k++) {
      stageCos[k] = dmath.cos(step * k);
      stageSin[k] = dmath.sin(step * k);
    }
    cos.push(stageCos);
    sin.push(stageSin);
  }
  return { cos, sin };
}

function fft(re: Float64Array, im: Float64Array, twiddles: Twiddles): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j] ?? 0, re[i] ?? 0];
      [im[i], im[j]] = [im[j] ?? 0, im[i] ?? 0];
    }
  }
  let stage = 0;
  for (let size = 2; size <= n; size *= 2) {
    const half = size / 2;
    const stageCos = twiddles.cos[stage];
    const stageSin = twiddles.sin[stage];
    stage++;
    for (let start = 0; start < n; start += size)
      for (let k = 0; k < half; k++) {
        const c = stageCos?.[k] ?? 0;
        const s = stageSin?.[k] ?? 0;
        const a = start + k;
        const b = a + half;
        const x = (re[b] ?? 0) * c - (im[b] ?? 0) * s;
        const y = (re[b] ?? 0) * s + (im[b] ?? 0) * c;
        re[b] = (re[a] ?? 0) - x;
        im[b] = (im[a] ?? 0) - y;
        re[a] = (re[a] ?? 0) + x;
        im[a] = (im[a] ?? 0) + y;
      }
  }
}

/**
 * Power of harmonics 0..⌊n/2⌋ of `y` (n samples of one period), each scaled like an amplitude²:
 * a sine of amplitude A at harmonic m reads A² at index m.
 */
export function harmonicPowers(y: readonly number[]): Float64Array {
  const n = y.length;
  const out = new Float64Array(Math.floor(n / 2) + 1);
  if (n === 0) return out;
  let size = 1;
  while (size < 2 * n - 1) size *= 2;
  // The chirp exp(−iπk²/n); k² is reduced mod 2n so the angle stays exact for long signals.
  const cos = new Float64Array(n);
  const sin = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const a = (Math.PI * ((k * k) % (2 * n))) / n;
    cos[k] = dmath.cos(a);
    sin[k] = -dmath.sin(a);
  }
  const are = new Float64Array(size);
  const aim = new Float64Array(size);
  const bre = new Float64Array(size);
  const bim = new Float64Array(size);
  for (let k = 0; k < n; k++) {
    are[k] = (y[k] ?? 0) * (cos[k] ?? 0);
    aim[k] = (y[k] ?? 0) * (sin[k] ?? 0);
    const back = (size - k) % size;
    bre[k] = bre[back] = cos[k] ?? 0;
    bim[k] = bim[back] = -(sin[k] ?? 0);
  }
  // The two forward transforms and the inverse share one table per sign and stage.
  const forward = twiddlesOf(size, -1);
  const inverse = twiddlesOf(size, 1);
  fft(are, aim, forward);
  fft(bre, bim, forward);
  for (let i = 0; i < size; i++) {
    const r = (are[i] ?? 0) * (bre[i] ?? 0) - (aim[i] ?? 0) * (bim[i] ?? 0);
    aim[i] = (are[i] ?? 0) * (bim[i] ?? 0) + (aim[i] ?? 0) * (bre[i] ?? 0);
    are[i] = r;
  }
  fft(are, aim, inverse);
  // The chirp has unit size, so the power needs only the convolution's own magnitude.
  const scale = 2 / (n * size);
  for (let m = 0; m < out.length; m++)
    out[m] = dmath.pow((are[m] ?? 0) * scale, 2) + dmath.pow((aim[m] ?? 0) * scale, 2);
  return out;
}
