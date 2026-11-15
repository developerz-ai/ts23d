// Detail features of a fitted 128² fingerprint image: the share of zero-mean luminance power per
// radial FFT band (own radix-2 FFT, rows then columns) and Sobel edge density per cell of an 8 × 8
// grid over the interior (silhouette border excluded). Inputs: object mask + Lab per pixel.

export const FP_SIZE = 128;
export const GRID = 8;
/** Sobel magnitude (L / 100 units) above which an interior pixel counts as an edge (~5 L). */
const EDGE = 0.2;
/** Radial frequency band edges, cycles per 128 px (DC excluded). */
const BANDS = [1, 2, 4, 8, 16, 32, 48, 64, Infinity];

/** In-place radix-2 complex FFT of length-n rows (n a power of two). */
function fft(re: Float64Array, im: Float64Array): void {
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
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len)
      for (let k = 0; k < len / 2; k++) {
        const [wr, wi] = [Math.cos(ang * k), Math.sin(ang * k)];
        const a = i + k;
        const b = a + len / 2;
        const xr = (re[b] ?? 0) * wr - (im[b] ?? 0) * wi;
        const xi = (re[b] ?? 0) * wi + (im[b] ?? 0) * wr;
        re[b] = (re[a] ?? 0) - xr;
        im[b] = (im[a] ?? 0) - xi;
        re[a] = (re[a] ?? 0) + xr;
        im[a] = (im[a] ?? 0) + xi;
      }
  }
}

export function spectrum(mask: Uint8Array, lab: Float64Array): number[] {
  const N = FP_SIZE;
  let [sum, n] = [0, 0];
  for (let i = 0; i < mask.length; i++)
    if (mask[i]) [sum, n] = [sum + (lab[i * 3] ?? 0) / 100, n + 1];
  const out = new Array<number>(BANDS.length - 1).fill(0);
  if (!n) return out;
  const mean = sum / n;
  const re = new Float64Array(N * N);
  const im = new Float64Array(N * N);
  for (let i = 0; i < mask.length; i++) re[i] = mask[i] ? (lab[i * 3] ?? 0) / 100 - mean : 0;
  const row = (arr: Float64Array, o: number, step: number): Float64Array =>
    Float64Array.from({ length: N }, (_, k) => arr[o + k * step] ?? 0);
  for (const step of [1, N])
    for (let l = 0; l < N; l++) {
      const o = step === 1 ? l * N : l;
      const r = row(re, o, step);
      const m = row(im, o, step);
      fft(r, m);
      for (let k = 0; k < N; k++) [re[o + k * step], im[o + k * step]] = [r[k] ?? 0, m[k] ?? 0];
    }
  let total = 0;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const f = Math.hypot(x < N / 2 ? x : x - N, y < N / 2 ? y : y - N);
      if (f < 1) continue;
      const p = (re[y * N + x] ?? 0) ** 2 + (im[y * N + x] ?? 0) ** 2;
      const band = BANDS.findIndex((e, k) => f >= e && f < (BANDS[k + 1] ?? Infinity));
      out[band] = (out[band] ?? 0) + p;
      total += p;
    }
  return total > 1e-12 ? out.map((v) => v / total) : out.fill(0);
}

export function edges(mask: Uint8Array, lab: Float64Array): number[] {
  const N = FP_SIZE;
  const cell = N / GRID;
  const hits = new Array<number>(GRID * GRID).fill(0);
  const count = new Array<number>(GRID * GRID).fill(0);
  const L = (x: number, y: number): number => (lab[(y * N + x) * 3] ?? 0) / 100;
  for (let y = 1; y < N - 1; y++)
    for (let x = 1; x < N - 1; x++) {
      let inside = true;
      for (let j = -1; j <= 1 && inside; j++)
        for (let i = -1; i <= 1; i++) if (!mask[(y + j) * N + x + i]) inside = false;
      if (!inside) continue;
      const gx =
        L(x + 1, y - 1) +
        2 * L(x + 1, y) +
        L(x + 1, y + 1) -
        L(x - 1, y - 1) -
        2 * L(x - 1, y) -
        L(x - 1, y + 1);
      const gy =
        L(x - 1, y + 1) +
        2 * L(x, y + 1) +
        L(x + 1, y + 1) -
        L(x - 1, y - 1) -
        2 * L(x, y - 1) -
        L(x + 1, y - 1);
      const c = Math.floor(y / cell) * GRID + Math.floor(x / cell);
      count[c] = (count[c] ?? 0) + 1;
      if (Math.hypot(gx, gy) > EDGE) hits[c] = (hits[c] ?? 0) + 1;
    }
  return hits.map((h, c) => (count[c] ? h / (count[c] ?? 1) : 0));
}
