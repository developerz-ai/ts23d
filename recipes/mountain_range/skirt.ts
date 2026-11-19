// The tile's cut sides, built from the surface's own border row: each wall's top vertices copy the
// border vertices' positions exactly, at the mesh's own resolution, so the skirt's top edge is
// the heightfield's edge to the bit at every LOD. (`heightfield`'s built-in skirt re-samples the
// height walking the east and north edges back from the far corner, so its x/y differ from the
// surface row by float error there: a skirt whose top is not quite the surface's edge.)

import { type Mesh, MeshBuilder, merge, type Vec3 } from '@developerz.ai/ts23d';

/**
 * Walls from the border of a `heightfield` surface mesh (no skirt; its first (cx + 1)(cy + 1)
 * vertices are the grid, row-major) straight down to z = `base`, flat-shaded, normals out,
 * counter-clockwise seen from outside; returned merged with the surface. Every border point must
 * stand above `base`.
 */
export function withSkirt(surface: Mesh, cells: readonly [number, number], base: number): Mesh {
  const [cx, cy] = cells;
  const row = cx + 1;
  if (surface.positions.length < row * (cy + 1) * 3)
    throw new RangeError(
      `withSkirt: the surface has ${surface.positions.length / 3} vertices, fewer than its ` +
        `${row} × ${cy + 1} grid; pass the heightfield built with these cells`,
    );
  const at = (i: number, j: number): number => j * row + i;
  // Walking counter-clockwise seen from above (outside on the right): south, east, north, west.
  const sides: [number[], Vec3][] = [
    [Array.from({ length: row }, (_, i) => at(i, 0)), [0, -1, 0]],
    [Array.from({ length: cy + 1 }, (_, j) => at(cx, j)), [1, 0, 0]],
    [Array.from({ length: row }, (_, i) => at(cx - i, cy)), [0, 1, 0]],
    [Array.from({ length: cy + 1 }, (_, j) => at(0, cy - j)), [-1, 0, 0]],
  ];
  const P = surface.positions;
  const b = new MeshBuilder();
  for (const [ids, n] of sides) {
    const top = ids.map((k): Vec3 => [P[k * 3] ?? 0, P[k * 3 + 1] ?? 0, P[k * 3 + 2] ?? 0]);
    const low = top.find((p) => p[2] <= base);
    if (low)
      throw new RangeError(
        `withSkirt: border point (${low[0]}, ${low[1]}) at z ${low[2]} is not above the base ` +
          `${base}; lower the base under the tile's lowest edge point`,
      );
    const color = (k: number): Vec3 => [
      surface.colors[k * 3] ?? 0,
      surface.colors[k * 3 + 1] ?? 0,
      surface.colors[k * 3 + 2] ?? 0,
    ];
    const wall = top.map((p, i) => {
      const c = color(ids[i] ?? 0);
      return [
        b.vertex({ p, n, uv: [0, 1], color: c }),
        b.vertex({ p: [p[0], p[1], base], n, uv: [0, 0], color: c }),
      ] as const;
    });
    for (let i = 0; i + 1 < wall.length; i++) {
      const [ta, ba] = wall[i] ?? [0, 0];
      const [tb, bb] = wall[i + 1] ?? [0, 0];
      b.quad(ba, bb, tb, ta);
    }
  }
  return merge([surface, b.build()]);
}
