// Shared growth helpers for foliage cells: quadratic stem curves sampled into points, per-leaf
// colour jitter and the leaf palettes (linear RGB). Allocation is per leaf/stem, never per pixel.

import type { Rng } from '../../core/index.ts';
import type { Foliage, Rgb } from './foliage-raster.ts';

/** A quadratic Bézier from p0 via p1 to p2, metres in the cell (anchor usually 0.5, 0.02). */
export interface Curve {
  readonly x: readonly number[];
  readonly y: readonly number[];
  /** Tangent angle per sample (0 = +V, + toward +U), the convention `Foliage.leaf` takes. */
  readonly a: readonly number[];
}

export function curve(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  n = 16,
): Curve {
  const x: number[] = [];
  const y: number[] = [];
  const a: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    x.push(u * u * x0 + 2 * u * t * x1 + t * t * x2);
    y.push(u * u * y0 + 2 * u * t * y1 + t * t * y2);
    const dx = 2 * u * (x1 - x0) + 2 * t * (x2 - x1);
    const dy = 2 * u * (y1 - y0) + 2 * t * (y2 - y1);
    a.push(Math.atan2(dx, dy));
  }
  return { x, y, a };
}

/** Sample index nearest parameter t ∈ [0, 1]. */
export const at = (c: Curve, t: number): number => Math.round(t * (c.x.length - 1));

/** Draw a curve as a tapered stem. */
export function drawStem(f: Foliage, c: Curve, w0: number, w1: number, col: Rgb): void {
  const n = c.x.length - 1;
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    f.stem(
      c.x[i] ?? 0,
      c.y[i] ?? 0,
      c.x[i + 1] ?? 0,
      c.y[i + 1] ?? 0,
      w0 + (w1 - w0) * t0,
      w0 + (w1 - w0) * t1,
      col,
    );
  }
}

/** Jitter a colour per leaf: brightness ±amt and a small hue drift between R and G. */
export function vary(rng: Rng, col: Rgb, amt: number): Rgb {
  const k = 1 + amt * (rng.next() * 2 - 1);
  const drift = 1 + amt * 0.6 * (rng.next() * 2 - 1);
  return [col[0] * k * drift, col[1] * k, (col[2] * k) / drift];
}

export const dim = (col: Rgb, k: number): Rgb => [col[0] * k, col[1] * k, col[2] * k];

/** Leaf palettes, linear RGB (multiply by a near-white vertex colour on the card). */
export const LEAF = {
  beech: [0.09, 0.2, 0.035] as Rgb,
  maple: [0.1, 0.24, 0.04] as Rgb,
  birch: [0.16, 0.3, 0.05] as Rgb,
  acacia: [0.11, 0.2, 0.06] as Rgb,
  palm: [0.12, 0.22, 0.05] as Rgb,
  dry: [0.3, 0.2, 0.08] as Rgb,
  spruce: [0.035, 0.09, 0.04] as Rgb,
  pine: [0.06, 0.13, 0.04] as Rgb,
  willow: [0.2, 0.3, 0.08] as Rgb,
  reed: [0.2, 0.28, 0.08] as Rgb,
  snow: [0.85, 0.88, 0.92] as Rgb,
  bark: [0.08, 0.055, 0.035] as Rgb,
  twig: [0.12, 0.09, 0.05] as Rgb,
} as const;

/** Autumn maple: each leaf picks one of these, then gets jittered. */
export const AUTUMN: readonly Rgb[] = [
  [0.6, 0.08, 0.02],
  [0.75, 0.25, 0.02],
  [0.8, 0.45, 0.03],
  [0.45, 0.04, 0.03],
  [0.55, 0.35, 0.05],
];
