import { describe, expect, test } from 'bun:test';
import { createRng, type Mesh, MeshBuilder, type Vec3 } from '../core/index.ts';
import { strandCells } from '../material/index.ts';
import { writeMeshGlb } from '../neural/index.ts';
import { groomCards } from './groom-cards.ts';
import { reframe } from './groom-guides.ts';

// A 10 cm ball head; cards are 2-column strips from a buried root going up and back (ts23d frame).
const R = 0.1;
const ball = (p: Vec3): number => Math.hypot(...p) - R;

function card(b: MeshBuilder, root: Vec3, dir: Vec3, len: number, rows = 5): void {
  const side: Vec3 = [0, 0.005, 0];
  let first = -1;
  for (let k = 0; k < rows; k++) {
    const s = k / (rows - 1);
    const p: Vec3 = [
      root[0] + dir[0] * len * s,
      root[1] + dir[1] * len * s,
      root[2] + dir[2] * len * s,
    ];
    const l = b.vertex({
      p: [p[0] - side[0], p[1] - side[1], p[2] - side[2]],
      n: [0, 0, 1],
      uv: [0, s],
      color: [1, 1, 1],
    });
    b.vertex({
      p: [p[0] + side[0], p[1] + side[1], p[2] + side[2]],
      n: [0, 0, 1],
      uv: [1, s],
      color: [1, 1, 1],
    });
    if (first < 0) first = l;
  }
  for (let k = 0; k < rows - 1; k++) {
    const a = first + k * 2;
    b.quad(a, a + 1, a + 3, a + 2);
  }
}
const glbOf = (m: Mesh, name = 'groom_hair'): Uint8Array =>
  writeMeshGlb([
    {
      name,
      mesh: { ...m, positions: reframe(m.positions, true), normals: reframe(m.normals, true) },
    },
  ]);
function cards(dir: Vec3 = [-0.6, 0, 0.8], root: Vec3 = [0, 0, R - 0.002]): Uint8Array {
  const b = new MeshBuilder();
  card(b, root, dir, 0.06);
  card(b, [0.02, 0.01, Math.sqrt(R * R - 0.0005) - 0.002], dir, 0.05);
  return glbOf(b.build());
}
const opts = (over: Partial<Parameters<typeof groomCards>[1]> = {}) => ({
  color: [0.4, 0.25, 0.1] as Vec3,
  scalp: ball,
  collide: ball,
  maxTriangles: 100,
  centre: [0, 0, 0] as Vec3,
  rng: createRng(3),
  ...over,
});
const why = (f: () => unknown): string => {
  try {
    f();
  } catch (e) {
    return `${String(e)} ${(e as { fix?: string }).fix ?? ''}`;
  }
  return 'did not throw';
};

