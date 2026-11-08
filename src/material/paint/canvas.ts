// The painting surface for one sheet region (a strip or a cell): float layers in real metres.
// Painters write height (metres of relief, + is out of the surface), linear grey tone,
// roughness, metalness and a two-colour `mix`; `compose` turns them into albedo + normal + ORM.

import type { Vec3 } from '../../core/index.ts';
import { fbm } from './noise.ts';

/** The texel grid of a region: what samplers need to snap features to whole tiles. */
export interface Grid {
  readonly w: number;
  readonly h: number;
  /** World metres the canvas spans along U (x) and V (y). Row y grows with world up (+V). */
  readonly metresU: number;
  readonly metresV: number;
  /** Strips wrap along U (tile seamlessly); cells clamp. */
  readonly wrapU: boolean;
}

export interface Canvas extends Grid {
  readonly height: Float32Array;
  readonly tone: Float32Array;
  readonly rough: Float32Array;
  readonly metal: Float32Array;
  /** Extra occlusion multiplied into the cavity AO (foliage darkens toward the twig). */
  readonly occl: Float32Array;
  /** 0 = `colours[0]`, 1 = `colours[1]` (latewood, rust, bare wood under chipped paint…). */
  readonly mix: Float32Array;
  /** Linear albedo pair for material strips; null = greyscale (vertex colour carries hue). */
  colours: readonly [Vec3, Vec3] | null;
  /** sRGB RGBA override (stamped images, coloured foliage); null when painted greyscale. */
  rgba: Uint8Array | null;
  /** Linear RGB per texel (3 floats each; texture graphs with ramps), × tone; else `colours`. */
  linear: Float32Array | null;
  /** Tangent-space normal override (image strips); null = derived from `height`. */
  normalRgba: Uint8Array | null;
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
    mix: new Float32Array(n),
    colours: null,
    rgba: null,
    linear: null,
    normalRgba: null,
  };
}

/** Metres per pixel along x and y. */
export const pxU = (c: Canvas): number => c.metresU / c.w;
export const pxV = (c: Canvas): number => c.metresV / c.h;

/** Noise period (lattice cells across the canvas width) for a feature size in metres. */
export function periodFor(c: Grid, featureMetres: number): number {
  return c.wrapU ? Math.max(1, Math.round(c.metresU / featureMetres)) : 1 << 20;
}

/**
 * fBm sampled at metres (xm, ym) with feature size `sizeU` along U and `sizeV` along V,
 * snapped so it tiles along U. Returns [-1, 1].
 */
export function noiseAt(
  c: Grid,
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
