// The albedo each part is drawn with, for the critique's colour-detail metric (D457): the asset's
// trim sheet (sheetFor, the renderers' API; U repeats, V clamps) or a model-built part's own
// texture set (ADR 016; both clamp). Sampled bilinearly at full resolution, linear RGB, so the
// metric sees albedo × vertex colour as the beauty renderer shades it; edgeContrast is the
// contrast drawn along one mesh edge.

import type { CompiledAsset, Mesh, Part, TextureSet } from '../core/index.ts';
import { dmath } from '../core/index.ts';
import { DEFAULT_SHEET, decodePng, type PaintedSheet, sheetFor } from '../material/index.ts';

/** An RGBA8 sRGB image a part samples its albedo from. */
export interface Albedo {
  readonly width: number;
  readonly height: number;
  /** RGBA8, sRGB, top row first (row = v × height, as the renderers sample it). */
  readonly data: Uint8Array;
  /** Strips tile along U on the trim sheet; texture sets clamp. */
  readonly wrapU: boolean;
}

/** sRGB byte → linear. */
const LINEAR = Float64Array.from({ length: 256 }, (_, i) => {
  const v = i / 255;
  return v <= 0.04045 ? v / 12.92 : dmath.pow((v + 0.055) / 1.055, 2.4);
});

const sets = new WeakMap<TextureSet, Albedo>();

function setAlbedo(set: TextureSet): Albedo {
  const hit = sets.get(set);
  if (hit) return hit;
  const img = decodePng(set.albedo);
  const out: Albedo = { width: img.width, height: img.height, data: img.data, wrapU: false };
  sets.set(set, out);
  return out;
}

/**
 * Each part's albedo, in `parts` order (the same order metricVector reads meshes in). `sheet`
 * defaults to the asset's own sheet at 1024², the one the critique's vector render paints.
 */
export function partAlbedos(
  asset: CompiledAsset,
  parts: readonly Part[],
  sheet?: PaintedSheet,
): Albedo[] {
  let trim: Albedo | null = null;
  const sheetAlbedo = (): Albedo => {
    if (trim) return trim;
    const s = sheet ?? sheetFor(asset, { ...DEFAULT_SHEET, size: 1024 });
    trim = { width: s.size, height: s.size, data: s.albedo, wrapU: true };
    return trim;
  };
  return parts.map((p) => (p.textures ? setAlbedo(p.textures) : sheetAlbedo()));
}

/** Bilinear linear-RGB sample of `a` at (u, v) into out[0..2]. */
export function sampleAlbedo(a: Albedo, u: number, v: number, out: number[]): void {
  const { width: W, height: H, data } = a;
  const x = u * W - 0.5;
  const y = Math.min(H - 1, Math.max(0, v * H - 0.5));
  const xc = a.wrapU ? x : Math.min(W - 1, Math.max(0, x));
  const xf = Math.floor(xc);
  const yf = Math.floor(y);
  const fx = xc - xf;
  const fy = y - yf;
  const col = (c: number): number => (a.wrapU ? ((c % W) + W) % W : Math.min(W - 1, c));
  const [x0, x1] = [col(xf), col(xf + 1)];
  const [y0, y1] = [yf, Math.min(H - 1, yf + 1)];
  for (let k = 0; k < 3; k++) {
    const at = (cx: number, cy: number): number => LINEAR[data[(cy * W + cx) * 4 + k] ?? 255] ?? 1;
    // Lerps of lerps: equal texels give exactly that texel (a flat strip has zero contrast).
    const top = at(x0, y0) + (at(x1, y0) - at(x0, y0)) * fx;
    const bottom = at(x0, y1) + (at(x1, y1) - at(x0, y1)) * fx;
    out[k] = top + (bottom - top) * fy;
  }
}

/** Sample spans along an edge at most (one per texel it crosses). */
const EDGE_SAMPLES = 32;
/** 1 ÷ golden ratio: offsets i × this (mod 1) never fall in step with a repeating strip. */
const GOLDEN = 0.6180339887498949;
const drawn = [0, 0, 0];

/**
 * Where sample `i` of an edge cut in `steps` spans lies (0..1): both ends, then one point inside
 * each span at a golden-ratio offset. Evenly spaced points would land on the same texel column
 * whenever the edge repeats the strip a whole number of times per span (U 0..32 in 32 steps).
 */
const sampleAt = (i: number, steps: number): number => {
  if (i === 0) return 0;
  if (i === 1) return 1;
  const s = i - 2;
  const g = (s + 1) * GOLDEN;
  return (s + g - Math.floor(g)) / steps;
};

/**
 * Contrast drawn along edge p–q, mean over RGB: without albedo |Δ vertex colour|; with it the
 * range of albedo × vertex colour sampled along the edge, so a flat colour over a striped strip
 * counts and a flat albedo only scales vertex-colour contrast.
 */
export function edgeContrast(m: Mesh, p: number, q: number, albedo: Albedo | undefined): number {
  let d = 0;
  if (!albedo) {
    for (let k = 0; k < 3; k++)
      d += Math.abs((m.colors[p * 3 + k] ?? 1) - (m.colors[q * 3 + k] ?? 1));
    return d / 3;
  }
  const [u0, v0, u1, v1] = [
    m.uvs[p * 2] ?? 0,
    m.uvs[p * 2 + 1] ?? 0,
    m.uvs[q * 2] ?? 0,
    m.uvs[q * 2 + 1] ?? 0,
  ];
  const texels = dmath.hypot((u1 - u0) * albedo.width, (v1 - v0) * albedo.height);
  const steps = Math.min(EDGE_SAMPLES, Math.max(1, Math.ceil(texels)));
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < steps + 2; i++) {
    const t = sampleAt(i, steps);
    sampleAlbedo(albedo, u0 + (u1 - u0) * t, v0 + (v1 - v0) * t, drawn);
    for (let k = 0; k < 3; k++) {
      const cp = m.colors[p * 3 + k] ?? 1;
      const c = cp + ((m.colors[q * 3 + k] ?? 1) - cp) * t;
      const x = (drawn[k] ?? 1) * c;
      lo[k] = Math.min(lo[k] ?? x, x);
      hi[k] = Math.max(hi[k] ?? x, x);
    }
  }
  for (let k = 0; k < 3; k++) d += (hi[k] ?? 0) - (lo[k] ?? 0);
  return d / 3;
}
