import { describe, expect, it } from 'bun:test';
import { createRng, type Mesh, MeshBuilder, Ts23dError } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { weather } from './weather.ts';
import { subdivideTo } from './weather-subdivide.ts';
import { analyse } from './weather-surface.ts';

/** A 2 × 1 m plate: one quad, two triangles. */
function plate(): Mesh {
  const b = new MeshBuilder();
  const v = (x: number, y: number): number =>
    b.vertex({ p: [x, y, 0], n: [0, 0, 1], uv: [x / 2, y], color: [1, 1, 1] });
  b.quad(v(0, 0), v(2, 0), v(2, 1), v(0, 1));
  return b.build();
}
const tris = (m: Mesh): number => m.indices.length / 3;
function edges(m: Mesh): { min: number; max: number; mean: number } {
  let [min, max, sum, n] = [Infinity, 0, 0, 0];
  for (let t = 0; t < m.indices.length; t += 3)
    for (let e = 0; e < 3; e++) {
      const a = (m.indices[t + e] ?? 0) * 3;
      const b = (m.indices[t + ((e + 1) % 3)] ?? 0) * 3;
      const l = Math.hypot(
        ...[0, 1, 2].map((k) => (m.positions[a + k] ?? 0) - (m.positions[b + k] ?? 0)),
      );
      [min, max, sum, n] = [Math.min(min, l), Math.max(max, l), sum + l, n + 1];
    }
  return { min, max, mean: sum / n };
}

