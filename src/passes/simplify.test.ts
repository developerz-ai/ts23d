import { describe, expect, test } from 'bun:test';
import { type Mesh, MeshBuilder, Ts23dError, triangleCount } from '../core/index.ts';
import { simplify } from './simplify.ts';

/** A cube's faces subdivided n×n and pushed onto a bumpy sphere: closed, welded, no seams. */
function blob(n: number, r = 0.5): Mesh {
  const b = new MeshBuilder();
  const ids = new Map<string, number>();
  const at = (x: number, y: number, z: number): number => {
    const l = Math.hypot(x, y, z);
    const [ux, uy, uz] = [x / l, y / l, z / l];
    const k = `${ux.toFixed(6)},${uy.toFixed(6)},${uz.toFixed(6)}`;
    const hit = ids.get(k);
    if (hit !== undefined) return hit;
    const rr = r * (1 + 0.08 * Math.sin(5 * ux) * Math.cos(4 * uz));
    const id = b.vertex({
      p: [ux * rr, uy * rr, uz * rr],
      n: [ux, uy, uz],
      uv: [0, 0],
      color: [0.6, 0.5, 0.4],
    });
    ids.set(k, id);
    return id;
  };
  const faces: Array<[number[], number[], number[]]> = [
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
  for (const [nn, u, v] of faces) {
    const p = (i: number, j: number): number => {
      const s = (i / n) * 2 - 1;
      const t = (j / n) * 2 - 1;
      const c = [0, 1, 2].map((k) => (nn[k] ?? 0) + (u[k] ?? 0) * s + (v[k] ?? 0) * t);
      return at(c[0] ?? 0, c[1] ?? 0, c[2] ?? 0);
    };
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) b.quad(p(i, j), p(i + 1, j), p(i + 1, j + 1), p(i, j + 1));
  }
  return b.build();
}

/** Flat n×n grid in XY with UVs and a colour seam down x = 0.5 (split vertices). */
function sheet(n: number): Mesh {
  const b = new MeshBuilder();
  const v = (i: number, j: number, side: number): number =>
    b.vertex({
      p: [i / n, j / n, 0],
      n: [0, 0, 1],
      uv: [i / n, j / n],
      color: side ? [1, 0, 0] : [0, 0, 1],
    });
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const side = i < n / 2 ? 0 : 1;
      b.quad(v(i, j, side), v(i + 1, j, side), v(i + 1, j + 1, side), v(i, j + 1, side));
    }
  return b.build();
}

function edges(m: Mesh): Map<string, number> {
  const key = (i: number): string =>
    [0, 1, 2].map((k) => (m.positions[i * 3 + k] ?? 0).toFixed(5)).join(',');
  const e = new Map<string, number>();
  for (let t = 0; t < m.indices.length; t += 3)
    for (let k = 0; k < 3; k++) {
      const a = key(m.indices[t + k] ?? 0);
      const c = key(m.indices[t + ((k + 1) % 3)] ?? 0);
      const id = a < c ? `${a}|${c}` : `${c}|${a}`;
      e.set(id, (e.get(id) ?? 0) + 1);
    }
  return e;
}

describe('simplify', () => {
  test('rejects a bad target', () => {
    expect(() => simplify(blob(4), { targetTris: -1 })).toThrow(Ts23dError);
    expect(() => simplify(blob(4), { targetTris: 1.5 })).toThrow('T3D_SIMPLIFY_INVALID');
  });
  test('hits the target within 5% and keeps a closed mesh closed', () => {
    const m = blob(24); // 6912 triangles
    for (const target of [3000, 1000, 300]) {
      const s = simplify(m, { targetTris: target }).mesh;
      const n = triangleCount(s);
      expect(n).toBeLessThanOrEqual(target);
      expect(n).toBeGreaterThanOrEqual(target * 0.95);
      expect([...edges(s).values()].every((c) => c === 2)).toBe(true);
    }
  });
  test('keeps the shape: every simplified vertex stays on the original surface', () => {
    const s = simplify(blob(24), { targetTris: 500 }).mesh;
    for (let i = 0; i < s.positions.length; i += 3) {
      const r = Math.hypot(s.positions[i] ?? 0, s.positions[i + 1] ?? 0, s.positions[i + 2] ?? 0);
      expect(r).toBeGreaterThan(0.45);
      expect(r).toBeLessThan(0.55);
    }
  });
  test('borders keep their outline and a colour seam keeps its line', () => {
    const s = simplify(sheet(16), { targetTris: 60 }).mesh;
    expect(triangleCount(s)).toBeLessThanOrEqual(60);
    for (let i = 0; i < s.positions.length / 3; i++) {
      const x = s.positions[i * 3] ?? 0;
      const red = (s.colors[i * 3] ?? 0) > 0.5;
      // A vertex never crosses the seam: red ones at x ≥ 0.5, blue at x ≤ 0.5.
      expect(red ? x >= 0.5 - 1e-6 : x <= 0.5 + 1e-6).toBe(true);
    }
    const xs = [...s.positions].filter((_, i) => i % 3 === 0);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBe(1);
    // The four corners survive.
    const corner = (x: number, y: number): boolean =>
      [...Array(s.positions.length / 3).keys()].some(
        (i) => s.positions[i * 3] === x && s.positions[i * 3 + 1] === y,
      );
    expect([corner(0, 0), corner(1, 0), corner(0, 1), corner(1, 1)]).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });
  test('deterministic and a no-op at or under the target', () => {
    const m = blob(12);
    const a = simplify(m, { targetTris: 400 }).mesh;
    const b = simplify(m, { targetTris: 400 }).mesh;
    expect(Buffer.from(a.positions.buffer).equals(Buffer.from(b.positions.buffer))).toBe(true);
    expect([...a.indices]).toEqual([...b.indices]);
    expect(simplify(m, { targetTris: 10000 }).mesh).toBe(m);
  });
});
