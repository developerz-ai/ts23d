// A terrain as a regular grid of heights in metres, the working surface for erosion and colouring:
// sample it from any height function, read it back bilinearly at any (x, y) for `heightfield`
// (so every LOD meshes the SAME eroded terrain at its own density), and relax it with thermal
// erosion (material above the talus slope slides down). `flow`/`deposit` come from hydraulic
// erosion and drive terrain colouring.

import { count, invalid } from './check.ts';

export interface TerrainGrid {
  /** Points along X and Y (cells + 1). Row-major: index = j · nx + i. */
  readonly nx: number;
  readonly ny: number;
  /** [minX, minY, maxX, maxY] in metres. */
  readonly rect: readonly [number, number, number, number];
  readonly z: Float64Array;
  /** Water passage per point, 0..1 (rivers, gullies). Set by hydraulicErosion. */
  readonly flow?: Float64Array;
  /** Sediment laid down per point, 0..1 (scree fans, valley fill). Set by hydraulicErosion. */
  readonly deposit?: Float64Array;
}

export interface TerrainGridOptions {
  readonly rect: readonly [number, number, number, number];
  /** Cells per side (points = cells + 1); 256 ≈ 8 m on a 2 km tile. */
  readonly cells: number;
  readonly height: (x: number, y: number) => number;
}

export function terrainGrid(o: TerrainGridOptions): TerrainGrid {
  const [x0, y0, x1, y1] = o.rect;
  if (!(x1 > x0 && y1 > y0))
    invalid(
      `terrain rect [${o.rect.join(', ')}] is empty`,
      'pass [minX, minY, maxX, maxY] with max > min',
    );
  const n = count('terrain cells', o.cells, 2, 4096);
  const z = new Float64Array((n + 1) * (n + 1));
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      const h = o.height(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * j) / n);
      if (!Number.isFinite(h))
        invalid(`terrain height is ${h} at point (${i}, ${j})`, 'return a finite height in metres');
      z[j * (n + 1) + i] = h;
    }
  return { nx: n + 1, ny: n + 1, rect: o.rect, z };
}

/** Bilinear reader of any per-point map of the grid, clamped at the edges, in metres. */
export function sampler(g: TerrainGrid, map: Float64Array = g.z): (x: number, y: number) => number {
  const [x0, y0, x1, y1] = g.rect;
  const sx = (g.nx - 1) / (x1 - x0);
  const sy = (g.ny - 1) / (y1 - y0);
  return (x, y) => {
    const fx = Math.min(g.nx - 1, Math.max(0, (x - x0) * sx));
    const fy = Math.min(g.ny - 1, Math.max(0, (y - y0) * sy));
    const i = Math.min(g.nx - 2, Math.floor(fx));
    const j = Math.min(g.ny - 2, Math.floor(fy));
    const u = fx - i;
    const v = fy - j;
    const k = j * g.nx + i;
    const a = map[k] ?? 0;
    const b = map[k + 1] ?? 0;
    const c = map[k + g.nx] ?? 0;
    const d = map[k + g.nx + 1] ?? 0;
    return a + (b - a) * u + (c + (d - c) * u - (a + (b - a) * u)) * v;
  };
}

/** Slope (rise / run, tan of the angle) at every point, by central differences. */
export function slopeMap(g: TerrainGrid): Float64Array {
  const [x0, y0, x1, y1] = g.rect;
  const dx = (x1 - x0) / (g.nx - 1);
  const dy = (y1 - y0) / (g.ny - 1);
  const out = new Float64Array(g.z.length);
  for (let j = 0; j < g.ny; j++)
    for (let i = 0; i < g.nx; i++) {
      const l = g.z[j * g.nx + Math.max(0, i - 1)] ?? 0;
      const r = g.z[j * g.nx + Math.min(g.nx - 1, i + 1)] ?? 0;
      const b = g.z[Math.max(0, j - 1) * g.nx + i] ?? 0;
      const t = g.z[Math.min(g.ny - 1, j + 1) * g.nx + i] ?? 0;
      const sx = (r - l) / (dx * (Math.min(g.nx - 1, i + 1) - Math.max(0, i - 1)));
      const sy = (t - b) / (dy * (Math.min(g.ny - 1, j + 1) - Math.max(0, j - 1)));
      out[j * g.nx + i] = Math.sqrt(sx * sx + sy * sy);
    }
  return out;
}

export interface ThermalOptions {
  /** Stable slope as rise/run: 0.7 ≈ 35° (scree's angle of repose). Default 0.7. */
  readonly talus?: number;
  readonly iterations?: number;
  /** Share of the excess moved per iteration, 0..0.5. Default 0.4. */
  readonly rate?: number;
}

/**
 * Thermal erosion: wherever a neighbour sits lower than the talus slope allows, part of the
 * excess slides down to it. Every iteration reads the old heights and writes a new array, so the
 * result is independent of visiting order.
 */
export function thermalErosion(g: TerrainGrid, o: ThermalOptions = {}): TerrainGrid {
  const talus = o.talus ?? 0.7;
  const rate = Math.min(0.5, Math.max(0, o.rate ?? 0.4));
  const iterations = count('thermal iterations', o.iterations ?? 30, 0, 10000);
  const [x0, , x1] = g.rect;
  const cell = (x1 - x0) / (g.nx - 1);
  const D = [-1, 0, 1, 0, 0, -1, 0, 1, -1, -1, 1, -1, -1, 1, 1, 1];
  const limit = D.map((_, k) => (k < 8 ? talus * cell : talus * cell * Math.SQRT2));
  let z = Float64Array.from(g.z);
  for (let it = 0; it < iterations; it++) {
    const next = Float64Array.from(z);
    for (let j = 1; j < g.ny - 1; j++)
      for (let i = 1; i < g.nx - 1; i++) {
        const k = j * g.nx + i;
        const h = z[k] ?? 0;
        let total = 0;
        let most = 0;
        for (let d = 0; d < 16; d += 2) {
          const ex = h - (z[k + (D[d] ?? 0) + (D[d + 1] ?? 0) * g.nx] ?? 0) - (limit[d] ?? 0);
          if (ex > 0) {
            total += ex;
            if (ex > most) most = ex;
          }
        }
        if (total <= 0) continue;
        const move = rate * most;
        next[k] = (next[k] ?? 0) - move;
        for (let d = 0; d < 16; d += 2) {
          const n = k + (D[d] ?? 0) + (D[d + 1] ?? 0) * g.nx;
          const ex = h - (z[n] ?? 0) - (limit[d] ?? 0);
          if (ex > 0) next[n] = (next[n] ?? 0) + (move * ex) / total;
        }
      }
    z = next;
  }
  return { ...g, z };
}