describe('subdivideTo exact', () => {
  it('fails if a plate costs more than the edge length asks for (halving costs 3–4 × that)', () => {
    for (const e of [0.04, 0.1, 0.25]) {
      // A grid of e × e cells, two triangles each.
      const asked = (2 * 2 * 1) / (e * e);
      const halved = tris(subdivideTo(plate(), e));
      const exact = subdivideTo(plate(), e, 10, true);
      expect(halved).toBeGreaterThan(3 * asked);
      expect(tris(exact)).toBeGreaterThanOrEqual(asked);
      expect(tris(exact)).toBeLessThan(1.16 * asked);
      const l = edges(exact);
      // Stated tolerance: mean within 15 % of the request, nothing under 0.4 × or over 1.6 ×.
      expect(Math.abs(l.mean / e - 1)).toBeLessThan(0.15);
      expect(l.min).toBeGreaterThan(0.4 * e);
      expect(l.max).toBeLessThan(1.6 * e);
    }
  });

  it('keeps the default bytes: the mode is opt-in', () => {
    const b = box({ size: [1, 0.3, 2], color: [1, 1, 1] });
    expect(subdivideTo(b, 0.1, 10, false)).toEqual(subdivideTo(b, 0.1));
    expect(subdivideTo(b, 0, 10, true)).toBe(b);
  });

  it('any triangle: same area, nothing wound backwards, every vertex used, edges ≤ 2.3 ×', () => {
    const rng = createRng(5);
    for (let n = 0; n < 400; n++) {
      const p = Array.from({ length: 6 }, () => rng.next() * 2 - 1);
      if (n % 3 === 0) {
        // Slivers: the third corner almost on the first side.
        p[4] = ((p[0] ?? 0) + (p[2] ?? 0)) / 2 + 0.01 * rng.next();
        p[5] = ((p[1] ?? 0) + (p[3] ?? 0)) / 2 + 0.02 * rng.next();
      }
      const [x0 = 0, y0 = 0, x1 = 0, y1 = 0, x2 = 0, y2 = 0] = p;
      const area = ((x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0)) / 2;
      if (Math.abs(area) < 1e-3) continue;
      const e = 0.03 + rng.next() * 0.3;
      const f = subdivideTo(
        {
          positions: new Float32Array([x0, y0, 0, x1, y1, 0, x2, y2, 0]),
          normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
          uvs: new Float32Array(6),
          colors: new Float32Array(9),
          indices: new Uint32Array([0, 1, 2]),
        },
        e,
        10,
        true,
      );
      let sum = 0;
      const used = new Set<number>();
      for (let t = 0; t < f.indices.length; t += 3) {
        const [a = 0, b = 0, c = 0] = [f.indices[t], f.indices[t + 1], f.indices[t + 2]];
        for (const v of [a, b, c]) used.add(v);
        const X = (i: number): number => f.positions[i * 3] ?? 0;
        const Y = (i: number): number => f.positions[i * 3 + 1] ?? 0;
        const s = ((X(b) - X(a)) * (Y(c) - Y(a)) - (Y(b) - Y(a)) * (X(c) - X(a))) / 2;
        expect(s * Math.sign(area)).toBeGreaterThan(-1e-6 * e * e);
        sum += s;
      }
      expect(Math.abs(sum / area - 1)).toBeLessThan(2e-3);
      expect(used.size).toBe(f.positions.length / 3);
      expect(edges(f).max).toBeLessThan(2.3 * e);
    }
  });

  it('keeps hard edges crack-free on a box (closed: V − E + F = 2) and its area', () => {
    const f = subdivideTo(box({ size: [1, 0.3, 2], color: [1, 1, 1] }), 0.13, 10, true);
    const s = analyse(f);
    expect(s.pieces).toBe(1);
    expect(s.area.reduce((t, a) => t + a, 0)).toBeCloseTo(2 * (1 * 0.3 + 1 * 2 + 0.3 * 2), 4);
    expect(s.groups - s.nbr.length / 2 + tris(f)).toBe(2);
  });

  it('interpolates skin weights (sum 1 on the 1/255 grid) and morph deltas', () => {
    const f = subdivideTo(
      {
        positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
        normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
        uvs: new Float32Array(6),
        colors: new Float32Array(9).fill(1),
        indices: new Uint32Array([0, 1, 2]),
        joints: new Uint16Array([0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0]),
        weights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
        morphs: [{ name: 'lift', positions: new Float32Array([0, 0, 0, 0, 0, 2, 0, 0, 4]) }],
      },
      0.3,
      10,
      true,
    );
    const verts = f.positions.length / 3;
    expect(verts).toBeGreaterThan(6);
    for (let v = 0; v < verts; v++) {
      const w = [0, 1, 2, 3].map((s) => f.weights?.[v * 4 + s] ?? 0);
      expect(w.reduce((s, x) => s + Math.round(x * 255), 0)).toBe(255);
      const [x = 0, y = 0] = [f.positions[v * 3], f.positions[v * 3 + 1]];
      const of = (bone: number): number =>
        [0, 1, 2, 3].reduce((s, k) => s + (f.joints?.[v * 4 + k] === bone ? (w[k] ?? 0) : 0), 0);
      expect(Math.abs(of(1) - x)).toBeLessThan(0.02);
      expect(Math.abs(of(2) - y)).toBeLessThan(0.02);
      expect(f.morphs?.[0]?.positions[v * 3 + 2]).toBeCloseTo(2 * x + 4 * y, 5);
    }
  });
});

describe("weather tessellation: 'exact'", () => {
  const door = box({ size: [0.05, 1, 2], color: [0.3, 0.4, 0.3] });
  const opts = { seed: 4, age: 0.7, effects: { dust: {}, mud: {}, chips: {} } } as const;

  it('refuses an unknown mode', () => {
    try {
      weather(door, { ...opts, tessellation: 'fine' as 'exact' });
      throw new Error('expected a Ts23dError');
    } catch (e) {
      expect(e).toBeInstanceOf(Ts23dError);
      expect((e as Ts23dError).code).toBe('T3D_RECIPE_INVALID');
      expect((e as Ts23dError).fix).toContain("'exact'");
    }
  });

  it("default is 'halving' byte for byte; 'exact' covers the same shares with fewer triangles", () => {
    const base = weather(door, opts);
    expect(weather(door, { ...opts, tessellation: 'halving' })).toEqual(base);
    const exact = weather(door, { ...opts, tessellation: 'exact' });
    expect(tris(exact.mesh)).toBeLessThan(tris(base.mesh) / 2.5);
    for (const c of exact.coverage)
      if (c.area > 0) expect(Math.abs(c.actual - c.amount)).toBeLessThanOrEqual(c.tolerance);
  });
});
