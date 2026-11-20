import { describe, expect, it } from 'bun:test';
import { dmath, Ts23dError, type Vec3 } from '../core/index.ts';
import { beam } from './beam.ts';

const C: Vec3 = [1, 1, 1];
const ok = { from: [0, 0, 0], to: [2, 0, 0], width: 0.1, color: C } as const;

const fails = (f: () => unknown): Ts23dError => {
  try {
    f();
  } catch (e) {
    if (e instanceof Ts23dError) return e;
    throw e;
  }
  throw new Error('expected a Ts23dError');
};

describe('beam input', () => {
  it('refuses an `up` along the beam (it collapsed to a line with zero normals)', () => {
    const e = fails(() => beam({ ...ok, up: [3, 0, 0] }));
    expect(e.code).toBe('T3D_RECIPE_INVALID');
    expect(e.message).toContain('beam');
    expect(e.fix).toContain('perpendicular');
    expect(fails(() => beam({ ...ok, up: [0, 0, 0] })).code).toBe('T3D_RECIPE_INVALID');
  });

  it('names the beam, not `box`, for coincident or NaN end points and a bad width', () => {
    for (const bad of [
      { to: ok.from },
      { to: [Number.NaN, 0, 0] },
      { from: [0, Number.POSITIVE_INFINITY, 0] },
      { width: 0 },
      { height: -1 },
    ] as const) {
      const e = fails(() => beam({ ...ok, ...bad }));
      expect(e.code).toBe('T3D_RECIPE_INVALID');
      expect(e.message).toContain('beam');
      expect(e.message).not.toContain('box');
    }
  });

  it('refuses segments that are neither absent nor a whole number ≥ 3', () => {
    for (const segments of [1, 2, 3.5, Number.NaN, -4])
      expect(fails(() => beam({ ...ok, segments })).code).toBe('T3D_RECIPE_INVALID');
  });
});

describe('beam', () => {
  it('keeps unit normals for an explicit up and for a vertical beam', () => {
    for (const m of [beam({ ...ok, up: [0, 1, 0] }), beam({ ...ok, to: [0, 0, 3], segments: 6 })])
      for (let i = 0; i < m.normals.length; i += 3)
        expect(
          dmath.hypot(m.normals[i] ?? 0, m.normals[i + 1] ?? 0, m.normals[i + 2] ?? 0),
        ).toBeCloseTo(1, 5);
  });
});
