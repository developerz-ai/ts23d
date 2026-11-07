// Every primitive winds its triangles counter-clockwise seen from the side its normals face:
// engines cull by winding, so a reflected transform (lathe axis 'x'/'y' once) renders inside-out.

import { describe, expect, it } from 'bun:test';
import { type Mesh, MeshBuilder, triangleCount, type Vec2, type Vec3 } from '../core/index.ts';
import { beam } from './beam.ts';
import { box } from './box.ts';
import { cell } from './cell.ts';
import { windingFlips } from './closed.ts';
import { heightfield } from './heightfield.ts';
import { cylinder, lathe } from './lathe.ts';
import { lattice } from './lattice.ts';
import { loft, ringXY } from './loft.ts';
import { planar } from './planar.ts';
import { prism } from './prism.ts';
import { sweep } from './sweep.ts';
import { tiled } from './tiled.ts';

const C: Vec3 = [1, 1, 1];
const L: Vec2[] = [
  [0, 0],
  [2, 0],
  [2, 1],
  [1, 1],
  [1, 2],
  [0, 2],
];

/** (centroid − axis point) · winding normal > 0 for every triangle of a lathe about `axis`. */
function inwardAboutAxis(m: Mesh, axis: 0 | 1 | 2): number {
  let bad = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const p = [0, 1, 2].map((j) =>
      [0, 1, 2].map((k) => m.positions[(m.indices[t + j] ?? 0) * 3 + k] ?? 0),
    );
    const [a = [], b = [], c = []] = p;
    const e = [0, 1, 2].map((k) => (b[k] ?? 0) - (a[k] ?? 0));
    const f = [0, 1, 2].map((k) => (c[k] ?? 0) - (a[k] ?? 0));
    const g = [0, 1, 2].map((k) => {
      const [i, j] = [(k + 1) % 3, (k + 2) % 3];
      return (e[i] ?? 0) * (f[j] ?? 0) - (e[j] ?? 0) * (f[i] ?? 0);
    });
    const r = [0, 1, 2].map((k) =>
      k === axis ? 0 : ((a[k] ?? 0) + (b[k] ?? 0) + (c[k] ?? 0)) / 3,
    );
    const s = r.reduce((sum, x, k) => sum + x * (g[k] ?? 0), 0);
    if (Math.hypot(...r) > 1e-6 && s <= 0) bad++;
  }
  return bad;
}

describe('winding', () => {
  it('catches an inside-out triangle (the check can fail)', () => {
    const b = new MeshBuilder();
    const ids = (
      [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
      ] as const
    ).map((p) => b.vertex({ p, n: [0, 0, 1], uv: [0, 0], color: C }));
    b.tri(ids[0] ?? 0, ids[2] ?? 0, ids[1] ?? 0);
    expect(windingFlips(b.build())).toBe(1);
  });

  it('lathe winds outward about every axis (sides and caps)', () => {
    for (const [axis, k] of [
      ['x', 0],
      ['y', 1],
      ['z', 2],
    ] as const) {
      const m = cylinder({ radius: 0.5, length: 1, segments: 16, axis, color: C });
      expect(windingFlips(m)).toBe(0);
      const sides = lathe({
        profile: [
          [0.5, -0.5],
          [0.5, 0.5],
        ],
        segments: 16,
        axis,
        color: C,
      });
      expect(triangleCount(sides)).toBe(32);
      expect(inwardAboutAxis(sides, k)).toBe(0);
    }
  });

  it('lathe splits normals at a sharp profile fold instead of averaging them inside out', () => {
    // The T-34 idler disc (recipes/t34/t34.ts wheelHalf, r 0.3): the face runs inward along the dish,
    // then folds sharply up into the hub. Averaged normals there point against one band.
    const r = 0.3; // IDLER.r
    const h = 0.085;
    const face: Vec2[] = [
      [r - 0.07, h - 0.005],
      [r * 0.72, h - 0.04],
      [r * 0.36, h - 0.05],
      [r * 0.3, h - 0.01],
      [r * 0.2, h + 0.03],
      [r * 0.1, h + 0.045],
      [0, h + 0.05],
    ];
    const profile: Vec2[] = [...face.map(([fr, fz]): Vec2 => [fr, -fz]).reverse(), ...face];
    expect(
      windingFlips(lathe({ profile, segments: 24, color: C, creaseDeg: 180 })),
    ).toBeGreaterThan(0);
    for (const axis of ['x', 'y', 'z'] as const)
      expect(windingFlips(lathe({ profile, segments: 16, color: C, axis }))).toBe(0);
    // A smooth profile is unchanged by the crease logic: one ring per point.
    const smooth: Vec2[] = [
      [0.5, 0],
      [0.52, 0.1],
      [0.5, 0.2],
    ];
    expect(lathe({ profile: smooth, segments: 8, color: C }).positions.length).toBe(3 * 9 * 3);
  });

  it('every primitive agrees with its normals', () => {
    const meshes: [string, Mesh][] = [
      ['box', box({ size: [1, 2, 3], color: C })],
      ['box bevel', box({ size: [1, 2, 3], color: C, bevel: 0.1 })],
      ['beam', beam({ from: [0, 0, 0], to: [1, 2, 3], width: 0.2, color: C })],
      ['beam round', beam({ from: [0, 0, 0], to: [1, 2, 3], width: 0.2, segments: 8, color: C })],
      ...(['xy', 'xz', 'yz'] as const).map((plane): [string, Mesh] => [
        `prism ${plane}`,
        prism({ profile: L, depth: 1, plane, color: C }),
      ]),
      [
        'planar',
        planar({
          points: [
            [0, 0, 0],
            [1, 0, 0],
            [1, 1, 1],
            [0, 1, 1],
          ],
          color: C,
          doubleSided: true,
        }),
      ],
      [
        'sweep',
        sweep({
          section: { radius: 0.2, segments: 8 },
          path: [
            [0, 0, 0],
            [1, 0, 1],
            [2, 1, 1],
          ],
          color: C,
        }),
      ],
      [
        'loft',
        loft({ rings: [ringXY([0, 0, 0], 1, 1, 8), ringXY([0, 0, 1], 0.5, 0.5, 8)], color: C }),
      ],
      [
        'heightfield',
        heightfield({
          rect: [0, 0, 4, 4],
          cells: [4, 4],
          height: (x, y) => Math.sin(x) * y * 0.1,
          color: C,
        }),
      ],
      [
        'tiled',
        tiled({ origin: [0, 0, 0], u: [1, 1, 0], v: [0, 0, 2], color: C, doubleSided: true }),
      ],
      [
        'cell recess',
        cell({
          origin: [0, 0, 0],
          u: [0, 1, 0],
          v: [0, 0, 1],
          color: C,
          cell: 'window_sash',
          inset: 0.1,
        }),
      ],
      [
        'cell plaque',
        cell({
          origin: [0, 0, 0],
          u: [0, 1, 0],
          v: [0, 0, 1],
          color: C,
          cell: 'sign',
          inset: -0.1,
        }),
      ],
      [
        'lattice',
        lattice({
          from: [0, 0, 0],
          to: [6, 2, 1],
          depth: 1,
          width: 1,
          chord: 0.1,
          pattern: 'x',
          section: 'angle',
          color: C,
        }),
      ],
    ];
    for (const [name, m] of meshes) expect([name, windingFlips(m)]).toEqual([name, 0]);
  });
});
