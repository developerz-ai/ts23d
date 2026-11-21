// Weathered slates cluster where wind gets under them (D593): at the eaves, under the ridge and
// in patches, not as grey squares sprinkled evenly over the slope. Measured on the slates the
// roof actually loses or ages: a Clark–Evans nearest-neighbour ratio on the median distance (≈ 1
// random, < 1 clustered; the median, so one stray slate cannot swing it) and the share within 1.2 m of the eaves or the ridge. Failure first: the same number
// of slates sprinkled uniformly fails both.

import { describe, expect, it } from 'bun:test';
import { createRng, dmath, type Mesh } from '@developerz.ai/ts23d';
import { HALF_X, HALF_Y } from './plan.ts';
import { OVERHANG, PITCH, RIDGE, roofSlopes } from './roof.ts';

const UL = (HALF_X + OVERHANG) * 2;
const VL = (HALF_Y + OVERHANG) / dmath.cos(PITCH);

/** Clark–Evans ratio: median nearest-neighbour distance ÷ the mean expected for a random set. */
function clarkEvans(pts: readonly [number, number][]): number {
  const nn = pts.map((p, i) =>
    Math.min(...pts.filter((_, j) => j !== i).map((q) => dmath.hypot(p[0] - q[0], p[1] - q[1]))),
  );
  const sorted = [...nn].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  return median / (0.5 * Math.sqrt((UL * VL) / pts.length));
}

const edgeShare = (pts: readonly [number, number][]): number =>
  pts.filter(([, v]) => v < 1.2 || v > VL - 1.2).length / pts.length;

const clustered = (pts: readonly [number, number][]): boolean =>
  clarkEvans(pts) < 0.7 && edgeShare(pts) >= 0.55;

const weathered = (seed: number): [number, number][] => {
  const fates: [number, number][] = [];
  roofSlopes(0, 1, [], createRng(seed), undefined, fates);
  return fates;
};

describe('weathered slates', () => {
  it('fails an even sprinkle of the same count', () => {
    const n = weathered(1).length;
    const rng = createRng(99);
    const even = Array.from({ length: n }, (): [number, number] => [
      rng.range(0, UL),
      rng.range(0, VL),
    ]);
    expect(clustered(even)).toBe(false);
  });

  for (const seed of [1, 2, 3, 4])
    it(`seed ${seed}: cluster at the eaves, the ridge and in patches`, () => {
      const pts = weathered(seed);
      expect(pts.length).toBeGreaterThanOrEqual(8);
      expect(clarkEvans(pts)).toBeLessThan(0.7);
      expect(edgeShare(pts)).toBeGreaterThanOrEqual(0.55);
    });
});

/** Faces of `m` looking along ±X at `u` on the slope, within 0.4 m of `v` down it (s = +1 slope). */
function sideFaces(m: Mesh, u: number, v: number, nx: 1 | -1): number {
  const at = (i: number): [number, number, number] => [
    m.positions[i * 3] ?? 0,
    m.positions[i * 3 + 1] ?? 0,
    m.positions[i * 3 + 2] ?? 0,
  ];
  const [dy, dz] = [dmath.cos(PITCH), -dmath.sin(PITCH)];
  let hits = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [at(m.indices[t] ?? 0), at(m.indices[t + 1] ?? 0), at(m.indices[t + 2] ?? 0)];
    const e: [number, number, number] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const f: [number, number, number] = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [e[1] * f[2] - e[2] * f[1], e[2] * f[0] - e[0] * f[2], e[0] * f[1] - e[1] * f[0]];
    const l = dmath.hypot(n[0] ?? 0, n[1] ?? 0, n[2] ?? 0) || 1;
    if (((n[0] ?? 0) / l) * nx < 0.95) continue;
    const cu = (a[0] + b[0] + c[0]) / 3 + HALF_X + OVERHANG;
    const cv = ((a[1] + b[1] + c[1]) / 3) * dy + ((a[2] + b[2] + c[2]) / 3 - RIDGE) * dz;
    if (Math.abs(cu - u) < 0.05 && Math.abs(cv - v) < 0.4) hits++;
  }
  return hits;
}

/** Sides of present neighbours that face a weathered slate's place and are left open. */
function openEdges(m: Mesh, fates: readonly [number, number][]): { open: number; seen: number } {
  let [open, seen] = [0, 0];
  for (const [u, v] of fates) {
    if (u < 0.8 || u > UL - 0.8) continue;
    for (const side of [-1, 1] as const) {
      const other = fates.some(
        ([x, y]) => Math.abs(y - v) < 1e-6 && Math.abs(x - u - side * 0.5) < 0.01,
      );
      if (other) continue;
      seen++;
      if (sideFaces(m, u + side * 0.26, v, side === -1 ? 1 : -1) === 0) open++;
    }
  }
  return { open, seen };
}

describe('slates beside a gap', () => {
  it('fails a neighbour with its side face stripped', () => {
    const fates: [number, number][] = [];
    const m = roofSlopes(0, 1, [], createRng(1), undefined, fates);
    if (!m) throw new Error('no roof');
    const none: Mesh = { ...m, indices: new Uint32Array(0) };
    expect(openEdges(none, fates).open).toBeGreaterThan(0);
  });

  for (const seed of [1, 2, 3, 4])
    it(`seed ${seed}: every slate beside a gap keeps the side facing it`, () => {
      const fates: [number, number][] = [];
      const m = roofSlopes(0, 1, [], createRng(seed), undefined, fates);
      if (!m) throw new Error('no roof');
      const r = openEdges(m, fates);
      expect(r.seen).toBeGreaterThan(0);
      expect(r.open).toBe(0);
    });
});
