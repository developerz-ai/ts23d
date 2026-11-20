import { describe, expect, it } from 'bun:test';
import type { Vec3 } from '../core/index.ts';
import { dmath } from '../core/index.ts';
import { box, sdf } from '../primitives/index.ts';
import { bakeField, fieldProbe } from './bake-field.ts';

const R = 0.5;
const ball = (p: Vec3): number => dmath.hypot(p[0], p[1], p[2]) - R;
/** Axis-aligned box SDF with half-extents h. */
const slab =
  (h: Vec3) =>
  (p: Vec3): number => {
    const q = [Math.abs(p[0]) - h[0], Math.abs(p[1]) - h[1], Math.abs(p[2]) - h[2]];
    const o = dmath.norm(q.map((v) => Math.max(v, 0)));
    return o + Math.min(Math.max(q[0] ?? 0, q[1] ?? 0, q[2] ?? 0), 0);
  };
const mean = (a: Float32Array | undefined): number =>
  a ? a.reduce((s, v) => s + v, 0) / a.length : Number.NaN;

describe('fieldProbe', () => {
  it('rejects a zero cell (a Laplacian over 0 m is NaN)', () => {
    expect(() => fieldProbe(ball, 0)).toThrow('T3D_BAKE_INVALID');
  });

  it('sphere mean curvature = 1/r ± 2 %', () => {
    const H = fieldProbe(ball, 0.01).curvature([R, 0, 0]);
    expect(Math.abs(H * R - 1)).toBeLessThan(0.02);
  });

  it('depth through a 2 cm plate is 2 cm, through a 40 cm block capped at reach', () => {
    const plate = fieldProbe(slab([0.2, 0.2, 0.01]), 0.002);
    expect(plate.depth([0, 0, 0.01], [0, 0, 1], 0.3)).toBeCloseTo(0.02, 2);
    const block = fieldProbe(slab([0.2, 0.2, 0.2]), 0.002);
    expect(block.depth([0, 0, 0.2], [0, 0, 1], 0.3)).toBe(0.3);
  });
});

describe('bakeField', () => {
  const mesh = sdf({
    field: ball,
    bounds: [
      [-0.6, -0.6, -0.6],
      [0.6, 0.6, 0.6],
    ],
    resolution: 0.05,
    color: [1, 1, 1],
  });

  it('rejects reach 0 and fractional smoothing', () => {
    expect(() => bakeField(mesh, ball, { reach: 0, maps: ['cavity'] })).toThrow('T3D_BAKE_INVALID');
    expect(() => bakeField(mesh, ball, { smooth: 1.5, maps: ['cavity'] })).toThrow(
      'T3D_BAKE_INVALID',
    );
  });

  it('bakes only the requested maps, one value per vertex', () => {
    const m = bakeField(mesh, ball, { maps: ['curvature'], cell: 0.01 });
    expect(m.curvature?.length).toBe(mesh.positions.length / 3);
    expect(m.cavity).toBeUndefined();
    expect(m.ao).toBeUndefined();
  });

  it('a sphere is convex everywhere: curvature ≈ 1/r, cavity 0', () => {
    const m = bakeField(mesh, ball, { maps: ['curvature', 'cavity'], cell: 0.01 });
    expect(Math.abs(mean(m.curvature) * R - 1)).toBeLessThan(0.05);
    expect(Math.max(...(m.cavity ?? []))).toBe(0);
  });

  it('flat plane: cavity 0 (field and mesh fallback)', () => {
    const plate = box({ size: [1, 1, 0.1], at: [0, 0, -0.05], color: [1, 1, 1] });
    const f = slab([0.5, 0.5, 0.05]);
    for (const field of [f, null]) {
      const m = bakeField(plate, field, { maps: ['cavity'], cell: 0.01, reach: 0.05 });
      expect(Math.max(...(m.cavity ?? []))).toBe(0);
    }
  });

  it('a fold is a cavity: the inside of a hollow shell reads > 0.3', () => {
    const shell = (p: Vec3): number => -ball(p);
    const m = bakeField(mesh, shell, { maps: ['cavity'], cell: 0.01, reach: 0.2 });
    expect(mean(m.cavity)).toBeGreaterThan(0.3);
  });

  it('thin plate thickness < thick block thickness (field and ray fallback)', () => {
    const solid = (h: Vec3) =>
      sdf({
        field: slab(h),
        bounds: [
          [-h[0] - 0.02, -h[1] - 0.02, -h[2] - 0.02],
          [h[0] + 0.02, h[1] + 0.02, h[2] + 0.02],
        ],
        resolution: 0.01,
        color: [1, 1, 1],
      });
    const thinH: Vec3 = [0.15, 0.15, 0.02];
    const thickH: Vec3 = [0.15, 0.15, 0.15];
    const [thin, thick] = [solid(thinH), solid(thickH)];
    for (const useField of [true, false]) {
      const o = { maps: ['thickness'] as const, cell: 0.004, reach: 0.2 };
      const a = bakeField(thin, useField ? slab(thinH) : null, o);
      const b = bakeField(thick, useField ? slab(thickH) : null, o);
      expect(mean(a.thickness)).toBeLessThan(0.35);
      expect(mean(b.thickness)).toBeGreaterThan(0.7);
    }
  });

  it('mesh fallback curvature on a sphere ≈ 1/r', () => {
    const m = bakeField(mesh, null, { maps: ['curvature'] });
    expect(Math.abs(mean(m.curvature) * R - 1)).toBeLessThan(0.05);
  });

  it('AO: a lone sphere off the ground is mostly open; deterministic', () => {
    const lifted = sdf({
      field: (p) => ball([p[0], p[1], p[2] - 2]),
      bounds: [
        [-0.6, -0.6, 1.4],
        [0.6, 0.6, 2.6],
      ],
      resolution: 0.1,
      color: [1, 1, 1],
    });
    const a = bakeField(lifted, null, { maps: ['ao'] });
    const b = bakeField(lifted, null, { maps: ['ao'] });
    expect(mean(a.ao)).toBeGreaterThan(0.95);
    expect(a.ao).toEqual(b.ao ?? new Float32Array());
  });
});
