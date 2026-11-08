// Test fixtures for /neural (not exported): a split-normal box in the glTF frame.

import { type Mesh, MeshBuilder } from '../core/index.ts';

/** Axis-aligned box centred on the origin, 24 vertices (hard edges), outward CCW faces. */
export function cube(size: readonly [number, number, number] = [1, 1, 1]): Mesh {
  const b = new MeshBuilder();
  const [hx, hy, hz] = size.map((s) => s / 2) as [number, number, number];
  const faces: Array<
    [[number, number, number], [number, number, number], [number, number, number]]
  > = [
    [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    [
      [-1, 0, 0],
      [0, 0, 1],
      [0, 1, 0],
    ],
    [
      [0, 1, 0],
      [0, 0, 1],
      [1, 0, 0],
    ],
    [
      [0, -1, 0],
      [1, 0, 0],
      [0, 0, 1],
    ],
    [
      [0, 0, 1],
      [1, 0, 0],
      [0, 1, 0],
    ],
    [
      [0, 0, -1],
      [0, 1, 0],
      [1, 0, 0],
    ],
  ];
  for (const [n, u, v] of faces) {
    const corner = (su: number, sv: number): number =>
      b.vertex({
        p: [0, 1, 2].map(
          (k) => ((n[k] ?? 0) + (u[k] ?? 0) * su + (v[k] ?? 0) * sv) * ([hx, hy, hz][k] ?? 0),
        ) as [number, number, number],
        n,
        uv: [(su + 1) / 2, (sv + 1) / 2],
        color: [0.8, 0.5, 0.3],
      });
    b.quad(corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1));
  }
  return b.build();
}
