import { describe, expect, it } from 'bun:test';
import { type Mesh, MeshBuilder } from '../core/index.ts';
import { optimize } from './optimize.ts';
import { cacheStats, forsyth } from './optimize-cache.ts';

/** A grid of quads with every quad's 4 vertices emitted separately (worst case for the cache). */
function soup(n: number): Mesh {
  const b = new MeshBuilder();
  const v = (x: number, y: number) =>
    b.vertex({ p: [x, y, 0], n: [0, 0, 1], uv: [x / n, y / n], color: [0.5, 0.5, 0.5] });
  // Column-major order so the input is cache-hostile.
  for (let x = 0; x < n; x++)
    for (let y = 0; y < n; y++) b.quad(v(x, y), v(x + 1, y), v(x + 1, y + 1), v(x, y + 1));
  return b.build();
}

const sortedTris = (m: Mesh): string[] => {
  const out: string[] = [];
  for (let t = 0; t < m.indices.length; t += 3) {
    const pts = [0, 1, 2].map((k) => {
      const i = m.indices[t + k] ?? 0;
      return [0, 1, 2].map((c) => (m.positions[i * 3 + c] ?? 0).toFixed(4)).join(',');
    });
    // Rotation-invariant, winding-preserving: start at the smallest corner.
    const r = pts.indexOf([...pts].sort()[0] ?? '');
    out.push([0, 1, 2].map((k) => pts[(r + k) % 3]).join('|'));
  }
  return out.sort();
};

describe('optimize', () => {
  it('drops degenerate and duplicate triangles, keeps double-sided ones', () => {
    const b = new MeshBuilder();
    const v = (x: number, y: number) =>
      b.vertex({ p: [x, y, 0], n: [0, 0, 1], uv: [0, 0], color: [1, 1, 1] });
    const [a, c, d] = [v(0, 0), v(1, 0), v(0, 1)];
    const line = v(2, 0);
    b.tri(a, c, d).tri(c, d, a).tri(a, c, line).tri(a, a, c).tri(a, d, c);
    const { report, mesh } = optimize(b.build());
    expect(report.degenerate).toBe(2);
    expect(report.duplicate).toBe(1);
    expect(mesh.indices.length / 3).toBe(2);
  });

  it('keeps hard edges: vertices with different normals never weld', () => {
    const b = new MeshBuilder();
    const p: [number, number, number] = [0, 0, 0];
    b.vertex({ p, n: [0, 0, 1], uv: [0, 0], color: [1, 1, 1] });
    b.vertex({ p, n: [1, 0, 0], uv: [0, 0], color: [1, 1, 1] });
    b.vertex({ p: [1, 0, 0], n: [0, 0, 1], uv: [0, 0], color: [1, 1, 1] });
    b.vertex({ p: [0, 1, 0], n: [0, 0, 1], uv: [0, 0], color: [1, 1, 1] });
    b.tri(0, 2, 3).tri(1, 2, 3);
    expect(optimize(b.build()).report.verticesAfter).toBe(4);
  });

  it('welds a triangle soup and lowers ACMR without changing the surface', () => {
    const m = soup(16);
    const { mesh, report } = optimize(m);
    expect(report.verticesBefore).toBe(16 * 16 * 4);
    expect(report.verticesAfter).toBe(17 * 17);
    expect(report.acmr).toBeLessThan(report.acmrBefore);
    expect(report.acmr).toBeLessThan(0.8);
    expect(report.atvr).toBeLessThan(1.3);
    expect(sortedTris(mesh)).toEqual(sortedTris(m));
  });

  it('is deterministic', () => {
    const a = optimize(soup(12)).mesh;
    const b = optimize(soup(12)).mesh;
    expect(Bun.hash(a.indices)).toBe(Bun.hash(b.indices));
    expect(Bun.hash(a.positions)).toBe(Bun.hash(b.positions));
  });

  it('forsyth beats input order on a cache-hostile strip, and ACMR math is right', () => {
    // A single triangle: 3 misses / 1 tri.
    expect(cacheStats(Uint32Array.from([0, 1, 2]), 3).acmr).toBe(3);
    const m = optimize(soup(20), { vertexCache: false }).mesh;
    const re = forsyth(m.indices, m.positions.length / 3);
    const n = m.positions.length / 3;
    expect(cacheStats(re, n).acmr).toBeLessThan(cacheStats(m.indices, n).acmr);
  });
});
