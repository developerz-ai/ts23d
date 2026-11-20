// Edge-avoiding à-trous wavelet denoise of the path-traced layers, variance guided (Dammertz et
// al. 2010; Schied et al. 2017, SVGF). The asset's radiance is divided by its albedo (texture stays
// out of the filter), filtered with a 5 × 5 B3-spline kernel whose holes double each pass, then
// multiplied back. Two pixels mix when their normals and albedo agree and their lighting differs
// by no more than the noise the film measured there: the luminance stop is scaled by the pixel's
// own standard deviation (its variance pre-blurred 3 × 3, then carried through each pass), so
// shadow gaps between hair cards, groove occlusion and normal-map shading that stand above the
// noise survive, while flat noisy regions still flatten (D470, D471). The floor's shadow ratio is
// smooth by nature: its own pass set, with a gentle absolute tolerance (a hard luminance stop
// leaves dark rims along the penumbra). Deterministic: + − × ÷, Math.sqrt and dmath.exp only.

import { dmath } from '../../core/index.ts';

const H = [1 / 16, 1 / 4, 3 / 8, 1 / 4, 1 / 16];
const EPS = 0.02;
/** 3 × 3 binomial blur of the variance: one pixel's 16-sample estimate is itself noisy. */
const G3 = [1 / 4, 1 / 2, 1 / 4];

export interface DenoiseInput {
  readonly width: number;
  readonly height: number;
  /** Linear RGB, 3 floats per pixel. */
  readonly color: Float32Array;
  /** Albedo guide, 3 per pixel (0 where the asset is absent). */
  readonly albedo: Float32Array;
  /** Mean normal guide, 3 per pixel (0 where the asset is absent; shorter on mixed pixels). */
  readonly normal: Float32Array;
  /** Variance of each pixel's mean luminance (Film.variance), 1 per pixel. */
  readonly variance: Float32Array;
}

export interface DenoiseOptions {
  /** Passes (hole sizes 1, 2, 4, …). Default 5. */
  readonly passes?: number;
  /** Lighting differences of this many noise standard deviations mix with weight e⁻¹. Default 2.5. */
  readonly sigma?: number;
}

const lumAt = (c: Float32Array, p: number): number =>
  0.2126 * (c[p] ?? 0) + 0.7152 * (c[p + 1] ?? 0) + 0.0722 * (c[p + 2] ?? 0);

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

/** The lighting layer (radiance ÷ albedo) and its luminance variance, in the same units. */
function demodulate(i: DenoiseInput): { light: Float32Array; vari: Float32Array } {
  const n = i.width * i.height;
  const A = i.albedo;
  const light = new Float32Array(n * 3);
  const vari = new Float32Array(n);
  for (let q = 0; q < n; q++) {
    const p = q * 3;
    for (let k = 0; k < 3; k++) light[p + k] = (i.color[p + k] ?? 0) / ((A[p + k] ?? 0) + EPS);
    // Radiance variance → lighting variance: × (lighting / radiance)², or ÷ albedo² when black.
    const lc = lumAt(i.color, p);
    const s = lc > 1e-9 ? lumAt(light, p) / lc : 1 / (lumAt(A, p) + EPS);
    vari[q] = (i.variance[q] ?? 0) * s * s;
  }
  return { light, vari };
}

/** Variance blurred 3 × 3 over surface pixels (the centre's estimate steadied by its neighbours). */
function blurVariance(v: Float32Array, N: Float32Array, W: number, Hh: number): Float32Array {
  const out = new Float32Array(v.length);
  for (let y = 0; y < Hh; y++)
    for (let x = 0; x < W; x++) {
      let s = 0;
      let ws = 0;
      for (let j = -1; j <= 1; j++) {
        const yy = y + j;
        if (yy < 0 || yy >= Hh) continue;
        for (let k = -1; k <= 1; k++) {
          const xx = x + k;
          if (xx < 0 || xx >= W) continue;
          const q = yy * W + xx;
          if ((N[q * 3] ?? 0) === 0 && (N[q * 3 + 1] ?? 0) === 0 && (N[q * 3 + 2] ?? 0) === 0)
            continue;
          const w = (G3[j + 1] ?? 0) * (G3[k + 1] ?? 0);
          s += (v[q] ?? 0) * w;
          ws += w;
        }
      }
      out[y * W + x] = ws > 0 ? s / ws : (v[y * W + x] ?? 0);
    }
  return out;
}

export function denoise(i: DenoiseInput, o: DenoiseOptions = {}): Float32Array {
  const { width: W, height: Hh, albedo: A } = i;
  const N = unitNormals(i.normal);
  const n = W * Hh;
  const start = demodulate(i);
  let cur: Float32Array = start.light;
  let vcur: Float32Array = start.vari;
  let next: Float32Array = new Float32Array(n * 3);
  let vnext: Float32Array = new Float32Array(n);
  const lum = new Float32Array(n);
  const sigma = o.sigma ?? 2.5;
  for (let pass = 0; pass < (o.passes ?? 5); pass++) {
    const step = 1 << pass;
    for (let q = 0; q < n; q++) lum[q] = lumAt(cur, q * 3);
    const vblur = blurVariance(vcur, N, W, Hh);
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
          vnext[pi] = vcur[pi] ?? 0;
          continue;
        }
        const lp = lum[pi] ?? 0;
        // Tolerance: `sigma` noise deviations, plus 1 % of the level (a converged pixel still
        // carries float and tone-curve grain).
        const tol = sigma * Math.sqrt(vblur[pi] ?? 0) + 0.01 * lp + 1e-6;
        let r = 0;
        let g = 0;
        let b = 0;
        let sum = 0;
        let vsum = 0;
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
            wn *= wn;
            wn *= wn;
            const da0 = (A[p] ?? 0) - (A[q] ?? 0);
            const da1 = (A[p + 1] ?? 0) - (A[q + 1] ?? 0);
            const da2 = (A[p + 2] ?? 0) - (A[q + 2] ?? 0);
            const dl = Math.abs(lp - (lum[qi] ?? 0)) / tol;
            const w =
              (H[j + 2] ?? 0) *
              (H[k + 2] ?? 0) *
              wn *
              dmath.exp(-(da0 * da0 + da1 * da1 + da2 * da2) / 0.004 - dl * dl);
            r += (cur[q] ?? 0) * w;
            g += (cur[q + 1] ?? 0) * w;
            b += (cur[q + 2] ?? 0) * w;
            sum += w;
            vsum += w * w * (vcur[qi] ?? 0);
          }
        }
        next[p] = r / sum;
        next[p + 1] = g / sum;
        next[p + 2] = b / sum;
        vnext[pi] = vsum / (sum * sum);
      }
    [cur, next] = [next, cur];
    [vcur, vnext] = [vnext, vcur];
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
