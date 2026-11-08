// Texture DSL organic stamps: imbricated scales (reptile, dragon, fish, pine-cone) and hair or fur
// strands. Scales sit in rows along U, each row offset half a scale and overlapping the row below
// (the free edge points world-down, −V); the row above lies on top, so every scale rises from its
// root to a proud free edge — the sawtooth that makes scales read. Strands run along V (down the
// surface), clump and wave by noise, and carry one tone id per strand. Tileable along U.

import { fbm, hash2 } from '../paint/noise.ts';
import { type TexContext, TexField } from './field.ts';
import { eachTexel, lattice } from './generators.ts';
import type { Stamp } from './stamps.ts';

type Layers = { readonly h: Float32Array; readonly id: Float32Array; readonly m: Float32Array };

function memoStamp(name: string, paint: (ctx: TexContext, l: Layers) => void): Stamp {
  const memo = new WeakMap<TexContext, Layers>();
  const get = (ctx: TexContext): Layers => {
    const hit = memo.get(ctx);
    if (hit) return hit;
    const n = ctx.w * ctx.h;
    const l = { h: new Float32Array(n), id: new Float32Array(n), m: new Float32Array(n) };
    paint(ctx, l);
    memo.set(ctx, l);
    return l;
  };
  return {
    height: new TexField((ctx) => get(ctx).h, `${name}.height`),
    id: new TexField((ctx) => get(ctx).id, `${name}.id`),
    mask: new TexField((ctx) => get(ctx).m, `${name}.mask`),
  };
}

export interface ScalesOptions {
  /** Scale width along U, metres (snapped to a whole number per tile). */
  readonly width: number;
  /** Row pitch along V, metres (each scale is longer: it overlaps the row below). */
  readonly height: number;
  /** Share of a scale's length hidden under the row above, 0..0.8. Default 0.4. */
  readonly overlap?: number;
  /** 0 round free edge … 1 pointed (dragon, pangolin). Default 0.3. */
  readonly point?: number;
  readonly seed?: number;
}

/** Overlapping scales in offset rows; `id` per scale, `mask` 0 only in the slivers between. */
export function scales(o: ScalesOptions): Stamp {
  return memoStamp(`scales(${o.width}×${o.height})`, (ctx, l) => {
    const { n, cell } = lattice(ctx, o.width);
    const seed = ctx.seed + (o.seed ?? 0) * 7919;
    const len = o.height / (1 - Math.min(0.8, o.overlap ?? 0.4));
    const point = o.point ?? 0.3;
    eachTexel(ctx, (i, xm, ym) => {
      const r0 = Math.floor(ym / o.height);
      // Rows r0 … r0+2 may cover this texel (scales hang down from their row's top); higher on top.
      for (let r = r0 + 2; r >= r0; r--) {
        const top = (r + 1) * o.height;
        const t = (top - ym) / len; // 0 at the root, 1 at the free edge
        if (t < 0 || t > 1) continue;
        const u = xm / cell + (r % 2 ? 0.5 : 0);
        const col = Math.floor(u);
        const s = Math.abs(u - col - 0.5) * 2; // 0 centre … 1 side
        // Outline: full width near the root, closing to a round/pointed tip at t = 1.
        const half = Math.sqrt(Math.max(0, 1 - t ** (2 + 4 * point))) * (1 - 0.35 * point * t);
        if (s > half) continue;
        const edge = Math.min(1, (half - s) * 6, (1 - t) * 8);
        l.h[i] = (0.35 + 0.65 * t) * edge + 0.2 * (1 - s * s) * (1 - t);
        l.id[i] = hash2(((col % n) + n) % n, r, seed);
        l.m[i] = 1;
        return;
      }
    });
  });
}

export interface StrandsOptions {
  /** Strand spacing along U, metres (hair ≈ 0.002–0.004, fur 0.003–0.006). */
  readonly width: number;
  /** Mean strand length along V, metres. */
  readonly length: number;
  /** 0..1 how strongly strands gather into locks. Default 0.5. */
  readonly clump?: number;
  /** Metres of sideways wave (curl). Default 0.01. */
  readonly wave?: number;
  readonly seed?: number;
}

/** Hair / fur: fine ridges along V that clump into locks; `id` is a per-strand tone. */
export function strands(o: StrandsOptions): Stamp {
  return memoStamp(`strands(${o.width})`, (ctx, l) => {
    const seed = ctx.seed + (o.seed ?? 0) * 7919;
    const fine = Math.max(o.width, (2 * ctx.metresU) / ctx.w);
    const { n, cell } = lattice(ctx, fine);
    const lock = lattice(ctx, fine * 8);
    const flow = lattice(ctx, o.length);
    const clump = o.clump ?? 0.5;
    const wave = o.wave ?? 0.01;
    eachTexel(ctx, (i, xm, ym) => {
      const bend = wave * fbm(xm / flow.cell, ym / o.length, flow.n, seed + 3, 3);
      const x = xm + bend;
      const lk = fbm(x / lock.cell, ym / (o.length * 2), lock.n, seed + 5, 2);
      const u = x / cell;
      const ridge = 1 - Math.abs(fbm(u, ym / o.length, n, seed, 2));
      const lockShape = 1 - Math.abs(lk);
      l.h[i] = ridge ** 2 * (1 - clump + clump * lockShape);
      l.id[i] = hash2(((Math.floor(u) % n) + n) % n, 17, seed + 7);
      l.m[i] = 1;
    });
  });
}
