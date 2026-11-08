import { describe, expect, it } from 'bun:test';
import { cmaes } from './cmaes.ts';
import { coordinateSearch } from './coordinate.ts';
import { symmetricEigen } from './eigen.ts';

const centre = [0.3, 0.7, 0.55, 0.2, 0.8];
const sphere = (x: readonly number[]): number =>
  x.reduce((s, v, i) => s + (v - (centre[i] ?? 0)) ** 2, 0);
/** Rosenbrock on [-2, 2]² mapped to the unit box: minimum 0 at (0.75, 0.75). */
const rosen = (x: readonly number[]): number => {
  const a = (x[0] ?? 0) * 4 - 2;
  const b = (x[1] ?? 0) * 4 - 2;
  return (1 - a) ** 2 + 100 * (b - a * a) ** 2;
};

describe('cmaes', () => {
  it('a starved budget does not reach the minimum (the test can fail)', () => {
    const r = cmaes(sphere, { x0: [0.5, 0.5, 0.5, 0.5, 0.5], evals: 9, seed: 1 });
    expect(r.evals).toBeLessThanOrEqual(9);
    expect(r.f).toBeGreaterThan(1e-3);
  });

  it('finds the minimum of a shifted sphere', () => {
    const r = cmaes(sphere, { x0: [0.5, 0.5, 0.5, 0.5, 0.5], evals: 3000, seed: 7 });
    expect(r.f).toBeLessThan(1e-7);
    for (const [i, v] of r.x.entries()) expect(Math.abs(v - (centre[i] ?? 0))).toBeLessThan(1e-3);
    expect(r.history[0]?.best).toBeGreaterThan(r.f);
  });

  it('finds the Rosenbrock valley floor', () => {
    const r = cmaes(rosen, { x0: [0.2, 0.2], evals: 4000, seed: 3, tolX: 1e-7 });
    expect(Math.abs((r.x[0] ?? 0) - 0.75)).toBeLessThan(5e-3);
    expect(Math.abs((r.x[1] ?? 0) - 0.75)).toBeLessThan(5e-3);
  });

  it('respects the box: a minimum outside it lands on the edge', () => {
    const r = cmaes((x) => ((x[0] ?? 0) - 1.5) ** 2 + ((x[1] ?? 0) + 0.5) ** 2, {
      x0: [0.5, 0.5],
      evals: 600,
      seed: 2,
    });
    expect(r.x[0]).toBeCloseTo(1, 3);
    expect(r.x[1]).toBeCloseTo(0, 3);
  });

  it('is deterministic per seed and differs across seeds', () => {
    const a = cmaes(sphere, { x0: [0.5, 0.5, 0.5, 0.5, 0.5], evals: 200, seed: 11 });
    const b = cmaes(sphere, { x0: [0.5, 0.5, 0.5, 0.5, 0.5], evals: 200, seed: 11 });
    const c = cmaes(sphere, { x0: [0.5, 0.5, 0.5, 0.5, 0.5], evals: 200, seed: 12 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a.x)).not.toBe(JSON.stringify(c.x));
  });
});

describe('coordinateSearch', () => {
  it('finds the shifted sphere minimum without randomness', () => {
    const r = coordinateSearch(sphere, { x0: [0.5, 0.5, 0.5, 0.5, 0.5], evals: 2000, seed: 0 });
    for (const [i, v] of r.x.entries()) expect(Math.abs(v - (centre[i] ?? 0))).toBeLessThan(1e-3);
  });
});

describe('symmetricEigen', () => {
  it('diagonalises a symmetric matrix', () => {
    const { values, vectors } = symmetricEigen([
      [4, 1, 0],
      [1, 3, 1],
      [0, 1, 2],
    ]);
    // A·v = λ·v for every column.
    const A = [
      [4, 1, 0],
      [1, 3, 1],
      [0, 1, 2],
    ];
    for (let k = 0; k < 3; k++)
      for (let i = 0; i < 3; i++) {
        const av = (A[i] ?? []).reduce((s, a, j) => s + a * (vectors[j]?.[k] ?? 0), 0);
        expect(av).toBeCloseTo((values[k] ?? 0) * (vectors[i]?.[k] ?? 0), 9);
      }
  });
});
