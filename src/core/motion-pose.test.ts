import { describe, expect, it } from 'bun:test';
import { compile, defineAsset } from './asset.ts';
import { placePiece } from './define-part-place.ts';
import type { Crank } from './motion.ts';
import { LOOP_SECONDS, linkageAt, motionPose, rotateAbout } from './motion-pose.ts';
import { quatRotate, type Vec3 } from './vec.ts';

const near = (a: Vec3, b: Vec3, eps = 1e-9): void => {
  expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeLessThan(eps);
};

// A crank 0.3 m, axle 2 m behind the crosshead and 0.3 m below its line (an offset linkage).
const rod: Crank = {
  kind: 'crank',
  axis: [0, 1, 0],
  centre: [-2, 0, -0.3],
  pin: [-1.7, 0, -0.3],
  line: [1, 0, 0],
  hz: 1,
};

describe('motionPose', () => {
  it('turns right-handed like a spin: +X goes to −Z about +Y', () => {
    near(rotateAbout([1, 0, 0], [0, 1, 0], Math.PI / 2), [0, 0, -1]);
  });

  it('an orbit carries every point round the crank circle without turning', () => {
    const arm: Vec3 = [0, 0, 0.3];
    const quarter = motionPose({ kind: 'orbit', axis: [0, 1, 0], arm, hz: 1 }, 0.25);
    // A quarter turn about +Y takes the pin from +Z to +X: offset (0.3, 0, −0.3).
    near(quarter.offset, [0.3, 0, -0.3]);
    expect(quarter.rotation).toEqual([0, 0, 0, 1]);
  });

  it('a crank keeps the rod length and its big end on the crank pin at every time', () => {
    const length = Math.hypot(...rod.pin);
    for (let i = 0; i < 37; i++) {
      const t = (i / 37) * LOOP_SECONDS;
      const pose = motionPose(rod, t);
      const big = quatRotate(pose.rotation, rod.pin);
      const end: Vec3 = [big[0] + pose.offset[0], big[1] + pose.offset[1], big[2] + pose.offset[2]];
      const crankPin = rotateAbout([0.3, 0, 0], [0, 1, 0], 2 * Math.PI * t);
      near(end, [rod.centre[0] + crankPin[0], 0, rod.centre[2] + crankPin[2]], 1e-9);
      expect(Math.hypot(...big)).toBeCloseTo(length, 9);
      // The small end stays on its line.
      expect(Math.abs(pose.offset[1])).toBe(0);
      expect(Math.abs(pose.offset[2])).toBe(0);
    }
  });

  it('a piston follows the exact slider-crank law, not a sinusoid', () => {
    const L = Math.hypot(...rod.pin);
    // θ = half a turn: pin at centre − r on X → x = −2 − 0.3 + √(L² − 0.3²) − (−1.7 + …).
    const { x } = linkageAt(rod, Math.PI);
    const x0 = -1.7 + Math.sqrt(L * L - 0.09);
    const xHalf = -2.3 + Math.sqrt(L * L - 0.09);
    expect(x).toBeCloseTo(xHalf - x0 + 0, 9);
    const p = motionPose({ ...rod, kind: 'piston' }, 0.5);
    expect(p.offset[0]).toBeCloseTo(x, 9);
    expect(p.rotation).toEqual([0, 0, 0, 1]);
  });
});

describe('motion validation', () => {
  const build = (motion: Crank | { kind: 'orbit'; axis: Vec3; arm: Vec3; hz: number }) =>
    defineAsset({
      name: 'linkage',
      kind: 'prop',
      budget: { triangles: [9, 9, 9] },
      build(ctx) {
        ctx.group('rod', { motion });
      },
    });

  it('rejects a rod too short to reach round its crank', () => {
    expect(() => compile(build({ ...rod, pin: [-0.2, 0, -0.3], centre: [-0.5, 0, -0.3] }))).toThrow(
      /cannot reach/,
    );
  });

  it('rejects a slide line along the crank axle and a zero throw', () => {
    expect(() => compile(build({ ...rod, line: [0, 1, 0] }))).toThrow(/not normal/);
    expect(() => compile(build({ ...rod, pin: rod.centre }))).toThrow(/zero throw/);
    expect(() =>
      compile(build({ kind: 'orbit', axis: [0, 1, 0], arm: [0, 0.3, 0], hz: 1 })),
    ).toThrow(/no length across/);
    expect(() => compile(build({ ...rod, hz: Number.NaN }))).toThrow(/not finite/);
  });

  it('accepts a real linkage', () => {
    expect(() => compile(build(rod))).not.toThrow();
  });
});

describe('mirrored linkages', () => {
  it('a mirrored orbit still rides its mirrored pins', () => {
    const orbit = { kind: 'orbit', axis: [0, 1, 0], arm: [0.12, 0, 0.3], hz: 1 } as const;
    const m = placePiece({ name: 'rod', mesh: null, motion: orbit }, { scale: [-1, 1, 1] }).motion;
    expect(m?.kind).toBe('orbit');
    if (m?.kind !== 'orbit') return;
    for (const t of [0.1, 0.37, 0.8]) {
      const o = motionPose(orbit, t).offset;
      near(motionPose(m, t).offset, [-o[0], o[1], o[2]], 1e-9);
    }
  });

  it('a mirrored crank still rides its mirrored pin', () => {
    const m = placePiece({ name: 'rod', mesh: null, motion: rod }, { scale: [-1, 1, 1] }).motion;
    expect(m?.kind).toBe('crank');
    if (m?.kind !== 'crank') return;
    for (const t of [0.1, 0.37, 0.8]) {
      const pose = motionPose(m, t);
      const big = quatRotate(pose.rotation, m.pin);
      const original = motionPose(rod, t);
      const ob = quatRotate(original.rotation, rod.pin);
      // Mirror of the original big end.
      near(
        [big[0] + pose.offset[0], big[1], big[2]],
        [-(ob[0] + original.offset[0]), ob[1], ob[2]],
        1e-9,
      );
    }
  });
});
