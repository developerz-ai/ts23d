// Texture DSL generators: the greyscale sources every graph starts from — fBm noise, ridged noise,
// cellular (Worley) cells, a vertical gradient, constants and a user function. Every size is in
// metres and is snapped to a whole number of lattice cells per tile along U, so each generator
// repeats exactly every `ctx.tileU`: tileable by construction. Features are clamped to ≥ 1.5
// texels per axis (strip texels are anisotropic) so nothing aliases. All outputs are 0..1.

import { fbm, hash2 } from '../paint/noise.ts';
import { type TexContext, TexField } from './field.ts';

export interface NoiseOptions {
  /** Feature size along U, metres. */
  readonly size: number;
  /** Feature size along V, metres (default `size`: round features). */
  readonly sizeV?: number;
  readonly octaves?: number;
  /** Amplitude kept per octave (0.5 = classic fBm; higher = rougher). */
  readonly gain?: number;
  /** Salt: two generators with different seeds are independent. */
  readonly seed?: number;
}

/** Lattice cells per tile for a feature size (≥ 1), and the cell size in metres. */
export function lattice(
  ctx: TexContext,
  size: number,
): { readonly n: number; readonly cell: number } {
  const n = ctx.wrapU ? Math.max(1, Math.round(ctx.tileU / size)) : 1 << 20;
  return { n, cell: ctx.wrapU ? ctx.tileU / n : size };
}

/** Smallest feature (m) an fBm's top octave may reach on an axis of `texel` metres. */
const finest = (texel: number, octaves: number): number => 1.5 * texel * 2 ** (octaves - 1);

/** Visit every texel centre in metres. */
export function eachTexel(ctx: TexContext, fn: (i: number, xm: number, ym: number) => void): void {
  const pu = ctx.metresU / ctx.w;
  const pv = ctx.metresV / ctx.h;
  for (let y = 0; y < ctx.h; y++)
    for (let x = 0; x < ctx.w; x++) fn(y * ctx.w + x, (x + 0.5) * pu, (y + 0.5) * pv);
}

function fbmField(o: NoiseOptions, shape: (v: number) => number, name: string): TexField {
  const oct = o.octaves ?? 4;
  return new TexField((ctx) => {
    const su = Math.max(o.size, finest(ctx.metresU / ctx.w, oct));
    const sv = Math.max(o.sizeV ?? o.size, finest(ctx.metresV / ctx.h, oct));
    const { n, cell } = lattice(ctx, su);
    const seed = ctx.seed + (o.seed ?? 0) * 7919;
    const out = new Float32Array(ctx.w * ctx.h);
    eachTexel(ctx, (i, xm, ym) => {
      out[i] = shape(fbm(xm / cell, ym / sv, n, seed, oct, o.gain ?? 0.5));
    });
    return out;
  }, `${name}(${o.size})`);
}

/** Tileable fBm value noise, 0..1 (mean ≈ 0.5). */
export const noise = (o: NoiseOptions): TexField => fbmField(o, (v) => 0.5 + 0.5 * v, 'noise');

/** Ridged noise, 0..1: sharp crests where the fBm crosses zero (cracks, veins, rock ridges). */
export const ridged = (o: NoiseOptions): TexField =>
  fbmField(o, (v) => (1 - Math.min(1, Math.abs(v) * 1.6)) ** 2, 'ridged');

export interface CellsOptions {
  /** Mean cell size, metres. */
  readonly size: number;
  /** 0 = square grid, 1 = fully random points. */
  readonly jitter?: number;
  /** f1: distance to the nearest point · edge: distance to the cell border · id: one random 0..1 per cell. */
  readonly out?: 'f1' | 'edge' | 'id';
  readonly seed?: number;
}

/** One Worley sample; distances in cell units. Wraps the lattice every `n` cells along U. */
export function worleyAt(
  u: number,
  v: number,
  n: number,
  jitter: number,
  seed: number,
): { f1: number; f2: number; id: number; cx: number; cy: number } {
  const gx = Math.floor(u);
  const gy = Math.floor(v);
  let f1 = 81;
  let f2 = 81;
  let id = 0;
  let cx = 0;
  let cy = 0;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const lx = (((gx + i) % n) + n) % n;
      const px = gx + i + 0.5 + jitter * (hash2(lx, gy + j, seed) - 0.5);
      const py = gy + j + 0.5 + jitter * (hash2(lx, gy + j, seed + 1) - 0.5);
      const d = (u - px) ** 2 + (v - py) ** 2;
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = hash2(lx, gy + j, seed + 2);
        cx = px;
        cy = py;
      } else if (d < f2) f2 = d;
    }
  return { f1: Math.sqrt(f1), f2: Math.sqrt(f2), id, cx, cy };
}

/** Cellular noise: stones, pebbles, cracks (edge), per-cell variation (id). 0..1. */
export function cells(o: CellsOptions): TexField {
  const mode = o.out ?? 'f1';
  return new TexField((ctx) => {
    const coarse = Math.max(ctx.metresU / ctx.w, ctx.metresV / ctx.h);
    const { n, cell } = lattice(ctx, Math.max(o.size, 2.5 * coarse));
    const seed = ctx.seed + (o.seed ?? 0) * 7919;
    const jitter = o.jitter ?? 1;
    const out = new Float32Array(ctx.w * ctx.h);
    eachTexel(ctx, (i, xm, ym) => {
      const w = worleyAt(xm / cell, ym / cell, n, jitter, seed);
      out[i] =
        mode === 'id' ? w.id : mode === 'edge' ? Math.min(1, w.f2 - w.f1) : Math.min(1, w.f1);
    });
    return out;
  }, `cells(${o.size},${mode})`);
}

/** 0 at the bottom of the strip (world down), 1 at the top: pooling, strata, moisture. */
export const gradientV = (): TexField =>
  new TexField((ctx) => {
    const out = new Float32Array(ctx.w * ctx.h);
    eachTexel(ctx, (i, _x, ym) => {
      out[i] = ym / ctx.metresV;
    });
    return out;
  }, 'gradientV');

/**
 * Your own generator: (xm, ym, ctx) → number, metres in, any value out. It must repeat every
 * `ctx.tileU` along U (e.g. `Math.sin((2 * Math.PI * xm) / ctx.tileU)`); defineMaterial rejects
 * a graph that does not.
 */
export const fn = (f: (xm: number, ym: number, ctx: TexContext) => number, name = 'fn'): TexField =>
  new TexField((ctx) => {
    const out = new Float32Array(ctx.w * ctx.h);
    eachTexel(ctx, (i, xm, ym) => {
      out[i] = f(xm, ym, ctx);
    });
    return out;
  }, name);
