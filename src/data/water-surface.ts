// A flat water surface at one level, only over the cells where the ground dips below it (rivers,
// lakes, flooded valley floors): no sheet floats over dry land, so it always meets the banks.
// Shares corner vertices; one band of the `water` strip, UVs top-down at true scale.

import { type Mesh, MeshBuilder } from '../core/index.ts';
import { hex, stripRect } from '../material/index.ts';
import type { TerrainGrid } from '../primitives/index.ts';

const WATER = hex('#3d5a63');

export function waterSurface(
  g: TerrainGrid,
  height: (x: number, y: number) => number,
  level: number,
  cells: number,
): Mesh | undefined {
  const [x0, y0, x1, y1] = g.rect;
  const dx = (x1 - x0) / cells;
  const dy = (y1 - y0) / cells;
  const r = stripRect('water');
  const b = new MeshBuilder();
  const ids = new Map<number, number>();
  const at = (i: number, j: number): number => {
    const k = j * (cells + 1) + i;
    const hit = ids.get(k);
    if (hit !== undefined) return hit;
    const x = x0 + i * dx;
    const y = y0 + j * dy;
    const id = b.vertex({
      p: [x, y, level],
      n: [0, 0, 1],
      uv: [r.u0 + ((x - x0) / r.metres) * (r.u1 - r.u0), (r.v0 + r.v1) / 2],
      color: WATER,
    });
    ids.set(k, id);
    return id;
  };
  let any = false;
  for (let j = 0; j < cells; j++)
    for (let i = 0; i < cells; i++) {
      const low = Math.min(
        height(x0 + i * dx, y0 + j * dy),
        height(x0 + (i + 1) * dx, y0 + j * dy),
        height(x0 + i * dx, y0 + (j + 1) * dy),
        height(x0 + (i + 1) * dx, y0 + (j + 1) * dy),
      );
      if (low >= level) continue;
      b.quad(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
      any = true;
    }
  return any ? b.build() : undefined;
}
