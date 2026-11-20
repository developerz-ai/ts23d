// Edge-avoiding à-trous wavelet denoise (Dammertz et al. 2010) of the path-traced layers. The
// asset's radiance is divided by its albedo (texture stays out of the filter), filtered with a
// 5 × 5 B3-spline kernel whose holes double each pass, weighted by how alike two pixels' albedo,
// normal and relative brightness are, then multiplied back. The floor's shadow ratio is smooth by
// nature: its own pass set, with a gentle absolute tolerance (a hard luminance stop leaves dark
// rims along the penumbra). Deterministic.

import { dmath } from '../../core/index.ts';

const H = [1 / 16, 1 / 4, 3 / 8, 1 / 4, 1 / 16];
const EPS = 0.02;

export interface DenoiseInput {
  readonly width: number;
  readonly height: number;
  /** Linear RGB, 3 floats per pixel. */
  readonly color: Float32Array;
  /** Albedo guide, 3 per pixel (0 where the asset is absent). */
  readonly albedo: Float32Array;
  /** Mean normal guide, 3 per pixel (0 where the asset is absent; shorter on mixed pixels). */
  readonly normal: Float32Array;
}

export interface DenoiseOptions {
  /** Passes (hole sizes 1, 2, 4, …). Default 5. */
  readonly passes?: number;
  /** Relative brightness tolerance of the first pass; halves each pass. Default 1.2. */
  readonly sigma?: number;
}

/** Unit normals and their lengths (0 = no surface: never mixed with anything). */
function unitNormals(n: Float32Array): Float32Array {
  const out = new Float32Array(n.length);
  for (let p = 0; p < n.length; p += 3) {
    const l = dmath.hypot(n[p] ?? 0, n[p + 1] ?? 0, n[p + 2] ?? 0);
    if (l < 1e-6) continue;
    out[p] = (n[p] ?? 0) / l;
    out[p + 1] = (n[p + 1] ?? 0) / l;
    out[p + 2] = (n[p + 2] ?? 0) / l;
  }
  return out;
}

export function denoise(i: DenoiseInput, o: DenoiseOptions = {}): Float32Array {
  const { width: W, height: Hh, albedo: A } = i;
  const N = unitNormals(i.normal);
  const n = W * Hh;
  let cur = new Float32Array(n * 3);
  for (let p = 0; p < n * 3; p++) cur[p] = (i.color[p] ?? 0) / ((A[p] ?? 0) + EPS);
  let next = new Float32Array(n * 3);
  const lum = new Float32Array(n);
  let sigma = o.sigma ?? 1.2;
  for (let pass = 0; pass < (o.passes ?? 5); pass++) {
    const step = 1 << pass;
    for (let q = 0; q < n; q++)
      lum[q] =
        0.2126 * (cur[q * 3] ?? 0) +
        0.7152 * (cur[q * 3 + 1] ?? 0) +
        0.0722 * (cur[q * 3 + 2] ?? 0);
    for (let y = 0; y < Hh; y++)
      for (let x = 0; x < W; x++) {
        const pi = y * W + x;
        const p = pi * 3;
        const nx = N[p] ?? 0;
        const ny = N[p + 1] ?? 0;
        const nz = N[p + 2] ?? 0;
        if (nx === 0 && ny === 0 && nz === 0) {
          next[p] = cur[p] ?? 0;
          next[p + 1] = cur[p + 1] ?? 0;
          next[p + 2] = cur[p + 2] ?? 0;
          continue;
        }
        const lp = lum[pi] ?? 0;
        let r = 0;
        let g = 0;
        let b = 0;
        let sum = 0;
        for (let j = -2; j <= 2; j++) {
          const yy = y + j * step;
          if (yy < 0 || yy >= Hh) continue;
          for (let k = -2; k <= 2; k++) {
            const xx = x + k * step;
            if (xx < 0 || xx >= W) continue;
            const qi = yy * W + xx;
            const q = qi * 3;
            const nd = nx * (N[q] ?? 0) + ny * (N[q + 1] ?? 0) + nz * (N[q + 2] ?? 0);
            if (nd <= 0) continue;
            let wn = nd * nd;
            wn *= wn;
            wn *= wn;
            wn *= wn;
            wn *= wn;
            const da0 = (A[p] ?? 0) - (A[q] ?? 0);
            const da1 = (A[p + 1] ?? 0) - (A[q + 1] ?? 0);
            const da2 = (A[p + 2] ?? 0) - (A[q + 2] ?? 0);
            const lq = lum[qi] ?? 0;
            const rel = Math.abs(lp - lq) / (sigma * (0.5 * (lp + lq)) + 0.02);
            const w =
              (H[j + 2] ?? 0) *
              (H[k + 2] ?? 0) *
              wn *
              dmath.exp(-(da0 * da0 + da1 * da1 + da2 * da2) / 0.004 - rel * rel);
            r += (cur[q] ?? 0) * w;
            g += (cur[q + 1] ?? 0) * w;
            b += (cur[q + 2] ?? 0) * w;
            sum += w;
          }
        }
        next[p] = r / sum;
        next[p + 1] = g / sum;
        next[p + 2] = b / sum;
      }
    [cur, next] = [next, cur];
    sigma *= 0.5;
  }
  for (let p = 0; p < n * 3; p++) cur[p] = (cur[p] ?? 0) * ((A[p] ?? 0) + EPS);
  return cur;
}

/**
 * Smooth the floor's shadow ratio over the pixels that saw the floor (`seen` > 0), with an
 * absolute tolerance `tol` that halves each pass. Pixels that never saw it keep 1.
 */
export function denoiseShadow(
  width: number,
  height: number,
  ratio: Float32Array,
  seen: Float32Array,
  passes = 4,
  tol = 0.35,
): Float32Array {
  let cur = Float32Array.from(ratio);
  let next = new Float32Array(cur.length);
  let t = tol;
  for (let pass = 0; pass < passes; pass++) {
    const step = 1 << pass;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const p = y * width + x;
        const sp = seen[p] ?? 0;
        const vp = cur[p] ?? 1;
        if (sp <= 0) {
          next[p] = vp;
          continue;
        }
        let s = 0;
        let ws = 0;
        for (let j = -2; j <= 2; j++) {
          const yy = y + j * step;
          if (yy < 0 || yy >= height) continue;
          for (let k = -2; k <= 2; k++) {
            const xx = x + k * step;
            if (xx < 0 || xx >= width) continue;
            const q = yy * width + xx;
            const sq = seen[q] ?? 0;
            if (sq <= 0) continue;
            const d = ((cur[q] ?? 1) - vp) / t;
            const w = (H[j + 2] ?? 0) * (H[k + 2] ?? 0) * sq * dmath.exp(-d * d);
            s += (cur[q] ?? 1) * w;
            ws += w;
          }
        }
        next[p] = s / ws;
      }
    [cur, next] = [next, cur];
    t *= 0.5;
  }
  return cur;
}
