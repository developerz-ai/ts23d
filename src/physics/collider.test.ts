import { describe, expect, it } from 'bun:test';
import type { Mesh, Vec3 } from '../core/index.ts';
import { merge } from '../core/index.ts';
import { fitCollider } from './collider.ts';
import { fitBox, fitSphere, MIN_SIZE } from './fit.ts';
import { boxMesh, cylinderMesh } from './fixtures.ts';
import { pointsOf } from './hull-cap.ts';

const contains = (m: Mesh, inside: (p: Vec3) => boolean): boolean =>
  pointsOf(m.positions).every(inside);

describe('fitCollider', () => {
  it('none and empty meshes get no collider', () => {
    expect(fitCollider(boxMesh([1, 1, 1]), 'none')).toBeNull();
    expect(fitCollider({ ...boxMesh([1, 1, 1]), indices: new Uint32Array() })).toBeNull();
  });

  it('a flat card still gets a box with a positive thickness', () => {
    const card = boxMesh([1, 1, 0]);
    const fit = fitCollider(card, 'auto');
    expect(fit?.collider.kind).toBe('box');
    if (fit?.collider.kind === 'box') expect(fit.collider.size[2]).toBe(MIN_SIZE);
  });

  it('auto picks a box for a box (ratio 1)', () => {
    const fit = fitCollider(boxMesh([2, 1, 0.5], [1, 0, 0]));
    expect(fit?.collider.kind).toBe('box');
    expect(fit?.ratio).toBeCloseTo(1, 6);
    if (fit?.collider.kind === 'box') expect(fit.collider.center[0]).toBeCloseTo(1, 6);
  });

  it('auto picks a cylinder for a cylinder, axis along Z', () => {
    const fit = fitCollider(cylinderMesh(0.5, 2, 48));
    expect(fit?.collider.kind).toBe('cylinder');
    if (fit?.collider.kind !== 'cylinder') return;
    expect(fit.collider.radius).toBeCloseTo(0.5, 6);
    expect(fit.collider.height).toBeCloseTo(2, 6);
    // The shape's local +Y (third column of the rotation matrix's Y image) lands on ±Z.
    const [x, y, z, w] = fit.collider.rotation;
    expect(Math.abs(2 * (y * z + w * x))).toBeCloseTo(1, 6);
  });

  it('a capsule fitted to a cylinder encloses its rims: cap centres at the end faces', () => {
    const cyl = cylinderMesh(0.5, 2, 48);
    const fit = fitCollider(cyl, 'capsule');
    expect(fit?.collider.kind).toBe('capsule');
    if (fit?.collider.kind !== 'capsule') return;
    const { radius, height } = fit.collider;
    expect(radius).toBeCloseTo(0.5, 6);
    expect(height).toBeCloseTo(2, 6);
    const inCapsule = (p: Vec3): boolean => {
      const z = Math.max(-height / 2, Math.min(height / 2, p[2]));
      return Math.hypot(p[0], p[1], p[2] - z) <= radius + 1e-6;
    };
    expect(contains(cyl, inCapsule)).toBe(true);
  });

  it('sphere fit radius of a cube is half the diagonal', () => {
    const pts = pointsOf(boxMesh([1, 1, 1], [3, 0, 0]).positions);
    const s = fitSphere(pts, fitBox(pts));
    expect(s.radius).toBeCloseTo(Math.sqrt(3) / 2, 6);
    expect(s.center[0]).toBeCloseTo(3, 6);
  });

  it('auto falls back to a convex hull for an L shape (implicit shapes overshoot)', () => {
    const l = merge([boxMesh([2, 0.4, 0.4], [1, 0, 0]), boxMesh([0.4, 0.4, 2], [0, 0, 1])]);
    const fit = fitCollider(l);
    expect(fit?.collider.kind).toBe('convex');
    if (fit?.collider.kind === 'convex')
      expect(fit.collider.hull.vertices.length).toBeLessThanOrEqual(64);
  });

  it('a rotated box gets an oriented (PCA) box, not the loose axis-aligned one', () => {
    const m = boxMesh([4, 0.5, 0.5]);
    const c = Math.cos(Math.PI / 4);
    const positions = new Float32Array(m.positions);
    for (let i = 0; i < positions.length; i += 3) {
      const [x, y] = [positions[i] ?? 0, positions[i + 1] ?? 0];
      positions[i] = c * x - c * y;
      positions[i + 1] = c * x + c * y;
    }
    const fit = fitCollider({ ...m, positions }, 'box');
    expect(fit?.ratio).toBeCloseTo(1, 4);
  });
});
