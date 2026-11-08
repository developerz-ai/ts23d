import { describe, expect, it } from 'bun:test';
import { createRng, type Vec2 } from '../core/index.ts';
import { earClip, triangulate } from './triangulate.ts';

const area = (p: readonly Vec2[]): number =>
  p.reduce((s, a, i) => {
    const b = p[(i + 1) % p.length] ?? a;
    return s + a[0] * b[1] - b[0] * a[1];
  }, 0) / 2;
const filled = (p: readonly Vec2[], t: readonly [number, number, number][]): number =>
  t.reduce((s, [a, b, c]) => s + area([p[a] ?? [0, 0], p[b] ?? [0, 0], p[c] ?? [0, 0]]), 0);

describe('triangulate', () => {
  it('fills polygons with repeated points completely (the old clipper silently half-filled)', () => {
    const cases: Vec2[][] = [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ],
      [
        [0, 0],
        [2, 0],
        [2, 2],
        [1, 2],
        [1, 1],
        [1, 2],
        [0, 2],
      ],
      [
        [0, 0],
        [3, 0],
        [3, 1],
        [1, 1],
        [1, 2],
        [3, 2],
        [3, 3],
        [0, 3],
        [0, 0],
      ],
      [
        [0, 0],
        [3, 0],
        [3, 3],
        [2, 3],
        [2, 1],
        [2, 1],
        [1, 1],
        [1, 3],
        [0, 3],
      ],
    ];
    for (const p of cases) expect(filled(p, triangulate(p))).toBeCloseTo(area(p), 12);
  });

  it('either winding in, counter-clockwise triangles out, n − 2 of them', () => {
    const l: Vec2[] = [
      [0, 0],
      [2, 0],
      [2, 1],
      [1, 1],
      [1, 2],
      [0, 2],
    ];
    for (const p of [l, [...l].reverse()]) {
      const t = triangulate(p);
      expect(t).toHaveLength(p.length - 2);
      for (const [a, b, c] of t)
        expect(area([p[a] ?? [0, 0], p[b] ?? [0, 0], p[c] ?? [0, 0]])).toBeGreaterThan(0);
      expect(filled(p, t)).toBeCloseTo(Math.abs(area(p)), 12);
    }
  });

  it('fills random star polygons exactly', () => {
    const r = createRng(11);
    for (let s = 0; s < 100; s++) {
      const n = 5 + r.int(0, 80);
      const p = Array.from({ length: n }, (_, i): Vec2 => {
        const a = (i / n) * Math.PI * 2;
        const rad = 0.2 + r.next();
        return [1e3 + Math.cos(a) * rad, 1e3 + Math.sin(a) * rad];
      });
      const t = triangulate(p);
      expect(t).toHaveLength(n - 2);
      expect(filled(p, t)).toBeCloseTo(area(p), 6);
    }
  });

  it('a self-intersecting bow-tie still gets triangles, not an empty fill', () => {
    expect(
      earClip([
        [0, 0],
        [2, 2],
        [2, 0],
        [0, 2],
      ]).length,
    ).toBeGreaterThan(0);
  });
});
