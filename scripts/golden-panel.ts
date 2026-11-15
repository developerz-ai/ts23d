// Golden set, step 3: the blind panel. Each asset's variants are tiled into one image in a
// shuffled order (seeded by the asset id, so a reviewer cannot tell the original by position),
// numbered 1..n; three independent reviews score every tile with the critique rubric, and the
// median per tile and criterion becomes the panel score stored beside the metric vector.

import { encodePng } from '../src/core/index.ts';
import { drawText } from '../src/render/index.ts';

/** Deterministic permutation of 0..n−1 from a string (FNV-1a + xorshift Fisher–Yates). */
export function shuffleFor(key: string, n: number): number[] {
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ (ch.codePointAt(0) ?? 0), 16777619) >>> 0;
  const out = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    h >>>= 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j] ?? j, out[i] ?? i];
  }
  return out;
}

export interface Tile {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

/** Tiles in a 3-wide grid, each numbered from 1 in its top-left corner, as one PNG. */
export function panelSheet(tiles: readonly Tile[]): Uint8Array {
  const first = tiles[0];
  if (!first) throw new Error('golden: a panel sheet needs at least one tile');
  const { width: w, height: h } = first;
  const cols = Math.min(3, tiles.length);
  const rows = Math.ceil(tiles.length / cols);
  const W = cols * w;
  const px = new Uint8Array(W * rows * h * 4).fill(255);
  tiles.forEach((t, k) => {
    if (t.width !== w || t.height !== h) throw new Error('golden: panel tiles differ in size');
    const [ox, oy] = [(k % cols) * w, Math.floor(k / cols) * h];
    for (let y = 0; y < h; y++)
      px.set(t.rgba.subarray(y * w * 4, (y + 1) * w * 4), ((oy + y) * W + ox) * 4);
    drawText(px, W, ox + 12, oy + 12, String(k + 1), 4, [200, 20, 20]);
  });
  return encodePng(W, rows * h, px);
}

export type PanelScore = Readonly<Record<string, number>>;

/** One review file: tile scores per asset group, tiles keyed "1".."n". */
export interface Review {
  readonly reviewer: string;
  readonly scores: Readonly<Record<string, Readonly<Record<string, PanelScore>>>>;
}

const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] ?? 0) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
};

/**
 * Median panel score per row id (`<group>:<variant>`) and target, from independent reviews and
 * each group's tile key (tile k shows variant key[k−1]). Rows missing from any review are left out.
 */
export function panelMedians(
  reviews: readonly Review[],
  keys: Readonly<Record<string, readonly string[]>>,
  targets: readonly string[],
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const [group, key] of Object.entries(keys))
    key.forEach((variant, k) => {
      const tiles = reviews.map((r) => r.scores[group]?.[String(k + 1)]);
      if (!reviews.length || tiles.some((t) => !t)) return;
      const row: Record<string, number> = {};
      for (const t of targets) {
        const xs = tiles.map((s) => s?.[t]);
        if (xs.some((x) => typeof x !== 'number' || !(x >= 0 && x <= 10)))
          throw new Error(
            `golden: ${group} tile ${k + 1} '${t}' is not a score 0–10 in every review`,
          );
        row[t] = median(xs as number[]);
      }
      out[`${group}:${variant}`] = row;
    });
  return out;
}
