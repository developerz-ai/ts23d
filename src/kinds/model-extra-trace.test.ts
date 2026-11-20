import { describe, expect, it } from 'bun:test';
import type { Mesh, Vec3 } from '../core/index.ts';
import { dmath } from '../core/index.ts';
import { triBvh } from '../primitives/index.ts';
import { tracePath } from './model-extra-trace.ts';
import { withLimb } from './model-fixtures.ts';

const EMPTY: Mesh = {
  positions: new Float32Array(),
  normals: new Float32Array(),
  uvs: new Float32Array(),
  colors: new Float32Array(),
  indices: new Uint32Array(),
};

describe('tracePath', () => {
  // An L of two tubes: up 0.5 m, then 0.5 m sideways.
  const corner: Vec3 = [0, 0, 0.5];
  const bent = withLimb(withLimb(EMPTY, [0, 0, 0], corner, 0.05), corner, [0, 0.5, 0.5], 0.05);

  it('runs through the inside, round the corner, never across the air between the ends', () => {
    const path = tracePath(bent, [0, 0, 0], [0, 0.5, 0.5], { cell: 0.02 });
    const bvh = triBvh(bent);
    expect(path.length).toBeGreaterThan(40);
    for (const p of path) expect(bvh.winding(p) > 0.5).toBe(true);
    const near = Math.min(...path.map((p) => dmath.hypot(p[0], p[1], p[2] - 0.5)));
    expect(near).toBeLessThan(0.05);
    // The straight line between the ends passes 0.35 m from the corner.
    expect(dmath.hypot(0.25, 0.25)).toBeGreaterThan(0.3);
  });

  it('refuses two points with no flesh between them', () => {
    const apart = withLimb(bent, [1, 0, 0], [1, 0, 0.3], 0.05);
    expect(() => tracePath(apart, [0, 0, 0], [1, 0, 0.3], { cell: 0.02 })).toThrow(
      /T3D_MODEL_SKELETON.*not joined/,
    );
  });

  it('fails before D342: does not step across a gap narrower than a cell between two solids', () => {
    // Two parallel tubes 5 mm apart (surface to surface), traced on a 2 cm grid.
    const a = withLimb(EMPTY, [0, 0, 0], [0, 0, 0.5], 0.05);
    const both = withLimb(a, [0, 0.105, 0], [0, 0.105, 0.5], 0.05);
    expect(() => tracePath(both, [0, 0, 0.05], [0, 0.105, 0.45], { cell: 0.02 })).toThrow(
      /T3D_MODEL_SKELETON.*not joined/,
    );
  });

  it('fails before D343: refuses a grid too big to allocate, and a cell or pad that is not a size', () => {
    const tooFine = () => tracePath(bent, [0, 0, 0], [0, 0.5, 0.5], { cell: 0.0005 });
    expect(tooFine).toThrow(/T3D_MODEL_SKELETON.*cells/);
    for (const o of [{ cell: 0 }, { cell: -0.02 }, { cell: Number.NaN }, { cell: 0.02, pad: -1 }])
      expect(() => tracePath(bent, [0, 0, 0], [0, 0.5, 0.5], o)).toThrow(/T3D_MODEL_SKELETON/);
    expect(() =>
      tracePath(bent, [0, 0, 0], [0, 0.5, 0.5], { cell: 0.02, pad: Number.POSITIVE_INFINITY }),
    ).toThrow(/T3D_MODEL_SKELETON/);
  });
});
