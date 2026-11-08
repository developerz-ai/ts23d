import { describe, expect, test } from 'bun:test';
import { boundsOf, type Vec3 } from '../core/index.ts';
import { box as mk } from '../primitives/index.ts';
import { meshBounds, solidIndex, triangleGrid } from './geometry-cache.ts';

const c: Vec3 = [0.5, 0.5, 0.5];
const box = (s: Vec3) => mk({ size: s, color: c });

describe('geometry cache', () => {
  test('different meshes never share an index (a stale hit would answer for the wrong part)', () => {
    const a = box([1, 1, 1]);
    const b = box([2, 2, 2]);
    expect(meshBounds(a)).not.toBe(meshBounds(b));
    expect(meshBounds(b).max[0]).toBeCloseTo(boundsOf(b).max[0], 9);
    expect(triangleGrid(a)).not.toBe(triangleGrid(b));
    expect(solidIndex(a).inside([0.9, 0, 0.5])).toBe(false);
    expect(solidIndex(b).inside([0.9, 0, 0.5])).toBe(true);
  });
  test('the same mesh returns the same index object', () => {
    const a = box([1, 1, 1]);
    expect(meshBounds(a)).toBe(meshBounds(a));
    expect(triangleGrid(a)).toBe(triangleGrid(a));
    expect(solidIndex(a)).toBe(solidIndex(a));
  });
});
