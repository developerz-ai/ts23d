// deform, twist along chains: a joint twisted past the section-area limit fails.

import { describe, expect, it } from 'bun:test';
import type { Bone, Vec3 } from '../core/index.ts';
import { radial, rigged, spine, swing } from './chain-fixtures.ts';
import { AREA_KEPT, chainTwistFindings, TWIST_LIMIT, twistDegrees } from './chain-twist.ts';
import { deformFindings, poseDeform, romPoses } from './deform.ts';
import { elbow, smooth, tube } from './motion-fixtures.ts';
import { weldIds } from './self-intersect.ts';

const along: Vec3 = [-1, 0, 0];

describe('chain twist', () => {
  it('fails a clip twisting a chain joint past the limit, through the deform gate', () => {
    const a = rigged(spine(8, 2), [swing('spine_3', along, 60)]);
    const [f, ...rest] = deformFindings(a);
    expect(rest).toEqual([]);
    expect(f?.code).toBe('T3D_DEFORM_TWIST');
    expect(f?.gate).toBe('deform');
    expect(f?.message).toContain("'spine_3'");
    expect(f?.message).toContain('60.0°');
    expect(f?.fix).toContain('spread');
  });

  it('fails a declared limit.twist past the limit', () => {
    const bones = spine(8, 2).map(
      (b): Bone =>
        b.name === 'spine_2' ? { ...b, limit: { axis: [0, 0, 1], min: 0, max: 10, twist: 90 } } : b,
    );
    expect(chainTwistFindings(rigged(bones, []))[0]?.message).toContain('±90°');
  });

  it('sets the limit where the section keeps 85 % of its area', () => {
    expect(TWIST_LIMIT).toBeCloseTo(45.57, 1);
    expect(Math.cos((TWIST_LIMIT * Math.PI) / 360) ** 2).toBeCloseTo(AREA_KEPT, 9);
  });

  it('passes a twist inside the limit and any amount of plain bending', () => {
    expect(chainTwistFindings(rigged(spine(8, 2), [swing('spine_3', along, 44)]))).toEqual([]);
    const bend = swing('spine_3', [0, 0, 1], 80);
    expect(chainTwistFindings(rigged(spine(8, 2), [bend]))).toEqual([]);
  });

  it('leaves short chains alone: a limb is not a chain', () => {
    const arms = radial(2, 3);
    expect(chainTwistFindings(rigged(arms.bones, [swing('arm_0_1', [1, 0, 0], 90)]))).toEqual([]);
  });

  it('reads only the part of a rotation about the bone', () => {
    const q = (axis: Vec3, deg: number): readonly [number, number, number, number] => {
      const h = (deg * Math.PI) / 360;
      return [axis[0] * Math.sin(h), axis[1] * Math.sin(h), axis[2] * Math.sin(h), Math.cos(h)];
    };
    expect(twistDegrees([1, 0, 0], ...q([1, 0, 0], 30))).toBeCloseTo(30, 6);
    expect(twistDegrees([1, 0, 0], ...q([0, 1, 0], 30))).toBeCloseTo(0, 6);
  });

  it('poses limit.twist both ways, so the volume check reads the candy wrapper', () => {
    const bones: Bone[] = elbow(0).map((b) =>
      b.name === 'lower' ? { ...b, limit: { axis: [0, 0, 1], min: 0, max: 0, twist: 120 } } : b,
    );
    const poses = romPoses({ bones });
    expect(poses.map((p) => p.label)).toEqual(['lower twist +120°', 'lower twist -120°']);
    const m = smooth(tube(2, 0.15), bones);
    const pose = poses[0];
    const d = pose ? poseDeform(m, { bones }, pose, weldIds(m.positions)) : null;
    // Unposed before: a 120° twist limit passed. Posed, the joint keeps too little volume.
    expect(d?.volume ?? 1).toBeLessThan(0.6);
  });
});
