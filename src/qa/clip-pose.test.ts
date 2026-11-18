// Sampling a clip: the keys around a time are found exactly, at every position in a track, and
// fast enough that QA can pose very long clips frame by frame.

import { describe, expect, it } from 'bun:test';
import type { Clip } from '../core/index.ts';
import { clipPose } from './clip-pose.ts';

const ramp = (keys: number): Clip => {
  const times = Float32Array.from({ length: keys }, (_, i) => i);
  const values = new Float32Array(keys * 3);
  for (let i = 0; i < keys; i++) values[i * 3] = i * 2;
  return {
    name: 'ramp',
    seconds: keys - 1,
    loop: false,
    tracks: [{ bone: 'root', path: 'translation', times, values }],
  };
};

const xAt = (clip: Clip, t: number): number =>
  clipPose(clip, t).translation.get('root')?.[0] ?? NaN;

describe('clipPose', () => {
  it('interpolates between the right keys, and holds both ends', () => {
    const clip = ramp(9);
    for (const t of [0, 0.25, 1, 3.5, 4, 6.75, 7, 7.5, 8])
      expect(xAt(clip, t)).toBeCloseTo(t * 2, 5);
    expect(xAt(clip, -1)).toBe(0);
    expect(xAt(clip, 99)).toBe(16);
  });

  it('samples a very long track without scanning it each time', () => {
    const clip = ramp(200_000);
    const start = performance.now();
    for (let f = 0; f < 4000; f++) xAt(clip, 150_000 + f / 8);
    expect(performance.now() - start).toBeLessThan(500);
  });
});
