import { describe, expect, it } from 'bun:test';
import { tread } from './tread.ts';

describe('tread', () => {
  it('refuses a belt line too short to loop', () => {
    expect(() =>
      tread(
        [
          [0, 0],
          [1, 0],
        ],
        1,
        0.2,
      ),
    ).toThrow('T3D_RECIPE_INVALID');
  });

  it('refuses a non-positive pitch', () => {
    expect(() =>
      tread(
        [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
        1,
        0,
      ),
    ).toThrow('pitch');
  });

  it('lifts the side-plane line onto the track centre', () => {
    const t = tread(
      [
        [0, 0],
        [2, 0],
        [2, 1],
      ],
      -1.2,
      0.17,
    );
    expect(t.kind).toBe('tread');
    expect(t.path).toEqual([
      [0, -1.2, 0],
      [2, -1.2, 0],
      [2, -1.2, 1],
    ]);
    expect(t.pitch).toBe(0.17);
  });
});
