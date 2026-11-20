// Reference fingerprint: the derived numbers a photo (or a render) is reduced to, so "looks like
// the real thing" is a distance, not an opinion. The object is cropped to its bounding box and fitted
// (aspect kept, centred) into 128², then: the mask, a 16-bin histogram each of Lab L, a and b, the
// share of luminance power in 8 radial FFT bands (detail frequency), and Sobel edge density on an
// 8×8 grid of the interior. Framing-agnostic, deterministic, zero dependencies.

import { dmath, Ts23dError } from '../core/index.ts';
import { edges, FP_SIZE, GRID, spectrum } from './ref-features.ts';

export { FP_SIZE } from './ref-features.ts';

const BINS = 16;

export interface Fingerprint {
  /** 1 = object, 128 × 128, row 0 = top. */
  readonly mask128: Uint8Array;
  /** Histograms of L (0–100), a and b (−64…64), 16 bins each, each summing to 1 (or all 0). */
  readonly lab: number[];
  /** Share of zero-mean luminance power per radial band, low → high (sums to 1, or all 0). */
  readonly spectrum: number[];
  /** Edge pixels ÷ interior pixels per cell of an 8 × 8 grid, row-major, 0–1. */
  readonly edges: number[];
}

export interface FingerprintDistance {
  /** Silhouette intersection over union, 0–1 (higher = closer). */
  readonly iou: number;
  /** Earth mover's distance of the L (value) histograms, 0–1. */
  readonly valueEmd: number;
  /** Half the L1 distance of the spectrum shares, 0–1. */
  readonly spectrumGap: number;
  /** Mean absolute difference of the edge-density grids, 0–1. */
  readonly edgeGap: number;
}

const lin = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : dmath.pow((v + 0.055) / 1.055, 2.4);
};
const labF = (t: number): number =>
  t > 216 / 24389 ? dmath.cbrt(t) : (24389 / 27 / 116) * t + 4 / 29;

