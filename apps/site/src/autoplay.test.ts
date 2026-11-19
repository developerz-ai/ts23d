import { describe, expect, test } from 'bun:test';
import { playingOnArrival } from './autoplay.ts';

const base = {
  fresh: true,
  mode: 'studio',
  playing: false,
  swims: false,
  reduced: false,
} as const;

describe('playback when a subject arrives on screen', () => {
  test('switching the tier while a Scene plays keeps the scenario playing', () => {
    // ranger in Scene mode, playing; the tier toggle makes the arrival fresh but stays in Scene.
    expect(playingOnArrival({ ...base, mode: 'scene', playing: true })).toBe(true);
    expect(playingOnArrival({ ...base, mode: 'scene', playing: true, swims: true })).toBe(true);
    expect(playingOnArrival({ ...base, mode: 'scene', playing: false })).toBe(false);
  });

  test('a fresh Studio subject plays only when it swims (water + a clip), motion allowed', () => {
    expect(playingOnArrival({ ...base, swims: true })).toBe(true);
    expect(playingOnArrival({ ...base, playing: true })).toBe(false);
    expect(playingOnArrival({ ...base, swims: true, reduced: true })).toBe(false);
  });

  test('the same subject again (another LOD, a mode switch) keeps what the visitor chose', () => {
    for (const mode of ['studio', 'scene'] as const)
      for (const playing of [true, false])
        expect(playingOnArrival({ ...base, fresh: false, mode, playing, swims: true })).toBe(
          playing,
        );
  });
});
