import { describe, expect, it } from 'bun:test';
import type { Vec3 } from '../core/index.ts';
import { dmath } from '../core/index.ts';
import { project } from './camera.ts';
import { solveLinear } from './camera-linalg.ts';
import {
  dltCentre,
  type Mark,
  type PhotoCamera,
  perspectiveOf,
  solveCamera,
} from './camera-solve.ts';

const TRUE: PhotoCamera = { eye: [3.2, -4.1, 1.4], target: [0.1, 0.2, 0.45], fovDeg: 38 };
const [W, H] = [800, 600];
const POINTS: Vec3[] = [
  [0.6, 0.1, 0.8],
  [-0.55, 0, 0.7],
  [0.7, 0.15, 0.05],
  [-0.4, -0.12, 0.02],
  [0.45, -0.15, 0.95],
  [-0.7, 0.05, 0.5],
  [0.1, 0.18, 0.3],
  [0, -0.2, 0.6],
];
/** Deterministic ± `px` jitter. */
const jitter = (i: number, px: number): number => ((((i * 7919) % 13) / 12) * 2 - 1) * px;

function marksOf(points: readonly Vec3[], cam: PhotoCamera, noisePx = 0): Mark[] {
  const pc = perspectiveOf(cam, W, H);
  return points.map((p, i) => {
    const [x, y] = project(pc, p[0], p[1], p[2]);
    return { px: [x + jitter(i, noisePx), y + jitter(i + 5, noisePx)], world: p };
  });
}

const dir = (c: PhotoCamera): Vec3 => {
  const d = [0, 1, 2].map((k) => (c.target[k] ?? 0) - (c.eye[k] ?? 0));
  const l = dmath.norm(d);
  return [(d[0] ?? 0) / l, (d[1] ?? 0) / l, (d[2] ?? 0) / l];
};
const angleDeg = (a: PhotoCamera, b: PhotoCamera): number => {
  const [p, q] = [dir(a), dir(b)];
  return (dmath.acos(Math.min(1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2])) * 180) / Math.PI;
};

describe('solveCamera', () => {
  it('refuses fewer than 4 marks and coincident points', () => {
    expect(() => solveCamera(marksOf(POINTS.slice(0, 3), TRUE), W, H)).toThrow(/need ≥ 4/);
    const same = Array.from({ length: 4 }, (): Mark => ({ px: [1, 2], world: [0, 0, 0] }));
    expect(() => solveCamera(same, W, H)).toThrow(/one 3D point/);
  });

  it('recovers a synthetic camera within 1° from 8 exact marks', () => {
    const { camera, rmsPx } = solveCamera(marksOf(POINTS, TRUE), W, H);
    expect(rmsPx).toBeLessThan(0.01);
    expect(angleDeg(camera, TRUE)).toBeLessThan(1);
    expect(Math.abs(camera.fovDeg - TRUE.fovDeg)).toBeLessThan(1);
    expect(dmath.norm(camera.eye.map((v, k) => v - (TRUE.eye[k] ?? 0)))).toBeLessThan(0.05);
  });

  it('stays within 1° with half-pixel noise', () => {
    const { camera } = solveCamera(marksOf(POINTS, TRUE, 0.5), W, H);
    expect(angleDeg(camera, TRUE)).toBeLessThan(1);
  });

  it('solves from only 4 non-coplanar marks (grid seeds, no DLT)', () => {
    const four = [POINTS[0], POINTS[1], POINTS[2], POINTS[4]].filter((p): p is Vec3 => !!p);
    const { camera, rmsPx } = solveCamera(marksOf(four, TRUE), W, H);
    expect(rmsPx).toBeLessThan(0.5);
    expect(angleDeg(camera, TRUE)).toBeLessThan(1);
  });

  it('is deterministic', () => {
    const m = marksOf(POINTS, TRUE, 0.5);
    expect(solveCamera(m, W, H)).toEqual(solveCamera(m, W, H));
  });
});

describe('dltCentre / solveLinear', () => {
  it('finds the eye from exact marks', () => {
    const c = dltCentre(marksOf(POINTS, TRUE));
    expect(c).not.toBeNull();
    expect(dmath.norm((c ?? [9, 9, 9]).map((v, k) => v - (TRUE.eye[k] ?? 0)))).toBeLessThan(1e-3);
  });

  it('returns null for a singular system', () => {
    expect(
      solveLinear(
        [
          [1, 2],
          [2, 4],
        ],
        [1, 2],
      ),
    ).toBeNull();
    expect(
      solveLinear(
        [
          [2, 0],
          [0, 4],
        ],
        [2, 8],
      ),
    ).toEqual([1, 2]);
  });
});
