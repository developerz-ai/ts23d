import { describe, expect, it } from 'bun:test';
import { boundsOf, Ts23dError, triangleCount, type Vec3 } from '../core/index.ts';
import { cylinder } from './lathe.ts';
import { sweep } from './sweep.ts';
import { transportFrames } from './transport.ts';

const C: Vec3 = [0.5, 0.4, 0.3];
const straight: Vec3[] = [
  [0, 0, 0],
  [0, 0, 1],
  [0, 0, 2],
];

const fails = (f: () => unknown): Ts23dError => {
  try {
    f();
  } catch (e) {
    if (e instanceof Ts23dError) return e;
    throw e;
  }
  throw new Error('expected a Ts23dError');
};

describe('sweep', () => {
  it('throws T3D_RECIPE_INVALID with a fix on a degenerate path', () => {
    const one = fails(() =>
      sweep({ section: { radius: 1, segments: 6 }, path: [[0, 0, 0]], color: C }),
    );
    expect(one.code).toBe('T3D_RECIPE_INVALID');
    expect(one.fix).toContain('at least 2');
    const zero = fails(() =>
      sweep({
        section: { radius: 1, segments: 6 },
        path: [
          [1, 1, 1],
          [1, 1, 1],
        ],
        color: C,
      }),
    );
    expect(zero.fix).toContain('distinct');
    const bad = fails(() =>
      sweep({ section: { radius: 1, segments: 6 }, path: straight, scale: [1, 1], color: C }),
    );
    expect(bad.fix).toContain('one scale per path point');
  });

  it('triangle count = 2·S·(P−1) + S per cap', () => {
    for (const [segments, points] of [
      [3, 2],
      [8, 5],
      [12, 9],
    ] as const) {
      const path: Vec3[] = Array.from({ length: points }, (_, i) => [0, 0, i * 0.5]);
      const open = sweep({ section: { radius: 0.2, segments }, path, color: C });
      expect(triangleCount(open)).toBe(2 * segments * (points - 1));
      const capped = sweep({ section: { radius: 0.2, segments }, path, color: C, caps: true });
      expect(triangleCount(capped)).toBe(2 * segments * (points - 1) + 2 * segments);
      const end = sweep({ section: { radius: 0.2, segments }, path, color: C, caps: 'end' });
      expect(triangleCount(end)).toBe(2 * segments * (points - 1) + segments);
    }
  });

  it('a straight path equals a cylinder of the same size', () => {
    const s = sweep({
      section: { radius: 0.5, segments: 16 },
      path: straight,
      color: C,
      caps: true,
    });
    const c = cylinder({ radius: 0.5, length: 2, segments: 16, at: [0, 0, 1], color: C });
    const bs = boundsOf(s);
    const bc = boundsOf(c);
    for (let k = 0; k < 3; k++) {
      expect(bs.min[k]).toBeCloseTo(bc.min[k] ?? 0, 5);
      expect(bs.max[k]).toBeCloseTo(bc.max[k] ?? 0, 5);
    }
    // Same surface: every sweep vertex sits on the r = 0.5 cylinder or a cap.
    for (let i = 0; i < s.positions.length; i += 3) {
      const r = Math.hypot(s.positions[i] ?? 0, s.positions[i + 1] ?? 0);
      const z = s.positions[i + 2] ?? 0;
      expect(Math.abs(r - 0.5) < 1e-5 || r < 1e-6 || z < 1e-6 || z > 2 - 1e-6).toBe(true);
    }
  });

  it('smooth normals point outward from the path', () => {
    const path: Vec3[] = [
      [0, 0, 0],
      [1, 0, 1],
      [1, 1, 2],
      [0, 2, 2.5],
    ];
    const m = sweep({ section: { radius: 0.3, segments: 8 }, path, color: C });
    const per = 9; // segments + 1 seam vertex per ring
    for (let i = 0; i < m.positions.length / 3; i++) {
      const c: Vec3 = path[Math.floor(i / per)] ?? [0, 0, 0];
      const out = [0, 1, 2].map((k) => (m.positions[i * 3 + k] ?? 0) - (c[k] ?? 0));
      const d = [0, 1, 2].reduce((s, k) => s + (out[k] ?? 0) * (m.normals[i * 3 + k] ?? 0), 0);
      expect(d).toBeGreaterThan(0);
    }
  });

  it('parallel transport never flips the frame on a helix', () => {
    const path: Vec3[] = Array.from({ length: 40 }, (_, i) => [
      Math.cos(i * 0.3),
      Math.sin(i * 0.3),
      i * 0.1,
    ]);
    const f = transportFrames(path);
    for (let i = 1; i < f.length; i++) {
      const a = f[i - 1]?.n ?? [0, 0, 0];
      const b = f[i]?.n ?? [0, 0, 0];
      expect(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]).toBeGreaterThan(0.9);
    }
  });

  it('tapers by scale, maps U along the length in metres, and is deterministic', () => {
    const o = {
      section: { radius: 1, segments: 6 },
      path: straight,
      scale: [1, 0.5, 0.1],
      color: C,
    } as const;
    const a = sweep(o);
    const top = boundsOf(a);
    expect(top.max[0]).toBeCloseTo(1, 5);
    const lastU = a.uvs[(a.uvs.length / 2 - 1) * 2] ?? 0;
    expect(lastU).toBeCloseTo(1, 5); // 2 m of length over a 2 m strip
    expect(Bun.hash(a.positions)).toBe(Bun.hash(sweep(o).positions));
  });

  it('accepts a polygon section in either winding', () => {
    const sq = [
      [-0.1, -0.1],
      [0.1, -0.1],
      [0.1, 0.1],
      [-0.1, 0.1],
    ] as const;
    const ccw = sweep({ section: sq, path: straight, color: C });
    const cw = sweep({ section: [...sq].reverse(), path: straight, color: C });
    expect(triangleCount(ccw)).toBe(16);
    expect(Array.from(ccw.normals.slice(0, 3))).toEqual(Array.from(cw.normals.slice(0, 3)));
  });
});
