import { afterAll, describe, expect, test } from 'bun:test';

// three.js mints every object's UUID from Math.random, which the test preload seals. Nothing here
// depends on those ids: a fixed sequence stands in, and three is imported only after it is in place.
const sealed = Math.random;
let tick = 0;
Math.random = () => (tick++ % 997) / 997;
afterAll(() => {
  Math.random = sealed;
});

const { AnimationClip, Object3D, Vector3, VectorKeyframeTrack } = await import('three');
const { readHooks } = await import('./hooks.ts');
const { pickScenario } = await import('./pick.ts');
const { burstWeight, fitDistance, loopSeconds, poseTime, swim } = await import('./swim.ts');

const cruise = new AnimationClip('cruise', -1, [
  new VectorKeyframeTrack('root.position', [0, 2], [0, 0, 0, 3, 0, 0]),
]);
const hooksOf = (medium: 'water' | 'ground' | null, kind = 'creature') =>
  readHooks(new Object3D(), kind, null, [cruise], medium);

describe('swim scenario', () => {
  test('reduced motion holds the body at its first pose', () => {
    expect(poseTime(3.5, true)).toBe(0);
    expect(poseTime(3.5, false)).toBe(3.5);
  });

  test('a ground creature with the same clips is not picked for it', () => {
    expect(pickScenario(hooksOf('ground')).id).not.toBe('swim');
    expect(pickScenario(hooksOf(null)).id).not.toBe('swim');
  });

  test('a water asset is, whatever its kind and with or without a clip', () => {
    expect(pickScenario(hooksOf('water')).id).toBe('swim');
    expect(pickScenario(hooksOf('water', 'vehicle')).id).toBe('swim');
    expect(pickScenario(readHooks(new Object3D(), 'creature', null, [], 'water')).id).toBe('swim');
  });

  test('open water has no diorama', () => {
    expect(swim.ground(hooksOf('water'))).toBeNull();
  });

  test('the loop is a whole number of clip repeats, so the wrap has no seam', () => {
    const seconds = loopSeconds(1.7);
    expect(seconds).toBeGreaterThanOrEqual(24);
    expect(Math.abs(seconds / 1.7 - Math.round(seconds / 1.7))).toBeLessThan(1e-9);
    expect(loopSeconds(null)).toBe(24);
  });

  test('the burst is silent at both ends of the loop and full in its middle', () => {
    expect(burstWeight(0, 24)).toBe(0);
    expect(burstWeight(23.99, 24)).toBe(0);
    expect(burstWeight(14.5, 24)).toBe(1);
  });

  test('a narrow screen pulls the camera back to keep the body whole', () => {
    const size = new Vector3(0.8, 0.9, 4);
    expect(fitDistance(size, 35, 0.5)).toBeGreaterThan(fitDistance(size, 35, 1.6) * 2);
  });
});
