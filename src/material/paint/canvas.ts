// The painting surface for one sheet region (a strip or a cell): float layers in real metres.
// Painters write height (metres of relief, + is out of the surface), linear grey tone,
// roughness and metalness; `finish` turns them into normal + ORM; `compose` copies into the sheet.

import { fbm } from './noise.ts';

export interface Canvas {
  readonly w: number;
  readonly h: number;
  /** World metres the canvas spans along U (x) and V (y). Row y grows with world up (+V). */
  readonly metresU: number;
  readonly metresV: number;
  /** Strips wrap along U (tile seamlessly); cells clamp. */
  readonly wrapU: boolean;
  readonly height: Float32Array;
  readonly tone: Float32Array;
  readonly rough: Float32Array;
  readonly metal: Float32Array;
  /** Extra occlusion multiplied into the cavity AO (foliage darkens toward the twig). */
  readonly occl: Float32Array;
  /** sRGB RGBA override (stamped images, coloured foliage); null when painted greyscale. */
  rgba: Uint8Array | null;
}

export function createCanvas(
  w: number,
  h: number,
  metresU: number,
  metresV: number,
  wrapU: boolean,
): Canvas {
  const n = w * h;
  return {
    w,
    h,
    metresU,
    metresV,
    wrapU,
    height: new Float32Array(n),
    tone: new Float32Array(n).fill(1),
    rough: new Float32Array(n).fill(0.8),
    metal: new Float32Array(n),
    occl: new Float32Array(n).fill(1),
    rgba: null,
  };
}

/** Metres per pixel along x and y. */
export const pxU = (c: Canvas): number => c.metresU / c.w;
export const pxV = (c: Canvas): number => c.metresV / c.h;

/** Noise period (lattice cells across the canvas width) for a feature size in metres. */
export function periodFor(c: Canvas, featureMetres: number): number {
  return c.wrapU ? Math.max(1, Math.round(c.metresU / featureMetres)) : 1 << 20;
}

/**
 * fBm sampled at metres (xm, ym) with feature size `sizeU` along U and `sizeV` along V,
 * snapped so it tiles along U. Returns [-1, 1].
 */
export function noiseAt(
  c: Canvas,
  xm: number,
  ym: number,
  sizeU: number,
  sizeV: number,
  seed: number,
  octaves = 4,
): number {
  // Strips are coarse along V: never ask for a feature finer than ~1.5 texels on either axis,
  // or it aliases into streaks. Scale both axes together so the feature keeps its aspect.
  const finest = 1.5 * Math.max(c.metresU / c.w, c.metresV / c.h);
  const k = Math.max(1, finest / Math.min(sizeU, sizeV));
  const period = periodFor(c, sizeU * k);
  const cell = c.wrapU ? c.metresU / period : sizeU * k;
  return fbm(xm / cell, ym / (sizeV * k), period, seed, octaves);
}

/** Read a parameter with a default, rejecting nothing (validation happens in the generator). */
export const param = (
  params: Readonly<Record<string, number>> | undefined,
  key: string,
  fallback: number,
): number => params?.[key] ?? fallback;

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export const smooth = (e0: number, e1: number, v: number): number => {
  const t = clamp01((v - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
