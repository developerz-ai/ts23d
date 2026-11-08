// The texture DSL's scalar node: a lazily evaluated, memoised greyscale layer over a strip's
// texel grid (Substance-style: generators → filters → height / masks). Nodes are immutable and
// chain (`noise.warp(cells, 0.02).levels(0.3, 0.7)`); evaluation is a pure function of the
// context (grid + seed), so a graph is deterministic. Spatial filters wrap along U and clamp
// along V, so anything built from tileable generators stays tileable by construction.

import type { Grid } from '../paint/canvas.ts';
import { boxBlur } from '../paint/orm.ts';
import { type ColourField, ramp, type Stop } from './colour.ts';

/** Where a graph is evaluated: the texel grid, its seed and the U period it must repeat at. */
export interface TexContext extends Grid {
  readonly seed: number;
  /** World metres of one tile along U; `metresU` is a whole number of tiles. */
  readonly tileU: number;
}

/** A node input: another field or a constant. */
export type Input = TexField | number;

type Eval = (ctx: TexContext) => Float32Array;

const fill = (ctx: TexContext, v: number): Float32Array => new Float32Array(ctx.w * ctx.h).fill(v);
const at = (x: Input, ctx: TexContext): Float32Array | number =>
  typeof x === 'number' ? x : x.eval(ctx);

/** Bilinear sample of a layer at fractional texel (x, y): wraps U when the grid does, clamps V. */
export function sample(ctx: TexContext, a: Float32Array, x: number, y: number): number {
  const { w, h } = ctx;
  const yc = Math.min(h - 1, Math.max(0, y));
  const x0 = Math.floor(x);
  const y0 = Math.floor(yc);
  const fx = x - x0;
  const fy = yc - y0;
  const wx = (i: number): number =>
    ctx.wrapU ? ((i % w) + w) % w : Math.min(w - 1, Math.max(0, i));
  const xa = wx(x0);
  const xb = wx(x0 + 1);
  const ya = y0 * w;
  const yb = Math.min(h - 1, y0 + 1) * w;
  const top = (a[ya + xa] ?? 0) * (1 - fx) + (a[ya + xb] ?? 0) * fx;
  const bot = (a[yb + xa] ?? 0) * (1 - fx) + (a[yb + xb] ?? 0) * fx;
  return top * (1 - fy) + bot * fy;
}

export class TexField {
  readonly #fn: Eval;
  readonly #memo = new WeakMap<TexContext, Float32Array>();
  /** What the node is, for error messages ("noise(0.2).warp(…)"). */
  readonly label: string;

  constructor(fn: Eval, label: string) {
    this.#fn = fn;
    this.label = label;
  }

  /** The layer on this grid (memoised: a node shared by several outputs is computed once). */
  eval(ctx: TexContext): Float32Array {
    const hit = this.#memo.get(ctx);
    if (hit) return hit;
    const out = this.#fn(ctx);
    this.#memo.set(ctx, out);
    return out;
  }

  /** Per-texel op with another input. */
  zip(o: Input, op: (a: number, b: number) => number, name: string): TexField {
    return new TexField((ctx) => {
      const a = this.eval(ctx);
      const b = at(o, ctx);
      const out = new Float32Array(a.length);
      for (let i = 0; i < a.length; i++)
        out[i] = op(a[i] ?? 0, typeof b === 'number' ? b : (b[i] ?? 0));
      return out;
    }, `${this.label}.${name}`);
  }

  /** Per-texel op on this field alone. */
  map(op: (a: number) => number, name: string): TexField {
    return this.zip(0, (a) => op(a), name);
  }

