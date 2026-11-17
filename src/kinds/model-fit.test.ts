import { describe, expect, it } from 'bun:test';
import { Ts23dError } from '../core/index.ts';
import { applySimilarity, yawSimilarity } from '../primitives/index.ts';
import { creaturePlan } from './creature.ts';
import { applyFit, FIT_LIMIT, modelFit } from './model-fit.ts';
import { capsuleCreature, FIXTURE_WOLF } from './model-fixtures.ts';

const { bones } = creaturePlan(FIXTURE_WOLF);
const body = capsuleCreature(bones);

describe('modelFit', () => {
  it('refuses a mesh with nothing to register', () => {
    const empty = { ...body, positions: new Float32Array(9), indices: new Uint32Array(3) };
    expect(() => modelFit(empty, bones)).toThrow(Ts23dError);
    expect(() => modelFit(empty, bones)).toThrow(/T3D_MODEL_FIT/);
  });

  it('registers a model turned 90° about Z, 1.7× too big and off to one side', () => {
    const moved = applyFit(body, { ...yawSimilarity(90), s: 1.7, t: [0.4, -0.3, 0.25] });
    const fit = modelFit(moved, bones);
    expect(fit.relative).toBeLessThan(FIT_LIMIT);
    expect(fit.scale).toBeCloseTo(1 / 1.7, 1);
    expect(Math.abs(fit.yaw + 90)).toBeLessThan(3);
    const back = applyFit(moved, fit.similarity);
    let worst = 0;
    for (let i = 0; i < back.positions.length; i++)
      worst = Math.max(worst, Math.abs((back.positions[i] ?? 0) - (body.positions[i] ?? 0)));
    expect(worst).toBeLessThan(0.15 * bones.height);
  });

  it('lands the lowest vertex on the ground and returns the same move as a row-major 4×4', () => {
    const moved = applyFit(body, { ...yawSimilarity(200), s: 0.6, t: [0, 0, 3] });
    const fit = modelFit(moved, bones);
    const placed = applyFit(moved, fit.similarity);
    let low = Infinity;
    for (let i = 2; i < placed.positions.length; i += 3)
      low = Math.min(low, placed.positions[i] ?? 0);
    expect(Math.abs(low)).toBeLessThan(1e-5);
    const p: [number, number, number] = [0.3, -0.2, 0.5];
    const m = fit.matrix;
    const q = applySimilarity(fit.similarity, p);
    for (let r = 0; r < 3; r++) {
      const row =
        (m[r * 4] ?? 0) * p[0] +
        (m[r * 4 + 1] ?? 0) * p[1] +
        (m[r * 4 + 2] ?? 0) * p[2] +
        (m[r * 4 + 3] ?? 0);
      expect(row).toBeCloseTo(q[r] ?? 0, 9);
    }
    expect(m.slice(12)).toEqual([0, 0, 0, 1]);
  });

  it('is memoised per mesh', () => {
    expect(modelFit(body, bones)).toBe(modelFit(body, bones));
  });
});
