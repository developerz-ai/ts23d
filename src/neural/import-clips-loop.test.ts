// closeCycle: a one-shot must stay a one-shot (failure case first); a cycle baked without its
// closing frame gains exactly one key and loops; a closed clip is left alone.

import { describe, expect, test } from 'bun:test';
import type { Clip, Track } from '../core/index.ts';
import { closeCycle } from './import-clips-loop.ts';

const FPS = 30;

/** A hip swing (rotation about Y) and a root bob, `keys` keys at 30 fps, phase(i) in turns. */
function clip(keys: number, phase: (i: number) => number): Clip {
  const times = Float32Array.from({ length: keys }, (_, i) => i / FPS);
  const rot = new Float32Array(keys * 4);
  const bob = new Float32Array(keys * 3);
  for (let i = 0; i < keys; i++) {
    const a = 0.4 * Math.sin(2 * Math.PI * phase(i));
    rot.set([0, Math.sin(a / 2), 0, Math.cos(a / 2)], i * 4);
    bob.set([0, 0, 0.02 * Math.cos(4 * Math.PI * phase(i))], i * 3);
  }
  const tracks: Track[] = [
    { bone: 'thigh', path: 'rotation', times, values: rot },
    { bone: 'hips', path: 'translation', times, values: bob },
  ];
  return { name: 'walk', seconds: Math.fround((keys - 1) / FPS), loop: false, tracks };
}

/** 30 frames of a 30-frame cycle: keys 0 … 29, the key at 1 s (= key 0) missing. */
const short = clip(30, (i) => i / 30);

describe('closeCycle', () => {
  test('a one-shot is not a cycle: far from its start, or eased to a stop', () => {
    // A quarter swing that stops at its extreme: the way back is 20 frames of motion.
    expect(closeCycle(clip(30, (i) => i / 120))).toBeNull();
    // Eases out to a pose next to (not at) the start: no velocity to continue into key 0.
    expect(closeCycle(clip(30, (i) => 0.97 * (1 - (1 - i / 29) ** 3)))).toBeNull();
    // Runs backwards into the seam: the jump opposes the motion on both sides.
    const tail = clip(30, (i) => (i < 15 ? i / 30 : (29 - i) / 30 + 1 / 60));
    expect(closeCycle(tail)).toBeNull();
  });

  test('sparse or offset keys tell nothing: left alone', () => {
    const sparse: Clip = {
      ...short,
      tracks: short.tracks.map((t) => ({ ...t, times: t.times.map((x, i) => (i ? x + 0.2 : x)) })),
    };
    expect(closeCycle(sparse)).toBeNull();
    expect(closeCycle(clip(2, (i) => i / 2))).toBeNull();
    // The file declares a longer clip than its keys span: the hold is the author's.
    expect(closeCycle({ ...short, seconds: 2 })).toBeNull();
  });

  test('a cycle one frame short gains key 0 one frame later, and only once', () => {
    const got = closeCycle(short);
    expect(got?.fps).toBe(30);
    expect(got?.step).toBe(1 / 30);
    const c = got?.clip as Clip;
    expect(c.loop).toBe(true);
    expect(c.seconds).toBeCloseTo(1, 6);
    for (const [i, t] of c.tracks.entries()) {
      const s = t.values.length / t.times.length;
      expect(t.times.length).toBe(31);
      expect(t.times[30]).toBeCloseTo(1, 6);
      expect([...t.values.subarray(30 * s)]).toEqual([...t.values.subarray(0, s)]);
      // The keys that were there are untouched.
      expect([...t.values.subarray(0, 30 * s)]).toEqual([...(short.tracks[i]?.values ?? [])]);
    }
    expect(closeCycle(c)).toBeNull();
  });

  test('a held track (two equal keys) does not hide the cycle and is extended with it', () => {
    const hold: Track = {
      bone: 'thigh_offset',
      path: 'translation',
      times: Float32Array.from([0, short.seconds]),
      values: Float32Array.from([0.01, 0, 0, 0.01, 0, 0]),
    };
    const c = closeCycle({ ...short, tracks: [...short.tracks, hold] })?.clip;
    expect(c?.loop).toBe(true);
    expect([...(c?.tracks[2]?.times ?? [])].map((t) => +t.toFixed(4))).toEqual([0, 0.9667, 1]);
    expect([...(c?.tracks[2]?.values.subarray(6) ?? [])]).toEqual([...hold.values.subarray(0, 3)]);
  });

  test('a rotation seam across the double cover is still one small turn', () => {
    const flipped: Clip = {
      ...short,
      tracks: short.tracks.map((t) =>
        t.path === 'rotation'
          ? { ...t, values: t.values.map((v, k) => (k >= 29 * 4 ? -v : v)) }
          : t,
      ),
    };
    const rot = closeCycle(flipped)?.clip.tracks[0];
    const v = rot?.values ?? new Float32Array(0);
    // Appended on the last key's side: key 30 = −key 0, a short lerp from key 29.
    expect([v[30 * 4 + 1], v[30 * 4 + 3]]).toEqual([-(v[1] ?? 0), -(v[3] ?? 0)]);
    const dot = [0, 1, 2, 3].reduce((d, k) => d + (v[29 * 4 + k] ?? 0) * (v[30 * 4 + k] ?? 0), 0);
    expect(dot).toBeGreaterThan(0.99);
  });
});
