// The mountain tile's height field: which window of an endless seeded alpine field the tile shows,
// and its erosion. The field is a function of world position (tile point + `offset`), so a tile
// next to this one (same seed, offset ± 2000 m) samples the same raw function along the shared cut.
// Erosion runs on the tile plus a `MARGIN` all round and the tile is cropped out of it: every
// tile point, the border row included, is an interior point of the erosion. (Eroding the tile
// alone left its border row the one row thermal erosion never relaxes: the droplets' 8 m gouges
// stood there as a saw-tooth along the skirt's top.) Nothing then touches the boundary: no
// lowering, blur or pinning, the mesh's edge is the eroded field itself.

import {
  dmath,
  fbm,
  gradientNoise2,
  hydraulicErosion,
  type Rng,
  ridged,
  type TerrainGrid,
  terrainGrid,
  thermalErosion,
  warp,
} from '@developerz.ai/ts23d';
import { despike } from '../_lib/terrain/ground.ts';

/** Altitude (m above sea level) of z = 0. */
export const DATUM = 1650;
const HALF = 1000;
export const RECT = [-HALF, -HALF, HALF, HALF] as const;
/** Grid cells across the tile (~7.8 m) and the extra cells eroded round it (250 m). */
const CELLS = 256;
const MARGIN = 32;

export interface FieldParams {
  /** Unit direction of the main valley in plan (through the field's origin). */
  readonly valley: readonly [number, number];
  /** Valley floor and ridge relief, m. */
  readonly floor: number;
  readonly relief: number;
  /** Where the tile's centre sits in the field, m: which window of the range the tile shows. */
  readonly offset: readonly [number, number];
  /** Hydraulic droplets on the 257² grid (~2 per point carves strongly). */
  readonly droplets: number;
}

/**
 * The uneroded field in tile coordinates, z relative to `DATUM`: ridged multifractal (sharp
 * ridgelines, smooth lows), domain-warped so ranges fold, over a U-shaped glacial trough along
 * `valley` that meanders by up to 300 m, plus low fBm hills.
 */
export function fieldHeight(rng: Rng, p: Readonly<FieldParams>): (x: number, y: number) => number {
  const [vx, vy] = p.valley;
  const [ox, oy] = p.offset;
  const wx = fbm(gradientNoise2(rng.fork('warp-x')), { scale: 900, octaves: 3 });
  const wy = fbm(gradientNoise2(rng.fork('warp-y')), { scale: 900, octaves: 3 });
  const range = warp(
    ridged(gradientNoise2(rng.fork('range')), { scale: 1700, octaves: 6, gain: 0.35 }),
    wx,
    wy,
    350,
  );
  const hills = fbm(gradientNoise2(rng.fork('hills')), { scale: 700, octaves: 5 });
  return (tx, ty) => {
    const x = tx + ox;
    const y = ty + oy;
    const along = x * vx + y * vy;
    const across = -x * vy + y * vx - 300 * wx(along * 0.7, 0);
    const d = Math.min(1, dmath.pow(across / 450, 2));
    const alt = p.floor + p.relief * range(x, y) * (0.2 + 0.8 * d) + 60 * hills(x, y) + 120 * d;
    return alt - DATUM;
  };
}

/** The `margin`-point border cut off a grid: the inner points, with their flow and deposit. */
export function crop(g: TerrainGrid, margin: number): TerrainGrid {
  const [x0, y0, x1, y1] = g.rect;
  const sx = (x1 - x0) / (g.nx - 1);
  const sy = (y1 - y0) / (g.ny - 1);
  const nx = g.nx - 2 * margin;
  const ny = g.ny - 2 * margin;
  const cut = (m: Float64Array): Float64Array => {
    const out = new Float64Array(nx * ny);
    for (let j = 0; j < ny; j++)
      out.set(m.subarray((j + margin) * g.nx + margin, (j + margin) * g.nx + margin + nx), j * nx);
    return out;
  };
  return {
    nx,
    ny,
    rect: [x0 + margin * sx, y0 + margin * sy, x1 - margin * sx, y1 - margin * sy],
    z: cut(g.z),
    ...(g.flow ? { flow: cut(g.flow) } : {}),
    ...(g.deposit ? { deposit: cut(g.deposit) } : {}),
  };
}

/**
 * The tile's working grid (256 cells, ~7.8 m), cropped from the eroded tile + margin: hydraulic
 * droplets (`droplets` per tile area) carve gullies and drop fans, thermal erosion caps cliffs at
 * 45°, single-point needles are clamped (twice: the second pass catches the neighbour the first
 * exposed).
 */
export function tileField(rng: Rng, p: Readonly<FieldParams>): TerrainGrid {
  const pad = (HALF * MARGIN * 2) / CELLS;
  const n = CELLS + 2 * MARGIN;
  const wide = terrainGrid({
    rect: [RECT[0] - pad, RECT[1] - pad, RECT[2] + pad, RECT[3] + pad],
    cells: n,
    height: fieldHeight(rng, p),
  });
  const droplets = Math.round((p.droplets * n * n) / (CELLS * CELLS));
  let g = hydraulicErosion(wide, rng.fork('erosion'), { droplets });
  g = thermalErosion(g, { talus: 1, iterations: 25 });
  g = despike(despike(g, 8), 8);
  return crop(g, MARGIN);
}
