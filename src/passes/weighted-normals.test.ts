import { describe, expect, it } from 'bun:test';
import { type Mesh, MeshBuilder, type Vec3 } from '../core/index.ts';
import { weightedNormals } from './weighted-normals.ts';

/** A cube with 8 shared vertices and (wrong) diagonal normals: the input a naive builder emits. */
function sharedCube(): Mesh {
  const b = new MeshBuilder();
  for (let i = 0; i < 8; i++) {
    const p: Vec3 = [i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1];
    const l = Math.sqrt(3);
    b.vertex({ p, n: [p[0] / l, p[1] / l, p[2] / l], uv: [0, 0], color: [1, 1, 1] });
  }
  // CCW from outside.
  for (const [a, c, d, e] of [
    [0, 2, 3, 1],
    [4, 5, 7, 6],
    [0, 1, 5, 4],
    [2, 6, 7, 3],
    [0, 4, 6, 2],
    [1, 3, 7, 5],
  ] as const)
    b.quad(a, c, d, e);
  return b.build();
}

/** A big face and a thin bevel strip meeting at 30° along x = 0. */
function bevel(): Mesh {
  const b = new MeshBuilder();
  const n: Vec3 = [0, 0, 1];
  const v = (p: Vec3) => b.vertex({ p, n, uv: [0, 0], color: [1, 1, 1] });
  const s = Math.sin(Math.PI / 6) * 0.05;
  const c = Math.cos(Math.PI / 6) * 0.05;
  const [a0, a1, a2, a3] = [v([-1, 0, 0]), v([0, 0, 0]), v([0, 1, 0]), v([-1, 1, 0])];
  const [b2, b3] = [v([c, 1, -s]), v([c, 0, -s])];
  b.quad(a0, a1, a2, a3).quad(a1, b3, b2, a2);
  return b.build();
}

const at = (m: Mesh, i: number): Vec3 => [
  m.normals[i * 3] ?? 0,
  m.normals[i * 3 + 1] ?? 0,
  m.normals[i * 3 + 2] ?? 0,
];

describe('weightedNormals', () => {
  it('smooths across every edge when hardAngle exceeds the dihedral (the blobby default)', () => {
    const m = weightedNormals(sharedCube(), { hardAngle: 100 });
    expect(m.positions.length / 3).toBe(8);
    expect(Math.abs(at(m, 0)[0])).toBeCloseTo(1 / Math.sqrt(3), 4);
  });

  it('splits hard edges: a cube gets 24 vertices with flat face normals', () => {
    const m = weightedNormals(sharedCube());
    expect(m.positions.length / 3).toBe(24);
    for (let i = 0; i < 24; i++) expect(Math.max(...at(m, i).map(Math.abs))).toBeCloseTo(1, 6);
  });

  it('lets the big face dominate a bevel: the shared edge leans < 3° off the big face', () => {
    const m = weightedNormals(bevel());
    // Vertex at the shared edge (0,0,0): first output vertex created for corner a1.
    const n = at(m, 1);
    expect(n[2]).toBeGreaterThan(Math.cos((3 * Math.PI) / 180));
    expect(m.indices.length).toBe(12);
  });
});
