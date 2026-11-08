// A material as a texture graph: which DSL nodes feed height, albedo, roughness, metalness and
// occlusion. `paintGraph` evaluates it onto a strip canvas (height scaled to metres; the normal,
// cavity AO and curvature roughness then derive from it as for every painter). `probeGraph`
// paints it on a tiny two-tile grid first and rejects, with T3D_MATERIAL_INVALID, a graph that
// does not repeat along U, writes NaN, or leaves 0..1 for colour, roughness or metalness.

import { Ts23dError } from '../../core/index.ts';
import type { Canvas } from '../paint/canvas.ts';
import { ColourField } from './colour.ts';
import { type TexContext, TexField } from './field.ts';

export interface MaterialGraph {
  /** 0..1 shape; `depth` metres at 1. Everything that catches light starts here. */
  readonly height: TexField;
  /** Metres of relief between height 0 and 1. Default 0.003. */
  readonly depth?: number;
  /** Colour (linear, from `ramp`/`colour`) or a grey tone the vertex colour tints. */
  readonly albedo: ColourField | TexField;
  readonly roughness: TexField | number;
  readonly metalness?: TexField | number;
  /** Extra 0..1 occlusion multiplied into the cavity AO. */
  readonly occlusion?: TexField;
}

const isGraph = (g: unknown): g is MaterialGraph => {
  const o = g as Partial<MaterialGraph> | null;
  const scalar = (v: unknown): boolean => v instanceof TexField || typeof v === 'number';
  return (
    !!o &&
    o.height instanceof TexField &&
    (o.albedo instanceof TexField || o.albedo instanceof ColourField) &&
    scalar(o.roughness) &&
    (o.metalness === undefined || scalar(o.metalness)) &&
    (o.occlusion === undefined || o.occlusion instanceof TexField)
  );
};

/** Declare a material graph (shape-checked; tileability and ranges are checked by the probe). */
export function material(g: MaterialGraph): MaterialGraph {
  if (!isGraph(g))
    throw new Ts23dError('T3D_MATERIAL_INVALID', {
      cause: 'tex.material(): height/albedo/roughness are not texture nodes',
      fix: "height: a tex field (e.g. tex.noise({ size: 0.1 })), albedo: tex.ramp(…) / tex.colour('#…') or a field, roughness: a field or number",
    });
  return g;
}

const layer = (v: TexField | number, ctx: TexContext): Float32Array =>
  typeof v === 'number' ? new Float32Array(ctx.w * ctx.h).fill(v) : v.eval(ctx);

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** Evaluate the graph onto a strip/cell canvas; the canvas's U span is one tile. */
export function paintGraph(c: Canvas, g: MaterialGraph, seed: number): void {
  const ctx: TexContext = {
    w: c.w,
    h: c.h,
    metresU: c.metresU,
    metresV: c.metresV,
    wrapU: c.wrapU,
    seed,
    tileU: c.metresU,
  };
  const depth = g.depth ?? 0.003;
  const h = g.height.eval(ctx);
  const rough = layer(g.roughness, ctx);
  const metal = layer(g.metalness ?? 0, ctx);
  const occl = g.occlusion?.eval(ctx);
  for (let i = 0; i < h.length; i++) {
    c.height[i] = (h[i] ?? 0) * depth;
    c.rough[i] = clamp01(rough[i] ?? 0.8);
    c.metal[i] = clamp01(metal[i] ?? 0);
    c.occl[i] = occl ? clamp01(occl[i] ?? 1) : 1;
    c.tone[i] = 1;
    c.mix[i] = 0;
  }
  if (g.albedo instanceof ColourField) {
    const a = g.albedo.eval(ctx);
    c.linear = a.map(clamp01);
    c.colours = null;
  } else {
    const a = g.albedo.eval(ctx);
    for (let i = 0; i < a.length; i++) c.tone[i] = clamp01(a[i] ?? 1);
  }
}

function fail(where: string, cause: string, fix: string): never {
  throw new Ts23dError('T3D_MATERIAL_INVALID', { cause: `${where}: ${cause}`, fix });
}

/** Max |left tile − right tile| of a layer laid out `w` wide, two tiles across. */
function seam(a: Float32Array, w: number, k: number): number {
  const half = w / 2;
  let worst = 0;
  for (let i = 0; i < a.length / k; i++) {
    const x = i % w;
    if (x >= half) continue;
    for (let j = 0; j < k; j++)
      worst = Math.max(worst, Math.abs((a[i * k + j] ?? 0) - (a[(i + half) * k + j] ?? 0)));
  }
  return worst;
}

/**
 * Paint the graph on a 2-tile probe (128 texels per tile, the strip's metres) and check it:
 * finite everywhere, colour/roughness/metalness inside 0..1, and the second tile identical to
 * the first (tileable along U). Throws T3D_MATERIAL_INVALID naming the failing output.
 */
export function probeGraph(
  g: MaterialGraph,
  spanMetres: number,
  scaleMetres: number,
  where: string,
): void {
  const w = 256;
  const ctx: TexContext = {
    w,
    h: 16,
    metresU: 2 * spanMetres,
    metresV: scaleMetres,
    wrapU: true,
    seed: 1,
    tileU: spanMetres,
  };
  const outs: [string, Float32Array, number, boolean][] = [
    ['height', g.height.eval(ctx), 1, false],
    ['albedo', g.albedo.eval(ctx), g.albedo instanceof ColourField ? 3 : 1, true],
    ['roughness', layer(g.roughness, ctx), 1, true],
    ['metalness', layer(g.metalness ?? 0, ctx), 1, true],
  ];
  if (g.occlusion) outs.push(['occlusion', g.occlusion.eval(ctx), 1, true]);
  for (const [name, a, k, unit] of outs) {
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (const v of a) {
      if (!Number.isFinite(v))
        fail(
          where,
          `graph output '${name}' is ${v}`,
          'guard divisions and pow() of negatives; clamp with .clamp()',
        );
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    if (unit && (lo < -1e-4 || hi > 1 + 1e-4))
      fail(
        where,
        `graph output '${name}' spans ${lo.toFixed(3)}..${hi.toFixed(3)}, outside 0..1`,
        `end the chain with .clamp() or .levels(lo, hi) so ${name} stays in 0..1`,
      );
    const range = Math.max(1e-6, hi - lo);
    const s = seam(a, w, k);
    if (s > 0.02 * range + 1e-4)
      fail(
        where,
        `graph output '${name}' does not tile along U (tile 2 differs from tile 1 by ${s.toFixed(4)}; range ${range.toFixed(4)})`,
        'build it from tex generators and stamps (they snap to whole tiles); a tex.fn must repeat every ctx.tileU metres along U',
      );
  }
}
