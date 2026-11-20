// The nose droops ahead of the hood's front shut line and nowhere behind it: the hood is cut from
// the body at a station (an s), and in the nose cap the outer lines reach further forward at one
// s than the centre line, so a drop keyed on x alone moved the hood's own front corners.
import { describe, expect, test } from 'bun:test';
import { noseDropAt, S_MAX, sAtX, X_HOOD_FRONT } from './shape.ts';

describe('roadster_v10 nose drop', () => {
  const sHood = sAtX(X_HOOD_FRONT, 0);

  test('no line moves on or behind the hood front station', () => {
    for (const s of [0.4, 1.0, 1.5, sHood - 0.05, sHood])
      for (const d of noseDropAt(s)) expect(d).toBeLessThan(1e-9);
  });

  test('the upper lines do drop at the nose tip', () => {
    const tip = noseDropAt(S_MAX);
    expect(Math.max(...tip)).toBeGreaterThan(0.025);
  });
});
