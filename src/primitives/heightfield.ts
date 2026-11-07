// Terrain from a height function over a rectangle: hills, embankments, spoil heaps, battlefield
// ground for presentation scenes. Smooth normals by central differences; UVs tile in metres.
// `cells` is the LOD knob — a recipe passes fewer cells at LOD 1/2. `skirt` drops walls from
// the edges to a base height: a solid map tile / diorama block that stands on z = 0.
//   triangles = 2 · cx · cy + (skirt ? 4 · (cx + cy) : 0)

import { type Mesh, MeshBuilder, normalize, type Vec3 } from '../core/index.ts';
import { type StripId, stripRect } from '../material/index.ts';
import { mirroredV, stripVMetres } from './strip-uv.ts';

export interface HeightfieldOptions {
  /** [minX, minY, maxX, maxY] in metres. */
  readonly rect: readonly [number, number, number, number];
  readonly cells: readonly [number, number];
  readonly height: (x: number, y: number) => number;
  /** Vertex colour per point (e.g. darker in ruts, greener on slopes). */
  readonly color: Vec3 | ((x: number, y: number, z: number) => Vec3);
  readonly strip?: StripId;
  /** Close the sides down to this z (e.g. 0): flat-shaded walls, outward normals. */
  readonly skirt?: number;
  /** Wall colour; default: the terrain colour at the top edge. */
  readonly skirtColor?: Vec3;
}

export function heightfield(o: HeightfieldOptions): Mesh {
  const [x0, y0, x1, y1] = o.rect;
  const [nx, ny] = o.cells;
  const dx = (x1 - x0) / nx;
  const dy = (y1 - y0) / ny;
  const rect = stripRect(o.strip ?? 'plain');
  const vm = stripVMetres(o.strip ?? 'plain');
  const b = new MeshBuilder();
  const ids: number[] = [];
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = x0 + i * dx;
      const y = y0 + j * dy;
      const z = o.height(x, y);
      const n = normalize([
        o.height(x - dx, y) - o.height(x + dx, y),
        o.height(x, y - dy) - o.height(x, y + dy),
        2 * Math.min(dx, dy),
      ]);
      const color = typeof o.color === 'function' ? o.color(x, y, z) : o.color;
      const u = (x - x0) / rect.metres;
      ids.push(
        b.vertex({
          p: [x, y, z],
          n,
          // V mirrors every band: continuous, so no triangle straddles a wrap and smears the strip.
          uv: [rect.u0 + u * (rect.u1 - rect.u0), mirroredV(rect, y - y0, vm)],
          color,
        }),
      );
    }
  }
  const at = (i: number, j: number): number => ids[j * (nx + 1) + i] ?? 0;
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) b.quad(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
  if (o.skirt !== undefined) skirt(b, o, rect);
  return b.build();
}

/** Four walls from the edge vertices down to `o.skirt`, each quad CCW seen from outside. */
function skirt(b: MeshBuilder, o: HeightfieldOptions, rect: ReturnType<typeof stripRect>): void {
  const [x0, y0, x1, y1] = o.rect;
  const [nx, ny] = o.cells;
  const base = o.skirt ?? 0;
  // Edge: start corner, step per cell, cell count, outward normal. Walking CCW seen from above,
  // outside is on the right, so (top a, top b, base b, base a) reversed is CCW from outside.
  const edges: [number, number, number, number, number, Vec3][] = [
    [x0, y0, (x1 - x0) / nx, 0, nx, [0, -1, 0]],
    [x1, y0, 0, (y1 - y0) / ny, ny, [1, 0, 0]],
    [x1, y1, -(x1 - x0) / nx, 0, nx, [0, 1, 0]],
    [x0, y1, 0, -(y1 - y0) / ny, ny, [-1, 0, 0]],
  ];
  const col = (x: number, y: number, z: number): Vec3 =>
    o.skirtColor ?? (typeof o.color === 'function' ? o.color(x, y, z) : o.color);
  const v = (x: number, y: number, z: number, n: Vec3, u: number, color: Vec3): number =>
    b.vertex({
      p: [x, y, z],
      n,
      uv: [rect.u0 + (u / rect.metres) * (rect.u1 - rect.u0), z > base ? rect.v1 : rect.v0],
      color,
    });
  let run = 0;
  for (const [sx, sy, dx, dy, n, nrm] of edges) {
    const step = Math.hypot(dx, dy);
    for (let k = 0; k < n; k++) {
      const [ax, ay, bx, by] = [sx + dx * k, sy + dy * k, sx + dx * (k + 1), sy + dy * (k + 1)];
      const az = o.height(ax, ay);
      const bz = o.height(bx, by);
      const ca = col(ax, ay, az);
      const cb = col(bx, by, bz);
      const ta = v(ax, ay, az, nrm, run, ca);
      const tb = v(bx, by, bz, nrm, run + step, cb);
      b.quad(v(ax, ay, base, nrm, run, ca), v(bx, by, base, nrm, run + step, cb), tb, ta);
      run += step;
    }
  }
}