describe('groomCards: refusals first', () => {
  test('over the triangle cap', () => {
    expect(why(() => groomCards(cards(), opts({ maxTriangles: 10 })))).toMatch(
      /T3D_NEURAL_OUTPUT_INVALID.*16 triangles, cap 10/,
    );
  });
  test('a root off the scalp', () => {
    expect(why(() => groomCards(cards([-0.6, 0, 0.8], [0, 0, R + 0.03]), opts()))).toMatch(
      /roots 30\.0 mm off the scalp/,
    );
  });
  test('a card through the head (the face)', () => {
    expect(why(() => groomCards(cards([0, 0, -1]), opts()))).toMatch(/inside the head/);
  });
  test('no cards, no root row', () => {
    expect(why(() => groomCards(writeMeshGlb([]), opts()))).toMatch(/no cards/);
    const b = new MeshBuilder();
    const v = [0, 1, 2].map((i) =>
      b.vertex({ p: [0, i * 0.01, R], n: [0, 0, 1], uv: [0, 0.5], color: [1, 1, 1] }),
    );
    b.tri(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
    expect(why(() => groomCards(glbOf(b.build()), opts()))).toMatch(/no root row/);
  });
});

describe('groomCards: mapping', () => {
  test('cards land in hair_clumps hair cells, root → tip along atlas U, back in the ts23d frame', () => {
    const out = groomCards(cards(), opts());
    expect(out.cards).toBe(2);
    expect(out.triangles).toBe(16);
    const cells = strandCells('hair_clumps', 'hair');
    const m = out.mesh;
    for (let i = 0; i < m.uvs.length / 2; i++) {
      const [u, v] = [m.uvs[i * 2] ?? 0, m.uvs[i * 2 + 1] ?? 0];
      expect(
        cells.some(
          (c) => u >= c.u0 - 1e-6 && u <= c.u1 + 1e-6 && v >= c.v0 - 1e-6 && v <= c.v1 + 1e-6,
        ),
      ).toBe(true);
    }
    // Vertex 0 is the first card's root, vertex 8 its tip: U grows, Z (ts23d up) grows.
    expect(m.uvs[8 * 2] ?? 0).toBeGreaterThan(m.uvs[0] ?? 0);
    expect(m.positions[8 * 3 + 2] ?? 0).toBeGreaterThan(m.positions[2] ?? 0);
    expect(
      Math.abs(ball([m.positions[0] ?? 0, m.positions[1] ?? 0, m.positions[2] ?? 0])),
    ).toBeLessThan(0.006);
    // Tips are lighter than roots (tone ramp).
    expect(m.colors[8 * 3] ?? 0).toBeGreaterThan(m.colors[0] ?? 0);
  });
  test('a groom_wisp node maps into wisp cells; same bytes, same mesh', () => {
    const b = new MeshBuilder();
    card(b, [0, 0, R - 0.002], [-0.6, 0, 0.8], 0.06);
    const out = groomCards(glbOf(b.build(), 'groom_wisp'), opts());
    const wisp = strandCells('hair_clumps', 'wisp');
    const u = out.mesh.uvs[0] ?? 0;
    expect(wisp.some((c) => u >= c.u0 - 1e-6 && u <= c.u1 + 1e-6)).toBe(true);
    const again = groomCards(cards(), opts());
    expect(
      Buffer.from(again.mesh.uvs.buffer).equals(
        Buffer.from(groomCards(cards(), opts()).mesh.uvs.buffer),
      ),
    ).toBe(true);
  });
  test('every triangle faces the way its vertex normals point, whatever the tool wound', () => {
    for (const dir of [
      [-0.6, 0, 0.8],
      [0.6, 0, 0.8],
    ] as Vec3[]) {
      const m = groomCards(cards(dir), opts()).mesh;
      for (let t = 0; t < m.indices.length; t += 3) {
        const [a, b, c] = [0, 1, 2].map((k) => m.indices[t + k] ?? 0) as [number, number, number];
        const P = (i: number): Vec3 => [
          m.positions[i * 3] ?? 0,
          m.positions[i * 3 + 1] ?? 0,
          m.positions[i * 3 + 2] ?? 0,
        ];
        const [pa, pb, pc] = [P(a), P(b), P(c)];
        const e1 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
        const e2 = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
        const n = [
          (e1[1] ?? 0) * (e2[2] ?? 0) - (e1[2] ?? 0) * (e2[1] ?? 0),
          (e1[2] ?? 0) * (e2[0] ?? 0) - (e1[0] ?? 0) * (e2[2] ?? 0),
          (e1[0] ?? 0) * (e2[1] ?? 0) - (e1[1] ?? 0) * (e2[0] ?? 0),
        ];
        const vn = [0, 1, 2].map(
          (k) =>
            (m.normals[a * 3 + k] ?? 0) + (m.normals[b * 3 + k] ?? 0) + (m.normals[c * 3 + k] ?? 0),
        );
        expect(
          (n[0] ?? 0) * (vn[0] ?? 0) + (n[1] ?? 0) * (vn[1] ?? 0) + (n[2] ?? 0) * (vn[2] ?? 0),
        ).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
