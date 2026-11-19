import { describe, expect, it } from 'bun:test';
import { VertexGrid } from './belt-bodies.ts';
import { beltSeam } from './belt-seam.ts';

const LIMITS = { colour: 0.01, uv: 1 / 512 };

/** `n` vertices 0.1 m apart along x, all facing +z; vertex v's twin is v + 1 (the last has none). */
function row(n: number, colour: (v: number) => number, u: (v: number) => number = () => 0.5) {
  const mesh = {
    positions: Float32Array.from({ length: n * 3 }, (_, i) => (i % 3 === 0 ? (i / 3) * 0.1 : 0)),
    normals: Float32Array.from({ length: n * 3 }, (_, i) => (i % 3 === 2 ? 1 : 0)),
    colors: Float32Array.from({ length: n * 3 }, (_, i) => colour(Math.floor(i / 3))),
    uvs: Float32Array.from({ length: n * 2 }, (_, i) =>
      i % 2 === 0 ? u(Math.floor(i / 2)) : 0.25,
    ),
  };
  const twins = Int32Array.from({ length: n }, (_, v) => (v + 1 < n ? v + 1 : -1));
  return { mesh, twins, grid: new VertexGrid(mesh.positions, 1e-3) };
}

describe('beltSeam', () => {
  it('counts the vertices whose twin differs in colour or in UV, and reports the worst', () => {
    // A gradient along the belt (mud by position): every vertex is 0.05 off its twin.
    const shaded = row(5, (v) => 0.2 + 0.05 * v);
    const look = beltSeam(shaded.mesh, shaded.twins, shaded.grid, 1e-3, LIMITS);
    expect(look.off).toBe(4);
    expect(look.colour).toBeCloseTo(0.05, 6);
    expect(look.uv).toBe(0);
    const moved = row(
      5,
      () => 0.3,
      (v) => (v === 2 ? 0.75 : 0.5),
    );
    const uv = beltSeam(moved.mesh, moved.twins, moved.grid, 1e-3, LIMITS);
    // Vertex 1 lands on the moved one, the moved one on vertex 3.
    expect(uv.off).toBe(2);
    expect(uv.uv).toBeCloseTo(0.25, 6);
    expect(uv.colour).toBe(0);
  });

  it('passes a belt that looks the same on every link, within the limits', () => {
    const even = row(5, (v) => 0.3 + (v % 2) * 0.005);
    expect(beltSeam(even.mesh, even.twins, even.grid, 1e-3, LIMITS)).toEqual({
      off: 0,
      colour: expect.closeTo(0.005, 6),
      uv: 0,
    });
  });

  it('compares with whichever vertex on the twin spot looks nearest (a UV seam)', () => {
    // Vertices 0 and 1 sit on one point with two UVs, so do 2 and 3 one pitch on; the twin search
    // gave both of the first pair vertex 2.
    const mesh = {
      positions: Float32Array.of(0, 0, 0, 0, 0, 0, 0.1, 0, 0, 0.1, 0, 0),
      normals: Float32Array.of(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1),
      colors: new Float32Array(12).fill(0.3),
      uvs: Float32Array.of(0, 0.25, 1, 0.25, 0, 0.25, 1, 0.25),
    };
    const grid = new VertexGrid(mesh.positions, 1e-3);
    const twins = Int32Array.of(2, 2, -1, -1);
    expect(beltSeam(mesh, twins, grid, 1e-3, LIMITS).off).toBe(0);
    // A vertex on the spot that faces another way is not the twin.
    const turned = { ...mesh, normals: Float32Array.of(0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0) };
    expect(beltSeam(turned, twins, grid, 1e-3, LIMITS)).toMatchObject({ off: 1, uv: 1 });
  });
});
