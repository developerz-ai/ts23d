import { describe, expect, it } from 'bun:test';
import type { Mesh } from '../core/index.ts';
import { creaturePlan } from './creature.ts';
import { capsuleCreature, FIXTURE_WOLF, riggerBones } from './model-fixtures.ts';
import { mirrorBones, mirrorHalf, modelRig } from './model-rig.ts';

const { bones } = creaturePlan(FIXTURE_WOLF);
const body = capsuleCreature(bones);

/** A profile model: the side the camera saw (left, +y) is whole, the far side has no legs. */
const lopsided: Mesh = capsuleCreature(bones, (c) => !(c.a[1] < -0.01 && c.b[2] < 0.5));

describe('modelRig', () => {
  it('throws for a bone the fitted skeleton does not have', () => {
    expect(() => modelRig(body, FIXTURE_WOLF).at('wing_l_0')).toThrow(
      /T3D_RECIPE_INVALID.*wing_l_0/,
    );
  });

  it("refuses register: 'joints' without joints (it fell back to the surface fit silently)", () => {
    expect(() => modelRig(body, FIXTURE_WOLF, { register: 'joints' })).toThrow(
      /T3D_RECIPE_INVALID.*no `joints`/,
    );
  });

  it("says so when a mirrored fit leaves the rigger's joints unused", () => {
    const rig = modelRig(lopsided, FIXTURE_WOLF, { symmetric: '+', joints: riggerBones() });
    expect(rig.symmetric).toBe(true);
    expect(rig.joints).toBe('fit');
    expect(rig.notices.some((n) => /mirrored/.test(n))).toBe(true);
  });

  it('cannot fit a one-sided model as it is (two legs are missing)', () => {
    expect(() => modelRig(lopsided, FIXTURE_WOLF)).toThrow(/T3D_MODEL_SKELETON/);
  });

  it('mirrors the named half and fits an exactly symmetric skeleton', () => {
    const rig = modelRig(lopsided, FIXTURE_WOLF, { symmetric: '+' });
    expect(rig.side).toBe('+');
    for (const b of rig.bones) {
      const twin = rig.bones.find((x) => x.name === b.name.replace(/_l(?=_|$)/, '_r'));
      if (twin && twin !== b) {
        expect(twin.head).toEqual([b.head[0], -b.head[1], b.head[2]]);
        expect(twin.tail).toEqual([b.tail[0], -b.tail[1], b.tail[2]]);
      } else if (!/_[lr](_|$)/.test(b.name)) expect(b.head[1]).toBe(0);
    }
    // The mirrored mesh is as wide on the right as on the left.
    let [lo, hi] = [0, 0];
    for (let i = 1; i < rig.mesh.positions.length; i += 3) {
      lo = Math.min(lo, rig.mesh.positions[i] ?? 0);
      hi = Math.max(hi, rig.mesh.positions[i] ?? 0);
    }
    expect(lo).toBeCloseTo(-hi, 6);
    expect(rig.clips.map((c) => c.name)).toContain('walk');
  });

  it('is memoised per mesh and options', () => {
    expect(modelRig(body, FIXTURE_WOLF)).toBe(modelRig(body, FIXTURE_WOLF));
    expect(modelRig(body, FIXTURE_WOLF, { symmetric: true })).not.toBe(
      modelRig(body, FIXTURE_WOLF),
    );
  });
});

describe('mirrorHalf / mirrorBones', () => {
  it('keeps only the chosen side, twice', () => {
    const squashed: Mesh = {
      ...body,
      positions: Float32Array.from(body.positions, (v, i) => (i % 3 === 1 && v < 0 ? v * 0.35 : v)),
    };
    const m = mirrorHalf(squashed, '-');
    let [lo, hi] = [0, 0];
    for (let i = 1; i < m.positions.length; i += 3) {
      lo = Math.min(lo, m.positions[i] ?? 0);
      hi = Math.max(hi, m.positions[i] ?? 0);
    }
    let wide = 0;
    for (let i = 1; i < body.positions.length; i += 3)
      wide = Math.max(wide, body.positions[i] ?? 0);
    expect(hi).toBeCloseTo(-lo, 6);
    expect(hi).toBeCloseTo(wide * 0.35, 5);
  });

  it('puts centre bones on y = 0 and right bones opposite the left', () => {
    const out = mirrorBones([
      { name: 'spine_0', head: [0, 0.02, 1], tail: [1, -0.01, 1] },
      { name: 'fore_l_0', head: [1, 0.2, 1], tail: [1, 0.25, 0] },
      { name: 'fore_r_0', head: [1.1, -0.1, 1], tail: [1, -0.1, 0] },
    ]);
    expect(out[0]?.head[1]).toBe(0);
    expect(out[2]?.head).toEqual([1, -0.2, 1]);
    expect(out[1]?.head).toEqual([1, 0.2, 1]);
  });
});
