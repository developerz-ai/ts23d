import { describe, expect, it } from 'bun:test';
import { Ts23dError, type Vec3 } from '../core/index.ts';
import { box } from './box.ts';
import { warpTPS } from './warp.ts';
import { tpsWarp } from './warp-solve.ts';

const fails = (f: () => unknown): Ts23dError => {
  try {
    f();
  } catch (e) {
    if (e instanceof Ts23dError) return e;
    throw e;
  }
  throw new Error('expected a Ts23dError');
};

// Eight corners of a cube plus its centre: a well-spread 3D landmark set.
const CUBE: Vec3[] = [
  [-1, -1, -1],
  [1, -1, -1],
  [-1, 1, -1],
  [1, 1, -1],
  [-1, -1, 1],
  [1, -1, 1],
  [-1, 1, 1],
  [1, 1, 1],
  [0, 0, 0],
];
const near = (a: Vec3, b: Vec3, eps = 1e-6): boolean =>
  Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps && Math.abs(a[2] - b[2]) < eps;

describe('tpsWarp / warpTPS', () => {
  it('fails with T3D_WARP_INVALID on coplanar landmarks (singular frame)', () => {
    const flat: Vec3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [0.5, 0.5, 0],
    ];
    const e = fails(() => tpsWarp(flat, flat));
    expect(e.code).toBe('T3D_WARP_INVALID');
    expect(e.fix).toContain('three axes');
  });

  it('fails on mismatched lists, too few points, duplicates, NaN and negative stiffness', () => {
    expect(fails(() => tpsWarp(CUBE, CUBE.slice(1))).code).toBe('T3D_WARP_INVALID');
    expect(fails(() => tpsWarp(CUBE.slice(0, 3), CUBE.slice(0, 3))).code).toBe('T3D_WARP_INVALID');
    const dup: Vec3[] = [...CUBE, [1, 1, 1]];
    const to: Vec3[] = [...CUBE, [1.2, 1, 1]];
    expect(fails(() => tpsWarp(dup, to)).message).toContain('singular');
    const nan: Vec3[] = [...CUBE.slice(1), [Number.NaN, 0, 0]];
    expect(fails(() => tpsWarp(nan, nan)).message).toContain('not finite');
    expect(fails(() => tpsWarp(CUBE, CUBE, { stiffness: -1 })).code).toBe('T3D_WARP_INVALID');
  });

  it('duplicated landmarks solve once stiffness relaxes them', () => {
    const dup: Vec3[] = [...CUBE, [1, 1, 1]];
    const to: Vec3[] = [...CUBE, [1.2, 1, 1]];
    expect(() => tpsWarp(dup, to, { stiffness: 0.05 })).not.toThrow();
  });

  it('is the identity when from = to', () => {
    const w = tpsWarp(CUBE, CUBE);
    for (const p of [
      [0.3, -0.2, 0.7],
      [5, 4, -3],
    ] as Vec3[])
      expect(near(w.map(p), p)).toBe(true);
  });

  it('reproduces an affine map exactly (the spline part stays zero)', () => {
    const A = (p: Vec3): Vec3 => [2 * p[0] + 0.1, p[1] - 0.5 * p[2], 3 * p[2] - 1];
    const w = tpsWarp(CUBE, CUBE.map(A));
    const p: Vec3 = [0.4, -0.7, 2.5];
    expect(near(w.map(p), A(p), 1e-6)).toBe(true);
    const J = w.jacobian(p);
    expect(J.map((v) => Math.round(v * 1e6) / 1e6 + 0)).toEqual([2, 0, 0, 0, 1, -0.5, 0, 0, 3]);
  });

  it('interpolates every landmark exactly at stiffness 0, and not above it', () => {
    const to = CUBE.map((p, i): Vec3 => [p[0] + (i === 8 ? 0.4 : 0), p[1], p[2] + 0.1 * i]);
    const exact = tpsWarp(CUBE, to);
    CUBE.forEach((p, i) => {
      expect(near(exact.map(p), to[i] ?? p, 1e-9)).toBe(true);
    });
    const soft = tpsWarp(CUBE, to, { stiffness: 0.5 });
    expect(near(soft.map(CUBE[8] ?? [0, 0, 0]), to[8] ?? [0, 0, 0], 1e-3)).toBe(false);
  });

  it('is smooth: a moved centre drags its neighbourhood with a falloff, no jump', () => {
    const to = CUBE.map((p, i): Vec3 => (i === 8 ? [0, 0, 0.5] : p));
    const w = tpsWarp(CUBE, to);
    let prev = Number.POSITIVE_INFINITY;
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const dz = w.map([t, 0, 0])[2];
      expect(dz).toBeLessThanOrEqual(prev + 1e-9);
      // A finite-difference step never jumps.
      expect(Math.abs(w.map([t + 0.01, 0, 0])[2] - dz)).toBeLessThan(0.02);
      prev = dz;
    }
  });

  it('jacobian matches finite differences', () => {
    const to = CUBE.map((p, i): Vec3 => [p[0] * 1.1, p[1] + 0.05 * i, p[2] - (i === 8 ? 0.3 : 0)]);
    const w = tpsWarp(CUBE, to);
    const p: Vec3 = [0.3, 0.2, -0.4];
    const J = w.jacobian(p);
    const h = 1e-5;
    for (let j = 0; j < 3; j++) {
      const a: [number, number, number] = [...p];
      const b: [number, number, number] = [...p];
      a[j] = (a[j] ?? 0) + h;
      b[j] = (b[j] ?? 0) - h;
      const fa = w.map(a);
      const fb = w.map(b);
      for (let k = 0; k < 3; k++)
        expect(
          Math.abs(((fa[k] ?? 0) - (fb[k] ?? 0)) / (2 * h) - (J[k * 3 + j] ?? 0)),
        ).toBeLessThan(1e-5);
    }
  });

  it('warps a mesh: positions move, normals turn with the warp, topology kept, deterministic', () => {
    const m = box({ size: [2, 2, 2], color: [0.5, 0.5, 0.5] });
    const shear = (p: Vec3): Vec3 => [p[0] + 0.5 * p[2], p[1], p[2]];
    const out = warpTPS(m, CUBE, CUBE.map(shear));
    expect(out.indices).toEqual(m.indices);
    expect(out.uvs).toEqual(m.uvs);
    // The front face (normal +X) of a box sheared in x by z turns to (1, 0, −0.5)/|·|.
    for (let v = 0; v < m.normals.length; v += 3)
      if ((m.normals[v] ?? 0) > 0.99) {
        expect(out.normals[v] ?? 0).toBeCloseTo(1 / Math.hypot(0.5, 1), 5);
        expect(out.normals[v + 2] ?? 0).toBeCloseTo(-0.5 / Math.hypot(0.5, 1), 5);
      }
    const again = warpTPS(m, CUBE, CUBE.map(shear));
    expect(again.positions).toEqual(out.positions);
  });
});
