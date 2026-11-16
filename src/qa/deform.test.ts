// deform: a joint whose skin collapses or tears at its limit fails; a smooth blend passes.

import { describe, expect, it } from 'bun:test';
import type { Armature, Bone, Mesh } from '../core/index.ts';
import { deformFindings, MID_SUFFIX, poseDeform, romPoses } from './deform.ts';
import { arm, elbow, smooth, tube } from './motion-fixtures.ts';
import { weldIds } from './self-intersect.ts';

describe('deform', () => {
  it('fails a collapsing elbow: a 150° fold on a blended skin keeps < 60 % of the band', () => {
    const f = deformFindings(arm(150, smooth));
    expect(f.some((x) => x.code === 'T3D_DEFORM_VOLUME')).toBe(true);
    expect(f[0]?.message).toContain('at lower +150°');
    expect(f[0]?.fix).toContain('helper');
  });

  it('fails a torn skin: the far half on the wrong bone stretches the seam', () => {
    // Smooth weights, except the forearm's far end left rigid on `upper`.
    const torn = (m: Mesh, bones: Bone[]): Mesh => {
      const s = smooth(m, bones);
      const joints = Uint16Array.from(s.joints ?? []);
      const weights = Float32Array.from(s.weights ?? []);
      for (let v = 0; v < m.positions.length / 3; v++)
        if ((m.positions[v * 3] ?? 0) > 1.5) {
          joints.set([0, 0, 0, 0], v * 4);
          weights.set([1, 0, 0, 0], v * 4);
        }
      return { ...s, joints, weights };
    };
    expect(deformFindings(arm(60, torn)).some((x) => x.code === 'T3D_DEFORM_STRETCH')).toBe(true);
  });

  it('passes a smooth blend through a 60° bend, and has nothing to say without limits', () => {
    expect(deformFindings(arm(60, smooth))).toEqual([]);
    const a = arm(60, smooth);
    const sk = a.skeleton as Armature;
    expect(
      deformFindings({ ...a, skeleton: { bones: sk.bones.map(({ limit: _l, ...b }) => b) } }),
    ).toEqual([]);
  });

  it('poses a `_mid` helper at half the joint and skips zero extremes', () => {
    const sk: Armature = {
      bones: [
        ...elbow(90),
        { name: `lower${MID_SUFFIX}`, parent: 'upper', head: [1, 0, 0], tail: [1.2, 0, 0] },
      ],
    };
    const p = romPoses(sk);
    expect(p.map((x) => x.label)).toEqual(['lower +90°']);
    const q = p[0]?.rotation.get(`lower${MID_SUFFIX}`) ?? [0, 0, 0, 1];
    expect((2 * Math.acos(q[3]) * 180) / Math.PI).toBeCloseTo(45, 6);
  });

  it('a smooth 90° bend keeps most of its band volume and no new crossings', () => {
    const bones = elbow(90);
    const m = smooth(tube(2, 0.15), bones);
    const pose = romPoses({ bones })[0];
    const d = pose ? poseDeform(m, { bones }, pose, weldIds(m.positions)) : null;
    expect(d?.volume ?? 0).toBeGreaterThan(0.6);
    expect(d?.crossings).toBe(0);
  });
});
