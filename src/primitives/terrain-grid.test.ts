import { describe, expect, it } from 'bun:test';
import { dmath } from '../core/index.ts';
import { type TerrainGrid, terrainGrid, thermalErosion } from './terrain-grid.ts';

const maxChange = (a: TerrainGrid, b: TerrainGrid): number =>
  a.z.reduce((m, v, i) => Math.max(m, Math.abs(v - (b.z[i] ?? 0))), 0);

/** The pre-fix relaxation: one cell size (X) for the talus limit in every direction. */
function uniformCell(
  g: TerrainGrid,
  talus: number,
  iterations: number,
  rate: number,
): Float64Array {
  const cell = (g.rect[2] - g.rect[0]) / (g.nx - 1);
  const D = [-1, 0, 1, 0, 0, -1, 0, 1, -1, -1, 1, -1, -1, 1, 1, 1];
  const limit = D.map((_, k) => (k < 8 ? talus * cell : talus * cell * Math.SQRT2));
  let z = Float64Array.from(g.z);
  for (let it = 0; it < iterations; it++) {
    const next = Float64Array.from(z);
    for (let j = 1; j < g.ny - 1; j++)
      for (let i = 1; i < g.nx - 1; i++) {
        const k = j * g.nx + i;
        const h = z[k] ?? 0;
        const ex = (d: number): number =>
          h - (z[k + (D[d] ?? 0) + (D[d + 1] ?? 0) * g.nx] ?? 0) - (limit[d] ?? 0);
        let total = 0;
        let most = 0;
        for (let d = 0; d < 16; d += 2)
          if (ex(d) > 0) {
            total += ex(d);
            most = Math.max(most, ex(d));
          }
        if (total <= 0) continue;
        next[k] = (next[k] ?? 0) - rate * most;
        for (let d = 0; d < 16; d += 2) {
          const n = k + (D[d] ?? 0) + (D[d + 1] ?? 0) * g.nx;
          if (ex(d) > 0) next[n] = (next[n] ?? 0) + (rate * most * ex(d)) / total;
        }
      }
    z = next;
  }
  return z;
}

describe('thermalErosion on a non-square rect', () => {
  it('leaves a slope below the talus alone when the cells are long in Y', () => {
    // 100 × 1000 m: cells 3.125 m in X, 31.25 m in Y. A 0.5 ramp along Y is under talus 0.7.
    const g = terrainGrid({ rect: [0, 0, 100, 1000], cells: 32, height: (_, y) => y * 0.5 });
    expect(maxChange(g, thermalErosion(g, { talus: 0.7, iterations: 50 }))).toBe(0);
  });

  it('relaxes a slope above the talus when the cells are long in X', () => {
    // 1000 × 100 m: a ramp of 2 along Y with a flat shelf on top, far past talus 0.7.
    const g = terrainGrid({
      rect: [0, 0, 1000, 100],
      cells: 32,
      height: (_, y) => Math.min(y, 50) * 2,
    });
    expect(maxChange(g, thermalErosion(g, { talus: 0.7, iterations: 50 }))).toBeGreaterThan(1);
  });

  it('keeps every bit of a square grid (terrain recipes are square)', () => {
    const g = terrainGrid({
      rect: [-1000, -1000, 1000, 1000],
      cells: 48,
      height: (x, y) => Math.max(0, 900 - dmath.hypot(x, y) * 1.3) + 40 * dmath.sin(x / 90),
    });
    const out = thermalErosion(g, { talus: 0.7, iterations: 25 });
    expect(maxChange(g, out)).toBeGreaterThan(1);
    expect(Bun.hash(out.z)).toBe(Bun.hash(uniformCell(g, 0.7, 25, 0.4)));
  });
});
