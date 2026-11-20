import { describe, expect, test } from 'bun:test';
import { dmath } from '@developerz.ai/ts23d/core';
import { sphereDistance } from './sphere-fit.ts';

const rad = (deg: number): number => (deg * Math.PI) / 180;

describe('sphereDistance', () => {
  test('a portrait view fits the sphere across its narrower width', () => {
    const across = 2 * dmath.atan(dmath.tan(rad(40) / 2) * 0.5);
    expect(sphereDistance(1, 40, 0.5)).toBeCloseTo(1 / dmath.sin(across / 2), 9);
  });

  test('a landscape view is limited by its height', () => {
    expect(sphereDistance(1, 40, 2)).toBeCloseTo(1 / dmath.sin(rad(20)), 9);
  });
});
