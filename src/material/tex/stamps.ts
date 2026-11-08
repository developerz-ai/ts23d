// Texture DSL pattern stamps: bricks / tiles / planks (running bonds), scattered stones and
// pebbles, and sedimentary strata. Each returns a `Stamp` of three fields over the same layout:
// `height` (0 in the joints → 1 on the faces, bevelled), `id` (one random 0..1 per piece, for
// colour and height variation) and `mask` (1 on a piece, 0 in the gaps). Piece counts snap to
// whole numbers per tile along U, so stamps are tileable by construction.

import { hash2 } from '../paint/noise.ts';
import { type TexContext, TexField } from './field.ts';
import { eachTexel, lattice } from './generators.ts';

export interface Stamp {
  readonly height: TexField;
  readonly id: TexField;
  readonly mask: TexField;
}

type Layers = { readonly h: Float32Array; readonly id: Float32Array; readonly m: Float32Array };

/** One evaluation per grid shared by the three output fields. */
function stamp(name: string, paint: (ctx: TexContext, l: Layers) => void): Stamp {
  const memo = new WeakMap<TexContext, Layers>();
  const layers = (ctx: TexContext): Layers => {
    const hit = memo.get(ctx);
    if (hit) return hit;
    const n = ctx.w * ctx.h;
    const l = { h: new Float32Array(n), id: new Float32Array(n), m: new Float32Array(n) };
    paint(ctx, l);
    memo.set(ctx, l);
    return l;
  };
  return {
    height: new TexField((ctx) => layers(ctx).h, `${name}.height`),
    id: new TexField((ctx) => layers(ctx).id, `${name}.id`),
    mask: new TexField((ctx) => layers(ctx).m, `${name}.mask`),
  };
}

const ramp = (d: number, gap: number, bevel: number): number => {
  const t = Math.min(1, Math.max(0, (d - gap) / Math.max(1e-6, bevel)));
  return t * t * (3 - 2 * t);
};

export interface BondOptions {
  /** Piece length along U, metres (snapped to a whole number per tile). */
  readonly width: number;
  /** Course height along V, metres. */
  readonly height: number;
  /** Joint width, metres. */
  readonly gap?: number;
  /** Rounded arris width, metres. */
  readonly bevel?: number;
  /** Shift per course as a fraction of `width` (0.5 running bond, 0 stack bond), or 'random'. */
  readonly offset?: number | 'random';
  readonly seed?: number;
}

/** Running bond: bricks, tiles, flagstones, planks ('random' offset staggers board ends). */
export function bricks(o: BondOptions): Stamp {
  return stamp(`bricks(${o.width}×${o.height})`, (ctx, l) => {
    const { n, cell } = lattice(ctx, o.width);
    const gap = (o.gap ?? 0.01) / 2;
    const bevel = o.bevel ?? 0.005;
    const seed = ctx.seed + (o.seed ?? 0) * 7919;
    eachTexel(ctx, (i, xm, ym) => {
      const row = Math.floor(ym / o.height);
      const shift = o.offset === 'random' ? hash2(row, 7, seed) : (row * (o.offset ?? 0.5)) % 1;
      const u = xm / cell + shift;
      const col = Math.floor(u);
      const du = Math.min(u - col, col + 1 - u) * cell;
      const dv = Math.min(ym - row * o.height, (row + 1) * o.height - ym);
      const d = Math.min(du, dv);
      l.h[i] = ramp(d, gap, bevel);
      l.m[i] = d > gap ? 1 : 0;
      l.id[i] = hash2(((col % n) + n) % n, row, seed + 3);
    });
  });
}

/** Stack-bond tiles (`offset` 0). */
export const tiles = (o: Omit<BondOptions, 'offset'>): Stamp => bricks({ ...o, offset: 0 });

/** Boards along U, `width` wide (V), random lengths around `length`. */
export const planks = (o: {
  readonly width: number;
  readonly length: number;
  readonly gap?: number;
  readonly bevel?: number;
  readonly seed?: number;
}): Stamp =>
  bricks({
    width: o.length,
    height: o.width,
    gap: o.gap ?? 0.004,
    bevel: o.bevel ?? 0.003,
    offset: 'random',
    seed: o.seed ?? 0,
  });

export interface ScatterOptions {
  /** Mean spacing of pieces, metres. */
  readonly size: number;
  /** Share of lattice cells that hold a piece, 0..1. */
  readonly density?: number;
  /** Piece radius as a share of the spacing (0.5 touching; up to 1.4 overlaps). ±30 % per piece. */
  readonly radius?: number;
  /** Profile: dome (pebbles), cone (grit, scree), flat (flagstones, leaves). */
  readonly shape?: 'dome' | 'cone' | 'flat';
  /** Length / width of each piece (1 round; 3 a leaf; 6 a lenticel). */
  readonly aspect?: number;
  /** Random orientation per piece (true), or the long axis along U (false, default). */
  readonly rotate?: boolean;
  readonly jitter?: number;
  readonly seed?: number;
}

