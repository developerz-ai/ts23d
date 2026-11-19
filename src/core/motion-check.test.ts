import { describe, expect, it } from 'bun:test';
import { Ts23dError } from './errors.ts';
import type { Tread } from './motion.ts';
import { checkMotion, MOTION_KINDS } from './motion-check.ts';
import type { Vec3 } from './vec.ts';

const loop: Vec3[] = [
  [0, 0, 0],
  [2, 0, 0],
  [2, 0, 1],
  [0, 0, 1],
];
const tread = (over: Partial<Tread>): Tread => ({
  kind: 'tread',
  path: loop,
  pitch: 0.15,
  ...over,
});

const failure = (m: Tread): Ts23dError | null => {
  try {
    checkMotion('track_l', m);
  } catch (e) {
    if (e instanceof Ts23dError) return e;
    throw e;
  }
  return null;
};

describe('checkMotion: tread', () => {
  it('refuses a path that is no loop, a non-finite point and a pitch that is not > 0', () => {
    const bad: readonly Partial<Tread>[] = [
      { path: [] },
      { path: loop.slice(0, 2) },
      { path: [...loop.slice(0, 3), [0, Number.NaN, 1]] },
      { path: [...loop.slice(0, 3), [0, 0] as unknown as Vec3] },
      { pitch: 0 },
      { pitch: -0.15 },
      { pitch: Number.NaN },
      { pitch: Number.POSITIVE_INFINITY },
    ];
    for (const over of bad) {
      const e = failure(tread(over));
      expect(e?.code).toBe('T3D_RECIPE_INVALID');
      expect(e?.message).toContain("part 'track_l' motion");
      expect(e?.fix).toBeTruthy();
    }
  });

  it('accepts a closed belt with a positive pitch', () => {
    expect(failure(tread({}))).toBeNull();
  });
});

describe('checkMotion: kind', () => {
  it('an unknown kind is T3D_RECIPE_INVALID naming every valid kind, not a TypeError later', () => {
    const swing = { kind: 'swing', axis: [0, 1, 0], degrees: 30, hz: 0.5 } as unknown as Tread;
    const e = failure(swing);
    expect(e?.code).toBe('T3D_RECIPE_INVALID');
    expect(e?.message).toContain("'swing'");
    for (const k of MOTION_KINDS) expect(e?.fix).toContain(`'${k}'`);
    expect(failure({ path: loop, pitch: 0.15 } as unknown as Tread)?.code).toBe(
      'T3D_RECIPE_INVALID',
    );
  });

  it('lists every kind of the Motion union', () => {
    expect([...MOTION_KINDS].sort()).toEqual<string[]>(
      ['crank', 'orbit', 'piston', 'slide', 'spin', 'sway', 'tread'].sort(),
    );
  });
});
