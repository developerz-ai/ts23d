// The sliding door's stops: the same block at both ends of the track, clear of the door's travel.
import { describe, expect, test } from 'bun:test';
import { DOOR_SLIDE, DOOR_STOPS } from './boxcar.ts';

const DOOR_W = 1.83;

describe('boxcar door stops', () => {
  test('both stops are the same 6 cm block', () => {
    for (const [x0, x1] of DOOR_STOPS) expect(x1 - x0).toBeCloseTo(0.06, 9);
  });

  test('each stop sits 4 cm beyond the door edge that meets it', () => {
    const [closed, open] = DOOR_STOPS;
    expect((closed?.[0] ?? 0) - DOOR_W / 2).toBeCloseTo(0.04, 9);
    expect(-(DOOR_W / 2 + DOOR_SLIDE) - (open?.[1] ?? 0)).toBeCloseTo(0.04, 9);
  });
});
