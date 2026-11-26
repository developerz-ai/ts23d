// The power of every harmonic of a periodic signal, for the swim gate's tail-beat search. Harmonics
// are spaced 1/T and samples grow with T, so testing them one by one is quadratic in clip length
// however narrow the frequency band. Bluestein's chirp transform gives the exact DFT at any length
// (the samples stay on the clip's keys) through power-of-two FFTs, in O(n log n).

/** In-place radix-2 FFT; `re.length` must be a power of two. `sign` −1 forward, +1 inverse. */
import { dmath } from '../core/index.ts';

function fft(re: Float64Array, im: Float64Array, sign: 1 | -1): void {
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
  // One twiddle per stage serves every block. The angle is still `step * k` with the stage's own
  // `step`, so `dmath` receives the same arguments and the output stays bit-identical.
  const twiddleCos = new Float64Array(n / 2);
  const twiddleSin = new Float64Array(n / 2);
  for (let size = 2; size <= n; size *= 2) {
    const half = size / 2;
    const step = (sign * 2 * Math.PI) / size;
    for (let k = 0; k < half; k++) {
      twiddleCos[k] = dmath.cos(step * k);
      twiddleSin[k] = dmath.sin(step * k);
    }
    for (let start = 0; start < n; start += size)
      for (let k = 0; k < half; k++) {
        const c = twiddleCos[k] ?? 0;
        const s = twiddleSin[k] ?? 0;
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
  fft(are, aim, -1);
  fft(bre, bim, -1);
  for (let i = 0; i < size; i++) {
    const r = (are[i] ?? 0) * (bre[i] ?? 0) - (aim[i] ?? 0) * (bim[i] ?? 0);
    aim[i] = (are[i] ?? 0) * (bim[i] ?? 0) + (aim[i] ?? 0) * (bre[i] ?? 0);
    are[i] = r;
  }
  fft(are, aim, 1);
  // The chirp has unit size, so the power needs only the convolution's own magnitude.
  const scale = 2 / (n * size);
  for (let m = 0; m < out.length; m++)
    out[m] = dmath.pow((are[m] ?? 0) * scale, 2) + dmath.pow((aim[m] ?? 0) * scale, 2);
  return out;
}
