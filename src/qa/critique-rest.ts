// Rest areas: per-cell detail over the beauty camera's part buffer — creases, bend (small-scale
// normal turning) and triangle density — and the share of visible surface that stays calm, plus
// how unevenly detail is spread (uniform detail, everywhere or nowhere, reads as noise or blank).

import type { PartBuffer } from './critique-raster.ts';

export interface RestStats {
  /** Share of visible surface whose detail stays under the calm threshold. */
  readonly share: number;
  /** Std-dev of per-cell detail (clipped 0–2): low = uniform (all busy or all bare). */
  readonly spread: number;
  /** Cell edge in pixels and per-cell detail (NaN = not enough asset in the cell). */
  readonly cell: number;
  readonly cols: number;
  readonly rows: number;
  readonly detail: Float32Array;
}

/**
 * Calm = few creases (the normal turns > 25° to the next pixel on < 15 % of the cell: about one
 * hard edge through it), little bend (mean normal turn between neighbours < 0.05 rad ≈ 3° per
 * pixel: big smooth curvature is calm, bumps and noise are not) and less than one triangle per
 * pixel (sub-pixel tessellation shimmers). Grooves, rivets, plank seams and noise are detail.
 */
export const REST_LIMITS = {
  crease: 0.15,
  bend: 0.05,
  density: 1,
  creaseCos: Math.cos((25 * Math.PI) / 180),
} as const;

/** Per pixel: 1 = a crease to the right/lower neighbour, else the normal turn there (radians). */
function creases(buf: PartBuffer): { crease: Uint8Array; bend: Float32Array } {
  const { width: W, height: H, part, normal: N } = buf;
  const crease = new Uint8Array(W * H);
  const bend = new Float32Array(W * H);
  const dot = (i: number, j: number): number =>
    (N[i * 3] ?? 0) * (N[j * 3] ?? 0) +
    (N[i * 3 + 1] ?? 0) * (N[j * 3 + 1] ?? 0) +
    (N[i * 3 + 2] ?? 0) * (N[j * 3 + 2] ?? 0);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if ((part[i] ?? -1) < 0) continue;
      const r = x + 1 < W && (part[i + 1] ?? -1) >= 0 ? dot(i, i + 1) : 1;
      const d = y + 1 < H && (part[i + W] ?? -1) >= 0 ? dot(i, i + W) : 1;
      const m = Math.min(r, d);
      if (m < REST_LIMITS.creaseCos) crease[i] = 1;
      // Chord between unit normals ≈ the angle for small turns.
      else bend[i] = Math.sqrt(Math.max(0, 2 - 2 * m));
    }
  return { crease, bend };
}

export function restStats(buf: PartBuffer): RestStats {
  const { width: W, height: H } = buf;
  const cell = Math.max(4, Math.round(H / 56));
  const cols = Math.ceil(W / cell);
  const rows = Math.ceil(H / cell);
  const detail = new Float32Array(cols * rows).fill(Number.NaN);
  const { crease, bend } = creases(buf);
  let calm = 0;
  let total = 0;
  const ds: number[] = [];
  for (let cy = 0; cy < rows; cy++)
    for (let cx = 0; cx < cols; cx++) {
      const tris = new Set<number>();
      let n = 0;
      let c = 0;
      let k = 0;
      for (let y = cy * cell; y < Math.min(H, (cy + 1) * cell); y++)
        for (let x = cx * cell; x < Math.min(W, (cx + 1) * cell); x++) {
          const i = y * W + x;
          if ((buf.part[i] ?? -1) < 0) continue;
          n++;
          c += crease[i] ?? 0;
          k += bend[i] ?? 0;
          tris.add(buf.tri[i] ?? -1);
        }
      if (n < (cell * cell) / 2) continue;
      const d = Math.max(
        c / n / REST_LIMITS.crease,
        k / n / REST_LIMITS.bend,
        tris.size / n / REST_LIMITS.density,
      );
      detail[cy * cols + cx] = d;
      total += n;
      if (d < 1) calm += n;
      ds.push(Math.min(2, d));
    }
  const mean = ds.reduce((s, v) => s + v, 0) / Math.max(1, ds.length);
  const spread = Math.sqrt(ds.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, ds.length));
  return { share: total ? calm / total : 0, spread, cell, cols, rows, detail };
}
