import { describe, expect, it } from 'bun:test';
import { createRng, type Mesh, merge } from '../core/index.ts';
import { box, cylinder } from '../primitives/index.ts';
import { RayGrid } from './ray-grid.ts';

const c: [number, number, number] = [1, 1, 1];
const scene: Mesh = merge([
  box({ size: [1, 1, 1], color: c }),
  box({ size: [0.2, 0.2, 2], at: [0.9, 0.3, 0], color: c }),
  cylinder({ radius: 0.3, length: 0.4, segments: 24, axis: 'y', at: [-0.8, 0, 0.5], color: c }),
]);

/** Brute force: every triangle, no grid — the reference the grid must agree with. */
function bruteHit(m: Mesh, o: number[], d: number[], tMax: number): boolean {
  const at = (i: number, k: number) => m.positions[(m.indices[i] ?? 0) * 3 + k] ?? 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const v0 = [0, 1, 2].map((k) => at(t, k));
    const e1 = [0, 1, 2].map((k) => at(t + 1, k) - (v0[k] ?? 0));
    const e2 = [0, 1, 2].map((k) => at(t + 2, k) - (v0[k] ?? 0));
    const [dx = 0, dy = 0, dz = 0] = d;
    const [ax = 0, ay = 0, az = 0] = e1;
    const [bx = 0, by = 0, bz = 0] = e2;
    const p = [dy * bz - dz * by, dz * bx - dx * bz, dx * by - dy * bx];
    const det = ax * (p[0] ?? 0) + ay * (p[1] ?? 0) + az * (p[2] ?? 0);
    if (Math.abs(det) < 1e-14) continue;
    const s = [0, 1, 2].map((k) => (o[k] ?? 0) - (v0[k] ?? 0));
    const [sx = 0, sy = 0, sz = 0] = s;
    const u = (sx * (p[0] ?? 0) + sy * (p[1] ?? 0) + sz * (p[2] ?? 0)) / det;
    if (u < 0 || u > 1) continue;
    const q = [sy * az - sz * ay, sz * ax - sx * az, sx * ay - sy * ax];
    const v = (dx * (q[0] ?? 0) + dy * (q[1] ?? 0) + dz * (q[2] ?? 0)) / det;
    if (v < 0 || u + v > 1) continue;
    const th = (bx * (q[0] ?? 0) + by * (q[1] ?? 0) + bz * (q[2] ?? 0)) / det;
    if (th > 0 && th <= tMax) return true;
  }
  return false;
}

describe('RayGrid', () => {
  it('misses: beside the box, pointing away, and stopping short of it', () => {
    const g = new RayGrid(box({ size: [1, 1, 1], color: c }));
    expect(g.hit(-3, 2, 0.5, 1, 0, 0, 10)).toBe(false);
    expect(g.hit(-3, 0, 0.5, -1, 0, 0, 10)).toBe(false);
    expect(g.hit(-3, 0, 0.5, 1, 0, 0, 2.4)).toBe(false);
    expect(g.hit(-3, 0, 0.5, 1, 0, 0, 2.6)).toBe(true);
  });

  it('agrees with brute force on 4000 seeded rays (any-hit, any cell size)', () => {
    const g = new RayGrid(scene);
    const rng = createRng(7);
    let hits = 0;
    for (let i = 0; i < 4000; i++) {
      const o = [rng.range(-2, 2), rng.range(-1.5, 1.5), rng.range(-0.5, 2.5)];
      const d0 = [rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)];
      const l = Math.hypot(...d0) || 1;
      const d = d0.map((x) => x / l);
      const tMax = rng.range(0.1, 3);
      const want = bruteHit(scene, o, d, tMax);
      if (want) hits++;
      expect([
        i,
        g.hit(o[0] ?? 0, o[1] ?? 0, o[2] ?? 0, d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, tMax),
      ]).toEqual([i, want]);
    }
    // Both outcomes are exercised, so the comparison can fail either way.
    expect(hits).toBeGreaterThan(400);
    expect(hits).toBeLessThan(3600);
  });
});
