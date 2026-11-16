import { describe, expect, it } from 'bun:test';
import { Ts23dError, type Vec3 } from '../core/index.ts';
import { fieldMorph, hingeMorph, sumMorphs } from './morph.ts';
import { ball as unitBall } from './skin-fixtures.ts';

const ball = unitBall();

const v3 = (f: (k: number) => number): Vec3 => [f(0), f(1), f(2)];
const sdSphere =
  (r: number): ((p: Vec3) => number) =>
  (p) =>
    Math.hypot(...p) - r;

describe('morph targets', () => {
  it('refuses a non-snake name and a zero hinge axis', () => {
    expect(() => fieldMorph(ball, 'Breathe', sdSphere(1), sdSphere(1.1))).toThrow(Ts23dError);
    expect(() =>
      hingeMorph(ball, 'blink', { at: [0, 0, 0], axis: [0, 0, 0], degrees: 10, weight: () => 1 }),
    ).toThrow('hinge axis');
  });

  it('projects rest vertices onto the changed field along the gradient', () => {
    const m = fieldMorph(ball, 'breathe', sdSphere(1), sdSphere(1.1), { reach: 0.2 });
    expect(m.positions.length).toBe(ball.positions.length);
    for (let v = 0; v < m.positions.length / 3; v++) {
      const p: Vec3 = v3((k) => (ball.positions[v * 3 + k] ?? 0) + (m.positions[v * 3 + k] ?? 0));
      expect(Math.hypot(...p)).toBeCloseTo(1.1, 4);
    }
    const half = fieldMorph(ball, 'breathe', sdSphere(1), sdSphere(1.1), {
      weight: (p) => (p[2] > 0 ? 1 : 0),
    });
    const low = [...ball.positions].findIndex((x, i) => i % 3 === 2 && x < -0.5);
    expect(half.positions[low]).toBe(0);
  });

  it('turns a region about a hinge and sums two morphs', () => {
    const m = hingeMorph(ball, 'blink', {
      at: [0, 0, 0],
      axis: [0, 1, 0],
      degrees: 90,
      weight: () => 1,
    });
    // +X turns to −Z about +Y.
    const v = [...Array(ball.positions.length / 3).keys()].find(
      (i) => (ball.positions[i * 3] ?? 0) > 0.99,
    );
    expect(v).toBeDefined();
    const i = (v ?? 0) * 3;
    expect((ball.positions[i + 2] ?? 0) + (m.positions[i + 2] ?? 0)).toBeCloseTo(-1, 2);
    const twice = sumMorphs('blink', m, m);
    expect(twice.positions[i]).toBeCloseTo((m.positions[i] ?? 0) * 2, 6);
  });
});
