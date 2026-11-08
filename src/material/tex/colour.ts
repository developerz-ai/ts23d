// Texture DSL colour nodes: a linear-RGB layer (3 floats per texel). `ramp` gradient-maps a
// greyscale field through colour stops (Substance "gradient map"), `colour` is a constant, and
// colour fields mix by a mask and multiply by a tone field. Stops are sRGB hex or linear RGB;
// interpolation happens in linear space.

import type { Vec3 } from '../../core/index.ts';
import { hex } from '../palette.ts';
import type { Input, TexContext, TexField } from './field.ts';

export type ColourInput = string | Vec3;
export type Stop = readonly [number, ColourInput];

const lin = (c: ColourInput): Vec3 => (typeof c === 'string' ? hex(c) : c);

export class ColourField {
  readonly #fn: (ctx: TexContext) => Float32Array;
  readonly #memo = new WeakMap<TexContext, Float32Array>();
  readonly label: string;

  constructor(fn: (ctx: TexContext) => Float32Array, label: string) {
    this.#fn = fn;
    this.label = label;
  }

  /** Linear RGB, 3 floats per texel. */
  eval(ctx: TexContext): Float32Array {
    const hit = this.#memo.get(ctx);
    if (hit) return hit;
    const out = this.#fn(ctx);
    this.#memo.set(ctx, out);
    return out;
  }

  /** This where `mask` is 0, `other` where it is 1. */
  mix(other: ColourField | ColourInput, mask: TexField): ColourField {
    const o = other instanceof ColourField ? other : colour(other);
    return new ColourField((ctx) => {
      const a = this.eval(ctx);
      const b = o.eval(ctx);
      const m = mask.eval(ctx);
      const out = new Float32Array(a.length);
      for (let i = 0; i < m.length; i++) {
        const t = Math.min(1, Math.max(0, m[i] ?? 0));
        for (let k = 0; k < 3; k++) {
          const j = i * 3 + k;
          out[j] = (a[j] ?? 0) * (1 - t) + (b[j] ?? 0) * t;
        }
      }
      return out;
    }, `${this.label}.mix`);
  }

  /** Multiply by a tone (darken cavities, brighten crests). */
  mul(tone: Input): ColourField {
    return new ColourField((ctx) => {
      const a = this.eval(ctx);
      const t = typeof tone === 'number' ? null : tone.eval(ctx);
      const out = new Float32Array(a.length);
      for (let i = 0; i < a.length; i++)
        out[i] = (a[i] ?? 0) * (t ? (t[Math.floor(i / 3)] ?? 1) : (tone as number));
      return out;
    }, `${this.label}.mul`);
  }
}

/** A constant colour. */
export function colour(c: ColourInput): ColourField {
  const v = lin(c);
  return new ColourField(
    (ctx) => {
      const out = new Float32Array(ctx.w * ctx.h * 3);
      for (let i = 0; i < out.length; i++) out[i] = v[i % 3] ?? 1;
      return out;
    },
    `colour(${typeof c === 'string' ? c : c.join(',')})`,
  );
}

/** Gradient map: `t` (0..1, clamped) through stops sorted by position. */
export function ramp(t: TexField, stops: readonly Stop[]): ColourField {
  const s = [...stops].sort((a, b) => a[0] - b[0]).map(([p, c]) => [p, lin(c)] as const);
  return new ColourField((ctx) => {
    const v = t.eval(ctx);
    const out = new Float32Array(v.length * 3);
    for (let i = 0; i < v.length; i++) {
      const x = v[i] ?? 0;
      let k = 0;
      while (k < s.length - 1 && (s[k + 1]?.[0] ?? 1) < x) k++;
      const [p0, c0] = s[k] ?? [0, [1, 1, 1] as Vec3];
      const [p1, c1] = s[Math.min(k + 1, s.length - 1)] ?? [p0, c0];
      const f = p1 > p0 ? Math.min(1, Math.max(0, (x - p0) / (p1 - p0))) : 0;
      for (let j = 0; j < 3; j++) out[i * 3 + j] = (c0[j] ?? 1) + ((c1[j] ?? 1) - (c0[j] ?? 1)) * f;
    }
    return out;
  }, `${t.label}.ramp`);
}
