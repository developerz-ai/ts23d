// Terrain from a height function over a rectangle: hills, embankments, spoil heaps, battlefield
// ground for presentation scenes. Smooth normals by central differences; UVs tile in metres.
// `cells` is the LOD knob — a recipe passes fewer cells at LOD 1/2.

import { type Mesh, MeshBuilder, normalize, type Vec3 } from '../core/index.ts';
import { type StripId, stripRect } from '../material/index.ts';

export interface HeightfieldOptions {
  /** [minX, minY, maxX, maxY] in metres. */
  readonly rect: readonly [number, number, number, number];
  readonly cells: readonly [number, number];
  readonly height: (x: number, y: number) => number;
  /** Vertex colour per point (e.g. darker in ruts, greener on slopes). */
  readonly color: Vec3 | ((x: number, y: number, z: number) => Vec3);
  readonly strip?: StripId;
}

export function heightfield(o: HeightfieldOptions): Mesh {
  const [x0, y0, x1, y1] = o.rect;
  const [nx, ny] = o.cells;
  const dx = (x1 - x0) / nx;
  const dy = (y1 - y0) / ny;
  const rect = stripRect(o.strip ?? 'plain');
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
      const v = ((((y - y0) / rect.metres) % 1) + 1) % 1;
      ids.push(
        b.vertex({
          p: [x, y, z],
          n,
          uv: [rect.u0 + u * (rect.u1 - rect.u0), rect.v0 + v * (rect.v1 - rect.v0)],
          color,
        }),
      );
    }
  }
  const at = (i: number, j: number): number => ids[j * (nx + 1) + i] ?? 0;
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) b.quad(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
  return b.build();
}
