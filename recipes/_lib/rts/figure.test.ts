// The shared Saltmarch figure: the default poses keep their upright grip, and the `shoulder` pose
// gives a grip axis whose handle the fist closes round at every LOD and that rests on the right
// shoulder rather than floating over it or running through the head. Failure first: a handle
// laid along the wrong axis must fail the same joint check.

import { describe, expect, it } from 'bun:test';
import { cylinder, defineAsset, dmath, type Lod, place, type Vec3 } from '@developerz.ai/ts23d';
import { assertJointsFit } from '@developerz.ai/ts23d/testing';
import { figure } from './figure.ts';
import { Kit } from './finish.ts';
import { BOOT, CLOTH, LEATHER } from './style.ts';

const HANDLE_R = 0.018;

const opts = (right: 'hang' | 'hold' | 'shoulder') =>
  ({
    suit: CLOTH,
    torso: CLOTH,
    torsoStrip: 'canvas',
    boots: BOOT,
    hands: LEATHER,
    right,
    handleR: HANDLE_R,
  }) as const;

/** A shouldering figure whose 0.8 m handle runs along `axisOf(gripAxis)` (default: gripAxis). */
const carrier = (axisOf?: (a: Vec3) => Vec3) =>
  defineAsset({
    name: axisOf ? 'figure_wrong_axis' : 'figure_shoulder',
    kind: 'character',
    budget: { triangles: [20000, 6000, 1000] },
    build(ctx) {
      const kit = new Kit();
      const pts = figure(kit, ctx.lod, opts('shoulder'));
      const axis = axisOf ? axisOf(pts.gripAxis) : pts.gripAxis;
      const handle = cylinder({
        radius: HANDLE_R,
        length: 0.8,
        segments: 8,
        at: [0, 0, 0.3],
        color: LEATHER,
      });
      kit.add('handle', place(handle, { at: pts.grip, pitch: dmath.atan2(axis[0], axis[2]) }));
      kit.commit(ctx, []);
      ctx.joint('grip_r', {
        from: 'hand_r',
        to: 'handle',
        at: pts.grip,
        axis: pts.gripAxis,
        kind: 'grip',
      });
    },
  });

describe('figure right-arm poses', () => {
  it('keeps the upright grip for hold and hang (the default poses)', () => {
    for (const right of ['hold', 'hang'] as const)
      for (const lod of [0, 1, 2] as Lod[])
        expect(figure(new Kit(), lod, opts(right)).gripAxis).toEqual([0, 0, 1]);
  });

  it('fails a handle held upright, as if the pose were still `hold`', () => {
    expect(() => assertJointsFit(carrier(() => [0, 0, 1]))).toThrow(/T3D_JOINT/);
  });

  it('shoulder: the fist closes round the handle at every LOD', () => {
    assertJointsFit(carrier());
  });

  it('shoulder: the handle rests on the shoulder top and clears the head', () => {
    const p = figure(new Kit(), 0, opts('shoulder'));
    const [ax, , az] = p.gripAxis;
    expect(dmath.hypot(ax, az)).toBeCloseTo(1, 9);
    // Up and back from a fist in front of the chest.
    expect(ax).toBeLessThan(-0.5);
    expect(az).toBeGreaterThan(0.3);
    // Where the handle passes over the shoulder (x = shoulder x), it sits on the upper arm.
    const t = (p.shoulder[0] - p.grip[0]) / ax;
    const z = p.grip[2] + az * t;
    const top = p.shoulder[2] + 0.072;
    expect(z - HANDLE_R - top).toBeGreaterThanOrEqual(-0.002);
    expect(z - HANDLE_R - top).toBeLessThan(0.01);
    // Beside the head, never through it.
    expect(Math.abs(p.grip[1]) - HANDLE_R).toBeGreaterThan(p.headR[1]);
  });
});
