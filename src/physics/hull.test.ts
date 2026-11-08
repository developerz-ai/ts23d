import { describe, expect, it } from 'bun:test';
import { createRng, type Vec3 } from '../core/index.ts';
import { boxMesh } from './fixtures.ts';
import { convexHull, hullVolume } from './hull.ts';
import { cappedHull, pointsOf } from './hull-cap.ts';

const cube = (): Vec3[] => pointsOf(boxMesh([1, 1, 1]).positions);

describe('convexHull', () => {
  it('refuses flat input (no volume to enclose)', () => {
    expect(
      convexHull([
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
        [1, 1, 0],
      ]),
    ).toBeNull();
    expect(
      convexHull([
        [0, 0, 0],
        [0, 0, 0],
      ]),
    ).toBeNull();
  });

  it('a cube is 8 vertices, 12 triangles, volume 1, interior points ignored', () => {
    const h = convexHull([...cube(), [0, 0, 0], [0.1, -0.2, 0.3]]);
    expect(h?.vertices.length).toBe(8);
    expect(h?.faces.length).toBe(12);
    expect(hullVolume(h ?? { vertices: [], faces: [] })).toBeCloseTo(1, 9);
  });

  it('faces wind outward (positive volume) whatever the input order', () => {
    const h = convexHull([...cube()].reverse());
    expect(hullVolume(h ?? { vertices: [], faces: [] })).toBeCloseTo(1, 9);
  });

  it('is deterministic', () => {
    const pts: Vec3[] = Array.from({ length: 200 }, (_, i) => [
      Math.sin(i * 12.9898) * 3,
      Math.sin(i * 78.233) * 2,
      Math.sin(i * 37.719),
    ]);
    expect(JSON.stringify(convexHull(pts))).toBe(JSON.stringify(convexHull(pts)));
  });
});

describe('cappedHull', () => {
  it('keeps a sphere-ish cloud under the vertex cap and inside the true hull', () => {
    const pts: Vec3[] = [];
    for (let i = 0; i < 40; i++)
      for (let j = 0; j < 20; j++) {
        const t = (Math.PI * (j + 0.5)) / 20;
        const p = (2 * Math.PI * i) / 40;
        pts.push([Math.sin(t) * Math.cos(p), Math.sin(t) * Math.sin(p), Math.cos(t)]);
      }
    const full = convexHull(pts);
    const capped = cappedHull(pts, 64);
    expect(full?.vertices.length ?? 0).toBeGreaterThan(64);
    expect(capped?.vertices.length ?? 999).toBeLessThanOrEqual(64);
    const v = hullVolume(capped ?? { vertices: [], faces: [] });
    expect(v).toBeLessThanOrEqual(hullVolume(full ?? { vertices: [], faces: [] }) + 1e-9);
    expect(v).toBeGreaterThan(0.85 * ((4 / 3) * Math.PI));
  });

  it('keeps all 8 corners of a box', () => {
    expect(cappedHull(cube(), 64)?.vertices.length).toBe(8);
  });
});

describe('convexHull robustness (exact orient3d visibility)', () => {
  /** Every directed edge used once and its twin once: a closed 2-manifold. */
  const closed = (h: NonNullable<ReturnType<typeof convexHull>>): boolean => {
    const e = new Map<string, number>();
    for (const [a, b, c] of h.faces)
      for (const [u, v] of [
        [a, b],
        [b, c],
        [c, a],
      ])
        e.set(`${u},${v}`, (e.get(`${u},${v}`) ?? 0) + 1);
    return [...e].every(([k, n]) => {
      const [u, v] = k.split(',');
      return n === 1 && e.get(`${v},${u}`) === 1;
    });
  };
  it('near-coplanar points on a box stay a closed hull (eps visibility left holes)', () => {
    let open = 0;
    for (let s = 0; s < 80; s++) {
      const r = createRng(s);
      const pts: Vec3[] = Array.from({ length: 120 }, (): Vec3 => {
        const f = r.int(0, 5);
        const u = r.range(-1, 1);
        const v = r.range(-1, 1);
        const j = (r.next() - 0.5) * 1e-9 * (s % 3);
        const side = f % 2 === 0 ? 1 + j : -1 + j;
        return f < 2 ? [side, u, v] : f < 4 ? [u, side, v] : [u, v, side];
      });
      for (const eps of [1e-6, 0]) {
        const h = convexHull(pts, eps);
        if (!h || !closed(h)) open++;
      }
    }
    expect(open).toBe(0);
  });
});
