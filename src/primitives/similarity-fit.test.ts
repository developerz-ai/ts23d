import { describe, expect, it } from 'bun:test';
import type { Vec3 } from '../core/index.ts';
import {
  applySimilarity,
  composeSimilarity,
  fieldProjector,
  fitToSurface,
  similarityFit,
  yawSimilarity,
} from './similarity-fit.ts';

const box =
  (h: Vec3) =>
  (p: Vec3): number => {
    const q = [Math.abs(p[0]) - h[0], Math.abs(p[1]) - h[1], Math.abs(p[2]) - h[2]];
    const out = Math.hypot(Math.max(q[0] ?? 0, 0), Math.max(q[1] ?? 0, 0), Math.max(q[2] ?? 0, 0));
    return out + Math.min(Math.max(q[0] ?? 0, q[1] ?? 0, q[2] ?? 0), 0);
  };

describe('similarityFit', () => {
  it('recovers a known scale · rotation · translation from four landmarks', () => {
    const truth = {
      ...composeSimilarity(yawSimilarity(37), {
        s: 1.7,
        r: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        t: [0, 0, 0],
      }),
      t: [0.3, -1, 2] as Vec3,
    };
    const src: Vec3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 2, 0],
      [0, 0, 3],
      [1, 1, 1],
    ];
    const fit = similarityFit(
      src,
      src.map((p) => applySimilarity(truth, p)),
    );
    expect(fit.s).toBeCloseTo(1.7, 9);
    for (const p of src) {
      const a = applySimilarity(fit, p);
      const b = applySimilarity(truth, p);
      expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeLessThan(1e-9);
    }
  });

  it('refuses fewer than 3 pairs', () => {
    expect(() => similarityFit([[0, 0, 0]], [[1, 1, 1]])).toThrow('T3D_RECIPE_INVALID');
  });
});

describe('fitToSurface (trimmed ICP onto a field)', () => {
  it('turns a box facing +Y back to +X from four yaw starts', () => {
    const field = box([1, 0.3, 0.2]);
    const pts: Vec3[] = [];
    for (let i = 0; i <= 20; i++)
      for (const [y, z] of [
        [0.3, 0],
        [-0.3, 0],
        [0, 0.2],
        [0, -0.2],
      ] as const)
        pts.push([-1 + i * 0.1, y, z]);
    for (const x of [1, -1]) pts.push([x, 0, 0], [x, 0.2, 0.1]);
    // The model's mesh came facing +Y, 10 % small, off-centre.
    const model = pts.map((p) =>
      applySimilarity({ ...yawSimilarity(90), s: 0.9, t: [0.1, 0.05, 0] }, p),
    );
    const starts = [0, 90, 180, 270].map(yawSimilarity);
    const { fit, residual } = fitToSurface(model, fieldProjector(field), starts, {
      iterations: 20,
      trim: 0.1,
    });
    expect(residual).toBeLessThan(0.01);
    const tip = applySimilarity(fit, model[model.length - 4] ?? [0, 0, 0]);
    expect(Math.abs(Math.abs(tip[0]) - 1)).toBeLessThan(0.05);
  });
});
