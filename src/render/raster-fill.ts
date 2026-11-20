// Scan conversion shared by the contact sheet's per-pixel rasterisers (opaque and see-through):
// project a part's vertices once, walk each triangle's covered pixel centres in a fixed order,
// z-test, and hand the visitor the pixel's barycentric weights. Every camera here is affine
// (orthographic, or the blueprint's oblique projection), so screen-space barycentrics ARE the
// perspective-correct attribute weights: no 1/w divide is needed. Also the exact linear → sRGB
// byte encode by table search, so a per-pixel colour costs no `pow`.

import { dmath } from '../core/index.ts';

/** Screen x, y and depth per vertex, as the camera projects them. */
export interface Projected {
  readonly X: Float64Array;
  readonly Y: Float64Array;
  readonly Z: Float64Array;
}

export function projectAll(
  project: (p: [number, number, number]) => readonly number[],
  positions: Float32Array,
): Projected {
  const n = positions.length / 3;
  const X = new Float64Array(n);
  const Y = new Float64Array(n);
  const Z = new Float64Array(n);
  for (let v = 0; v < n; v++) {
    const p = project([
      positions[v * 3] ?? 0,
      positions[v * 3 + 1] ?? 0,
      positions[v * 3 + 2] ?? 0,
    ]);
    X[v] = p[0] ?? 0;
    Y[v] = p[1] ?? 0;
    Z[v] = p[2] ?? 0;
  }
  return { X, Y, Z };
}

/**
 * Called per covered pixel `k` nearer than `depth[k]`, with the weights of vertices a, b, c.
 * Returns true when it wrote the pixel; the fill then stores `z` as its depth.
 */
export type Visit = (k: number, w0: number, w1: number, w2: number) => boolean;

/** Rasterise triangle (a, b, c) of `p` into a `width` × `height` depth buffer. */
export function fill(
  depth: Float32Array,
  width: number,
  height: number,
  p: Projected,
  a: number,
  b: number,
  c: number,
  visit: Visit,
): void {
  const ax = p.X[a] ?? 0;
  const ay = p.Y[a] ?? 0;
  const bx = p.X[b] ?? 0;
  const by = p.Y[b] ?? 0;
  const cx = p.X[c] ?? 0;
  const cy = p.Y[c] ?? 0;
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (Math.abs(area) < 1e-9) return;
  const az = p.Z[a] ?? 0;
  const bz = p.Z[b] ?? 0;
  const cz = p.Z[c] ?? 0;
  const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(ax, bx, cx)));
  const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(ay, by, cy)));
  for (let y = minY; y <= maxY; y++) {
    const py = y + 0.5;
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area;
      const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = w0 * az + w1 * bz + w2 * cz;
      const k = y * width + x;
      if (z >= (depth[k] ?? Infinity)) continue;
      if (visit(k, w0, w1, w2)) depth[k] = z;
    }
  }
}

/** T[k] (k = 1…255): the least linear value whose sRGB byte is k, i.e. the decode of k − ½. */
const T = new Float64Array(256).map((_, k) => {
  const s = (k - 0.5) / 255;
  return k === 0 ? -Infinity : s <= 0.04045 ? s / 12.92 : dmath.pow((s + 0.055) / 1.055, 2.4);
});

/** Linear 0–1 → sRGB byte, rounded to nearest (what `round(255 · encode(v))` gives), by search. */
export function srgb8(v: number): number {
  if (!(v >= (T[1] ?? 0))) return 0;
  let lo = 1;
  let hi = 255;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (v >= (T[mid] ?? 0)) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
