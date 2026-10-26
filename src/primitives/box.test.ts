import { describe, expect, it } from 'bun:test';
import { boundsOf, triangleCount } from '../core/index.ts';
import { box } from './box.ts';
import { cylinder } from './lathe.ts';

describe('box', () => {
  it('stands on the ground with the given size', () => {
    const m = box({ size: [2, 1, 3], color: [1, 1, 1] });
    expect(boundsOf(m)).toEqual({ min: [-1, -0.5, 0], max: [1, 0.5, 3] });
    expect(triangleCount(m)).toBe(12);
  });

  it('omits hidden faces', () => {
    expect(triangleCount(box({ size: [1, 1, 1], color: [1, 1, 1], omit: ['bottom'] }))).toBe(10);
  });
});

describe('cylinder', () => {
  it('scales triangles with segments (the LOD knob)', () => {
    const lo = cylinder({ radius: 1, length: 1, segments: 8, color: [1, 1, 1] });
    const hi = cylinder({ radius: 1, length: 1, segments: 32, color: [1, 1, 1] });
    expect(triangleCount(hi)).toBe(4 * triangleCount(lo));
  });
});
