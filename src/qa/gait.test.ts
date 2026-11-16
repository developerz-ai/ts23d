// gait: a planted foot that slides, a foot through the floor and a loop that does not close fail.

import { describe, expect, it } from 'bun:test';
import type { Armature, Clip } from '../core/index.ts';
import { feetOf, gaitFindings, SLIDE_LIMIT } from './gait.ts';
import { rig, walk, walkerBones } from './motion-fixtures.ts';

describe('gait', () => {
  it('fails a planted foot that slides 1 cm a frame at the root speed', () => {
    const f = gaitFindings(rig(walk(0.3)));
    const slide = f.find((x) => x.code === 'T3D_GAIT_FOOT_SLIDE');
    expect(slide?.message).toContain("foot 'leg' slides");
    expect(slide?.fix).toContain('stride');
  });

  it('fails a loop whose last key is not its first', () => {
    expect(gaitFindings(rig(walk(0, 0.3))).some((x) => x.message.includes('does not loop'))).toBe(
      true,
    );
  });

  it('fails a foot that sinks below its rest height', () => {
    const c = walk(0);
    const sunk: Clip = {
      ...c,
      tracks: c.tracks.map((t) =>
        t.path === 'translation'
          ? { ...t, values: t.values.map((v, k) => (k % 3 === 2 ? -0.01 : v)) }
          : t,
      ),
    };
    expect(gaitFindings(rig(sunk)).some((x) => x.message.includes('sinks'))).toBe(true);
  });

  it('passes a foot held in place while the root travels (the leg leans as the body passes)', () => {
    // The arc lifts the foot off the band except near vertical: no frame pair slides > 1 mm.
    const f = gaitFindings(rig(walk(0)));
    expect(f.filter((x) => x.code === 'T3D_GAIT_FOOT_SLIDE')).toEqual([]);
    expect(SLIDE_LIMIT).toBe(0.001);
  });

  it('finds feet as low leaf bones, never `_mid` helpers', () => {
    const sk: Armature = {
      bones: [
        ...walkerBones,
        { name: 'leg_mid', parent: 'root', head: [0, 0, 0.5], tail: [0, 0, 0.01] },
      ],
    };
    expect(feetOf(sk).map((b) => b.name)).toEqual(['leg']);
  });
});