/** sRGB 8-bit → CIE Lab (D65). */
export function srgbToLab(r: number, g: number, b: number): [number, number, number] {
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const x = labF((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const y = labF(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const z = labF((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** Crop to the object and box-filter into N² coverage + Lab per pixel. */
function fitted(img: Uint8Array, w: number, h: number, rgba: boolean) {
  const N = FP_SIZE;
  const on = (i: number): boolean => (rgba ? (img[i * 4 + 3] ?? 0) >= 128 : (img[i] ?? 0) > 0);
  let [x0, y0, x1, y1] = [w, h, -1, -1];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (on(y * w + x))
        [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  const mask = new Uint8Array(N * N);
  const lab = new Float64Array(N * N * 3);
  if (x1 < 0) return { mask, lab };
  const s = Math.max(x1 - x0 + 1, y1 - y0 + 1) / N;
  const ox = (N - (x1 - x0 + 1) / s) / 2;
  const oy = (N - (y1 - y0 + 1) / s) / 2;
  // Source pixels under output pixel `o` along one axis; null when it falls in the padding.
  const span = (o: number, lo: number, hi: number): [number, number] | null => {
    const [start, end] = [lo + o * s, lo + (o + 1) * s];
    if (end <= lo || start >= hi + 1) return null;
    const a = Math.max(lo, Math.floor(start));
    return [a, Math.min(hi, Math.max(a, Math.ceil(end) - 1))];
  };
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const sx = span(x - ox, x0, x1);
      const sy = span(y - oy, y0, y1);
      if (!sx || !sy) continue;
      const [sx0, sx1] = sx;
      const [sy0, sy1] = sy;
      let [n, hit, r, g, b] = [0, 0, 0, 0, 0];
      for (let sy = sy0; sy <= sy1; sy++)
        for (let sx = sx0; sx <= sx1; sx++) {
          const i = sy * w + sx;
          n++;
          if (!on(i)) continue;
          hit++;
          r += rgba ? (img[i * 4] ?? 0) : 128;
          g += rgba ? (img[i * 4 + 1] ?? 0) : 128;
          b += rgba ? (img[i * 4 + 2] ?? 0) : 128;
        }
      if (hit * 2 < n || hit === 0) continue;
      const o = y * N + x;
      mask[o] = 1;
      lab.set(srgbToLab(r / hit, g / hit, b / hit), o * 3);
    }
  return { mask, lab };
}

function histograms(mask: Uint8Array, lab: Float64Array): number[] {
  const out = new Array<number>(BINS * 3).fill(0);
  let n = 0;
  const bin = (v: number, lo: number, hi: number): number =>
    Math.min(BINS - 1, Math.max(0, Math.floor(((v - lo) / (hi - lo)) * BINS)));
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    n++;
    const k0 = bin(lab[i * 3] ?? 0, 0, 100);
    const k1 = BINS + bin(lab[i * 3 + 1] ?? 0, -64, 64);
    const k2 = 2 * BINS + bin(lab[i * 3 + 2] ?? 0, -64, 64);
    for (const k of [k0, k1, k2]) out[k] = (out[k] ?? 0) + 1;
  }
  return n ? out.map((v) => v / n) : out;
}

/**
 * Fingerprint an image: RGBA8 (`w·h·4` bytes; alpha ≥ 128 = object) or a mask (`w·h` bytes;
 * non-zero = object, colour taken as mid-grey). Segment photos first (alpha = object).
 */
export function fingerprint(img: Uint8Array, w: number, h: number): Fingerprint {
  const rgba = img.length === w * h * 4;
  if (
    !Number.isInteger(w) ||
    !Number.isInteger(h) ||
    w < 1 ||
    h < 1 ||
    (!rgba && img.length !== w * h)
  )
    throw new Ts23dError('T3D_RENDER_OPTIONS', {
      cause: `fingerprint: ${img.length} bytes is neither ${w}×${h} RGBA nor a ${w}×${h} mask`,
      fix: 'pass RGBA8 (alpha = object) or a one-byte-per-pixel mask with matching width and height',
    });
  const { mask, lab } = fitted(img, w, h, rgba);
  return {
    mask128: mask,
    lab: histograms(mask, lab),
    spectrum: spectrum(mask, lab),
    edges: edges(mask, lab),
  };
}

const mirrored = (f: Fingerprint): Fingerprint => {
  const N = FP_SIZE;
  const mask128 = f.mask128.map((_, i) => f.mask128[i - (i % N) + N - 1 - (i % N)] ?? 0);
  const edges = f.edges.map((_, c) => f.edges[c - (c % GRID) + GRID - 1 - (c % GRID)] ?? 0);
  return { ...f, mask128, edges };
};

function distance(a: Fingerprint, b: Fingerprint): FingerprintDistance {
  let [inter, union] = [0, 0];
  for (let i = 0; i < a.mask128.length; i++) {
    const [x, y] = [a.mask128[i] ?? 0, b.mask128[i] ?? 0];
    inter += x & y;
    union += x | y;
  }
  const mass = (f: Fingerprint): number => f.lab.slice(0, BINS).reduce((s, v) => s + v, 0);
  let [ca, cb, emd] = [0, 0, 0];
  for (let k = 0; k < BINS - 1; k++) {
    ca += a.lab[k] ?? 0;
    cb += b.lab[k] ?? 0;
    emd += Math.abs(ca - cb);
  }
  const empty = (mass(a) === 0 ? 1 : 0) + (mass(b) === 0 ? 1 : 0);
  const l1 = (p: readonly number[], q: readonly number[]): number =>
    p.reduce((s, v, k) => s + Math.abs(v - (q[k] ?? 0)), 0);
  return {
    iou: union === 0 ? 1 : inter / union,
    valueEmd: empty === 1 ? 1 : empty === 2 ? 0 : emd / (BINS - 1),
    spectrumGap: l1(a.spectrum, b.spectrum) / 2,
    edgeGap: l1(a.edges, b.edges) / (GRID * GRID),
  };
}

/**
 * Distances between two fingerprints. `mirror`: also try `b` flipped left↔right and keep the
 * orientation with the higher IoU (a side photo may face either way).
 */
export function compareFingerprints(
  a: Fingerprint,
  b: Fingerprint,
  o: { readonly mirror?: boolean } = {},
): FingerprintDistance {
  const d = distance(a, b);
  if (!o.mirror) return d;
  const m = distance(a, mirrored(b));
  return m.iou > d.iou ? m : d;
}
