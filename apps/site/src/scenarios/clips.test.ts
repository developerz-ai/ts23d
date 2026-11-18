import { afterAll, describe, expect, test } from 'bun:test';
import type { AnimationClip as Clip } from 'three';

// three.js mints every object's UUID from Math.random, which the test preload seals. Nothing here
// depends on those ids: a fixed sequence stands in, and three is imported only after it is in place.
const sealed = Math.random;
let tick = 0;
Math.random = () => (tick++ % 997) / 997;
afterAll(() => {
  Math.random = sealed;
});

const { AnimationClip, QuaternionKeyframeTrack, VectorKeyframeTrack } = await import('three');
const { burstClip, firstClip, inPlace, isLoop, swimClip, travelOf } = await import('./clips.ts');

const TIMES = [0, 0.5, 1, 1.5, 2];
/** Forward 3 m per loop, with a sideways recoil that returns to 0. */
const TRAVEL = [0, 0, 0, 0.75, 0.1, 0, 1.5, 0, 0, 2.25, -0.1, 0, 3, 0, 0];
const SPIN = (end: number): number[] => [
  ...[0, 0, 0, 1],
  ...[0, 0, 0.1, 0.995],
  ...[0, 0, 0, 1],
  ...[0, 0, -0.1, 0.995],
  ...[0, 0, 0, end],
];

const clip = (name: string, position = TRAVEL, end = 1): Clip =>
  new AnimationClip(name, -1, [
    new VectorKeyframeTrack('root.position', TIMES, position),
    new QuaternionKeyframeTrack('tail.quaternion', TIMES, SPIN(end)),
  ]);

const still = TRAVEL.map(() => 0);
/** A pose that does not come back: the tail ends turned. */
const oneShot = (name: string): Clip =>
  new AnimationClip(name, -1, [
    new VectorKeyframeTrack('root.position', TIMES, TRAVEL),
    new QuaternionKeyframeTrack('tail.quaternion', TIMES, [
      ...SPIN(1).slice(0, 16),
      ...[0, 0, Math.SQRT1_2, Math.SQRT1_2],
    ]),
  ]);

const rootOf = (c: Clip): Float32Array => {
  const t = c.tracks[0];
  if (!t) throw new Error('clip has no root track');
  return t.values as Float32Array;
};

describe('inPlace', () => {
  test('the raw clip has a seam: its root ends 3 m from where it starts', () => {
    expect(travelOf(clip('cruise'))).toBeCloseTo(3);
  });

  test('removes the seam: the last root key is the first', () => {
    const fixed = inPlace(clip('cruise'));
    const v = rootOf(fixed);
    expect([...v.slice(-3)]).toEqual([...v.slice(0, 3)]);
    expect(travelOf(fixed)).toBe(0);
  });

  test('takes out the drift only: the recoil between the ends survives', () => {
    const v = rootOf(inPlace(clip('cruise')));
    expect(v[3]).toBeCloseTo(0);
    expect(v[4]).toBeCloseTo(0.1);
    expect(v[10]).toBeCloseTo(-0.1);
  });

  test('leaves the source clip untouched (the GLB clip stays as baked)', () => {
    const source = clip('cruise');
    inPlace(source);
    expect(travelOf(source)).toBeCloseTo(3);
  });

  test('a clip that does not loop keeps its travel', () => {
    const shot = oneShot('cstart_l');
    expect(isLoop(shot)).toBe(false);
    expect(inPlace(shot)).toBe(shot);
  });

  test('a loop that does not travel comes back as it is', () => {
    const idle = clip('idle', still);
    expect(inPlace(idle)).toBe(idle);
  });

  test('a whole turn closes: q and -q are the same pose', () => {
    const turned = new AnimationClip('turn_l', -1, [
      new QuaternionKeyframeTrack('root.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, -1]),
    ]);
    expect(isLoop(turned)).toBe(true);
  });
});

describe('swimClip', () => {
  test('no loop to show: nothing, never a one-shot or the rest pose', () => {
    expect(swimClip([oneShot('cstart_l'), clip('rest', still)])).toBeNull();
  });

  test('prefers cruise over every other loop', () => {
    const picked = swimClip([clip('idle', still), clip('burst'), clip('cruise')]);
    expect(picked?.name).toBe('cruise');
  });

  test('without cruise: any travelling loop, then idle', () => {
    expect(swimClip([clip('idle', still), clip('jet')])?.name).toBe('jet');
    expect(swimClip([clip('idle', still), clip('pulse', still)])?.name).toBe('idle');
  });

  test('a seabed gait is not swimming: the octopus idles rather than crawl on nothing', () => {
    expect(swimClip([clip('crawl'), clip('idle', still)])?.name).toBe('idle');
    expect(swimClip([clip('crawl')])).toBeNull();
  });

  test('burst is found only when it loops', () => {
    expect(burstClip([clip('cruise')])).toBeNull();
    expect(burstClip([oneShot('burst')])).toBeNull();
    expect(burstClip([clip('burst')])?.name).toBe('burst');
  });
});

describe('firstClip', () => {
  const named = (...names: string[]): Clip[] => names.map((n) => new AnimationClip(n, 1, []));

  test('nothing baked, nothing bound', () => {
    expect(firstClip([])).toBeNull();
  });

  test('cruise before idle, and a ground gait waits to be picked', () => {
    expect(firstClip(named('idle', 'bite', 'cruise'))?.name).toBe('cruise');
    expect(firstClip(named('slither', 'sidewind', 'idle'))?.name).toBe('idle');
  });

  test('a mechanical run still wins, and idle beats an arbitrary first clip', () => {
    expect(firstClip(named('cruise', 'run'))?.name).toBe('run');
    expect(firstClip(named('reach', 'strike_0', 'idle'))?.name).toBe('idle');
    expect(firstClip(named('reach', 'strike_0'))?.name).toBe('reach');
  });
});
