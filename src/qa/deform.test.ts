// deform: a joint whose skin collapses or tears at its limit fails; a smooth blend passes.

import { describe, expect, it } from 'bun:test';
import {
  type Armature,
  type Bone,
  compile,
  defineAsset,
  dmath,
  type JointLimit,
  type LimitTolerance,
  type Mesh,
} from '../core/index.ts';
import { deformFindings, MID_SUFFIX, poseDeform, romPoses } from './deform.ts';
import { arm, elbow, smooth, tube } from './motion-fixtures.ts';
import { weldIds } from './self-intersect.ts';

// Smooth weights, except the forearm's far end (x > 1.5) left rigid on `upper`.
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

/** The torn elbow bent `max`°, its limit carrying `extra` (stretch, why), or named tolerances. */
const declared = (
  max: number,
  extra: Partial<JointLimit>,
  named?: Readonly<Record<string, LimitTolerance>>,
) => {
  const bones = elbow(max).map((b) => (b.limit ? { ...b, limit: { ...b.limit, ...extra } } : b));
  return compile(
    defineAsset({
      name: 'arm',
      kind: 'prop',
      budget: { triangles: [99999, 99999, 99999] },
      ...(named ? { limitTolerances: named } : {}),
      build(ctx) {
        for (const b of bones) ctx.bone(b.name, b);
        ctx.part('flesh', torn(tube(2, 0.15), elbow(max)));
      },
    }),
  );
};
const stretches = (a: Parameters<typeof deformFindings>[0]) =>
  deformFindings(a).filter((f) => f.code === 'T3D_DEFORM_STRETCH');
const WHY = 'the mesh fuses the forearm to the arm; re-generate it';

describe('deform', () => {
  it('fails a collapsing elbow: a 150° fold on a blended skin keeps < 60 % of the band', () => {
    const f = deformFindings(arm(150, smooth));
    expect(f.some((x) => x.code === 'T3D_DEFORM_VOLUME')).toBe(true);
    expect(f[0]?.message).toContain('at lower +150°');
    expect(f[0]?.fix).toContain('helper');
  });

  it('fails a torn skin: the far half on the wrong bone stretches the seam', () => {
    expect(deformFindings(arm(60, torn)).some((x) => x.code === 'T3D_DEFORM_STRETCH')).toBe(true);
  });

  // Every vertex 100 % on one bone: no vertex is in the 2–98 % band, only the seam triangles are.
  const hard =
    (onLower: (x: number) => boolean) =>
    (m: Mesh): Mesh => {
      const n = m.positions.length / 3;
      const joints = new Uint16Array(n * 4);
      const weights = new Float32Array(n * 4);
      for (let v = 0; v < n; v++) {
        joints[v * 4] = onLower(m.positions[v * 3] ?? 0) ? 1 : 0;
        weights[v * 4] = 1;
      }
      return { ...m, joints, weights };
    };

  it('fails a hard 0/1 split at the elbow: the seam ring is measured', () => {
    const codes = deformFindings(
      arm(
        150,
        hard((x) => x >= 1),
      ),
    ).map((x) => x.code);
    expect(codes).toContain('T3D_DEFORM_VOLUME');
    expect(codes).toContain('T3D_DEFORM_STRETCH');
  });

  it('fails a skin on the wrong bones (the upper arm hard-weighted to the forearm)', () => {
    const codes = deformFindings(
      arm(
        150,
        hard((x) => x < 1),
      ),
    ).map((x) => x.code);
    expect(codes).toContain('T3D_DEFORM_STRETCH');
  });

  it('has nothing to measure where no triangle joins what the bone moves to the rest', () => {
    const bones = elbow(150);
    // The forearm is its own shell, moved whole: rigid, nothing stretches.
    const whole = hard(() => true)(tube(2, 0.15));
    const pose = romPoses({ bones })[0];
    expect(pose && poseDeform(whole, { bones }, pose, weldIds(whole.positions))).toBeNull();
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
    expect((2 * dmath.acos(q[3]) * 180) / Math.PI).toBeCloseTo(45, 6);
  });

  it('a smooth 90° bend keeps most of its band volume and no new crossings', () => {
    const bones = elbow(90);
    const m = smooth(tube(2, 0.15), bones);
    const pose = romPoses({ bones })[0];
    const d = pose ? poseDeform(m, { bones }, pose, weldIds(m.positions)) : null;
    expect(d?.volume ?? 0).toBeGreaterThan(0.6);
    expect(d?.crossings).toBe(0);
  });

  describe('a declared stretch tolerance on the limit', () => {
    it('is refused above the ×4 default without a why, and above the ×6 cap', () => {
      expect(() => declared(30, { stretch: 5.5 })).toThrow(/without a why/);
      expect(() => declared(30, { stretch: 5.5, why: '  ' })).toThrow(/without a why/);
      expect(() => declared(30, { stretch: 6.5, why: WHY })).toThrow(/outside \[1, 6\]/);
      expect(() => declared(30, { stretch: Number.NaN, why: WHY })).toThrow(/T3D_RECIPE_INVALID/);
      expect(() => declared(30, {}, { lower: { stretch: 5.5, why: '' } })).toThrow(/without a why/);
      expect(() => declared(30, {}, { upper: { stretch: 5, why: WHY } })).toThrow(/no joint limit/);
      expect(() => declared(30, {}, { knee: { stretch: 5, why: WHY } })).toThrow(/no bone/);
    });

    it('passes a stretch between the default and the declared value, fails above it', () => {
      // The torn elbow at 30° stretches ×5.2 (and keeps its volume, no crossings).
      expect(stretches(declared(30, {}))[0]?.message).toContain('(≤ ×4)');
      expect(deformFindings(declared(30, { stretch: 5.5, why: WHY }))).toEqual([]);
      expect(deformFindings(declared(30, {}, { lower: { stretch: 5.5, why: WHY } }))).toEqual([]);
      const over = stretches(declared(30, { stretch: 5, why: WHY }));
      expect(over[0]?.message).toContain(`(≤ ×5, declared: ${WHY})`);
      // At the cap it still fails a skin torn further (×6.9 at 40°).
      expect(stretches(declared(40, { stretch: 6, why: WHY }))).toHaveLength(1);
    });

    it('changes nothing else: volume and crossings still fail at the cap', () => {
      const codes = deformFindings(declared(150, { stretch: 6, why: WHY })).map((f) => f.code);
      expect(codes).toContain('T3D_DEFORM_VOLUME');
      expect(codes).toContain('T3D_DEFORM_INTERSECT');
    });
  });
});