/**
 * Scattered pieces on a jittered lattice (gravel, cobbles, leaves, lenticels, bubbles). Pieces
 * may overlap their neighbours: each texel takes the highest piece over it (a 5×5 neighbourhood).
 */
export function scatter(o: ScatterOptions): Stamp {
  const shape = o.shape ?? 'dome';
  return stamp(`scatter(${o.size},${shape})`, (ctx, l) => {
    const coarse = Math.max(ctx.metresU / ctx.w, ctx.metresV / ctx.h);
    const { n, cell } = lattice(ctx, Math.max(o.size, 3 * coarse));
    const seed = ctx.seed + (o.seed ?? 0) * 7919;
    const dens = o.density ?? 1;
    const ax = Math.sqrt(o.aspect ?? 1);
    const jit = o.jitter ?? 0.8;
    const rad = o.radius ?? 0.45;
    const reach = rad * 1.3 * ax > 0.9 ? 2 : 1;
    eachTexel(ctx, (i, xm, ym) => {
      const u = xm / cell;
      const v = ym / cell;
      const gx = Math.floor(u);
      const gy = Math.floor(v);
      let best = 0;
      for (let j = -reach; j <= reach; j++)
        for (let k = -reach; k <= reach; k++) {
          const lx = (((gx + k) % n) + n) % n;
          const id = hash2(lx, gy + j, seed + 2);
          if (id >= dens) continue;
          const px = gx + k + 0.5 + jit * (hash2(lx, gy + j, seed) - 0.5);
          const py = gy + j + 0.5 + jit * (hash2(lx, gy + j, seed + 1) - 0.5);
          const r = rad * (0.7 + 0.6 * hash2(lx, gy + j, seed + 5));
          const a = o.rotate ? Math.PI * hash2(lx, gy + j, seed + 6) : 0;
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          const du = u - px;
          const dv = v - py;
          const along = (du * ca + dv * sa) / ax;
          const across = (-du * sa + dv * ca) * ax;
          const t = Math.sqrt(along * along + across * across) / r;
          if (t >= 1) continue;
          const prof =
            shape === 'dome'
              ? Math.sqrt(1 - t * t)
              : shape === 'cone'
                ? 1 - t
                : ramp(1 - t, 0, 0.25);
          // Later (higher id) pieces lie on top: lift by id so overlaps resolve stably.
          const h = prof * (0.75 + 0.25 * id);
          if (h > best) {
            best = h;
            l.h[i] = prof;
            l.m[i] = 1;
            l.id[i] = id / Math.max(1e-6, dens);
          }
        }
    });
  });
}

export const pebbles = (o: Omit<ScatterOptions, 'shape'>): Stamp =>
  scatter({ ...o, shape: 'dome' });

export interface StrataOptions {
  /** Mean layer thickness, metres. */
  readonly thickness: number;
  /** ± share of thickness each layer varies, 0..1. */
  readonly jitter?: number;
  /** 0..1: how much each layer's face bulges (eroded ledges) vs stays flat. */
  readonly ledge?: number;
  readonly seed?: number;
}

/** Sedimentary bands along U (rock faces, cliffs, cut banks): recessed joints, one id per layer. */
export function strata(o: StrataOptions): Stamp {
  return stamp(`strata(${o.thickness})`, (ctx, l) => {
    const seed = ctx.seed + (o.seed ?? 0) * 7919;
    const jit = o.jitter ?? 0.5;
    const bounds = [0];
    for (let k = 0; (bounds[k] ?? 0) < ctx.metresV; k++)
      bounds.push((bounds[k] ?? 0) + o.thickness * (1 - jit / 2 + jit * hash2(k, 11, seed)));
    const ledge = o.ledge ?? 0.6;
    eachTexel(ctx, (i, _xm, ym) => {
      let k = 0;
      while ((bounds[k + 1] ?? Number.POSITIVE_INFINITY) <= ym) k++;
      const y0 = bounds[k] ?? 0;
      const t = (ym - y0) / Math.max(1e-6, (bounds[k + 1] ?? y0 + 1) - y0);
      const face = Math.sin(Math.PI * t) ** 0.35;
      l.h[i] = (1 - ledge) * ramp(Math.min(t, 1 - t), 0.02, 0.1) + ledge * face * (1 - 0.35 * t);
      l.m[i] = 1;
      l.id[i] = hash2(k, 13, seed);
    });
  });
}