  add(o: Input): TexField {
    return this.zip(o, (a, b) => a + b, 'add');
  }
  sub(o: Input): TexField {
    return this.zip(o, (a, b) => a - b, 'sub');
  }
  mul(o: Input): TexField {
    return this.zip(o, (a, b) => a * b, 'mul');
  }
  max(o: Input): TexField {
    return this.zip(o, Math.max, 'max');
  }
  min(o: Input): TexField {
    return this.zip(o, Math.min, 'min');
  }
  /** a·(1−t) + b·t with this field as t. */
  lerp(a: Input, b: Input): TexField {
    return new TexField((ctx) => {
      const tv = this.eval(ctx);
      const av = at(a, ctx);
      const bv = at(b, ctx);
      const out = new Float32Array(tv.length);
      for (let i = 0; i < tv.length; i++) {
        const x = tv[i] ?? 0;
        const p = typeof av === 'number' ? av : (av[i] ?? 0);
        const q = typeof bv === 'number' ? bv : (bv[i] ?? 0);
        out[i] = p + (q - p) * x;
      }
      return out;
    }, `${this.label}.lerp`);
  }
  invert(): TexField {
    return this.map((a) => 1 - a, 'invert');
  }
  pow(k: number): TexField {
    return this.map((a) => Math.max(0, a) ** k, `pow(${k})`);
  }
  clamp(lo = 0, hi = 1): TexField {
    return this.map((a) => Math.min(hi, Math.max(lo, a)), 'clamp');
  }
  /** Linear remap [inLo, inHi] → [outLo, outHi], clamped (Substance "levels"). */
  levels(inLo: number, inHi: number, outLo = 0, outHi = 1): TexField {
    const d = inHi - inLo || 1e-9;
    return this.map((a) => {
      const t = Math.min(1, Math.max(0, (a - inLo) / d));
      return outLo + (outHi - outLo) * t;
    }, `levels(${inLo},${inHi})`);
  }
  /** Map 0..1 onto [lo, hi] without clamping the input (e.g. roughness from height). */
  remap(lo: number, hi: number): TexField {
    return this.map((a) => lo + (hi - lo) * a, `remap(${lo},${hi})`);
  }
  smoothstep(e0: number, e1: number): TexField {
    return this.map((a) => {
      const t = Math.min(1, Math.max(0, (a - e0) / (e1 - e0 || 1e-9)));
      return t * t * (3 - 2 * t);
    }, `smoothstep(${e0},${e1})`);
  }
  threshold(t: number): TexField {
    return this.map((a) => (a >= t ? 1 : 0), `threshold(${t})`);
  }

  /** Displace the lookup by `by` (0..1, 0.5 = none) times `metres`; `byV` drives V (default `by`). */
  warp(by: TexField, metres: number, byV: TexField = by): TexField {
    return new TexField((ctx) => {
      const src = this.eval(ctx);
      const du = by.eval(ctx);
      const dv = byV === by ? null : byV.eval(ctx);
      const ku = (2 * metres * ctx.w) / ctx.metresU;
      const kv = (2 * metres * ctx.h) / ctx.metresV;
      const out = new Float32Array(src.length);
      for (let y = 0; y < ctx.h; y++)
        for (let x = 0; x < ctx.w; x++) {
          const i = y * ctx.w + x;
          const a = (du[i] ?? 0.5) - 0.5;
          const b = dv ? (dv[i] ?? 0.5) - 0.5 : -a;
          out[i] = sample(ctx, src, x + a * ku, y + b * kv);
        }
      return out;
    }, `${this.label}.warp`);
  }

  /** Soft blur of `metres` radius (two box passes ≈ Gaussian). */
  blur(metres: number): TexField {
    return new TexField((ctx) => {
      const rx = Math.max(1, Math.round((metres * ctx.w) / ctx.metresU));
      const ry = Math.max(1, Math.round((metres * ctx.h) / ctx.metresV));
      const a = boxBlur(this.eval(ctx), ctx.w, ctx.h, rx, ry, ctx.wrapU);
      return boxBlur(a, ctx.w, ctx.h, rx, ry, ctx.wrapU);
    }, `${this.label}.blur(${metres})`);
  }

  /** Gradient-map this field (0..1) through colour stops: `h.ramp([[0, '#3a2a1c'], [1, '#c9a66b']])`. */
  ramp(stops: readonly Stop[]): ColourField {
    return ramp(this, stops);
  }

  /** This minus its blur: + on ridges and convex edges, − in creases (edge wear, dirt masks). */
  curvature(metres: number): TexField {
    return this.sub(this.blur(metres));
  }
}

/** A constant layer. */
export const constant = (v: number): TexField => new TexField((ctx) => fill(ctx, v), `${v}`);
