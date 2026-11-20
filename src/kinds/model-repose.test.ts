import { describe, expect, it } from 'bun:test';
import type { Bone, Mesh, Vec3 } from '../core/index.ts';
import { dmath } from '../core/index.ts';
import { creaturePlan } from './creature.ts';
import { v3 } from './creature-curve.ts';
import { rigBones } from './creature-limits.ts';
import { capsuleCreature, FIXTURE_WOLF } from './model-fixtures.ts';
import { MIRROR_LIMIT, mirrorResidual } from './model-mirror.ts';
import { REPOSE_LIMIT, reposeTarget } from './model-repose.ts';
import { modelRig } from './model-rig.ts';

const { bones } = creaturePlan(FIXTURE_WOLF);
const plan = rigBones(bones, null, null).filter((b) => !b.name.endsWith('_mid'));
const len = (b: Bone): number => v3.len(v3.sub(b.tail, b.head));

/** The plan with its head (and what hangs from it) yawed `deg` about the atlas. */
function headTurned(deg: number): Bone[] {
  const atlas = plan.find((b) => b.name === 'head')?.head ?? [0, 0, 0];
  const [c, s] = [dmath.cos((deg * Math.PI) / 180), dmath.sin((deg * Math.PI) / 180)];
  const turn = (p: Vec3): Vec3 => {
    const [x, y] = [p[0] - atlas[0], p[1] - atlas[1]];
    return [atlas[0] + c * x - s * y, atlas[1] + s * x + c * y, p[2]];
  };
  return plan.map((b) => (b.name === 'head' ? { ...b, tail: turn(b.tail) } : b));
}

describe('reposeTarget', () => {
  it('refuses another pose: a head turned 50° is not a correction', () => {
    expect(() => reposeTarget(headTurned(50))).toThrow(/T3D_MODEL_SKELETON.*'head'.*4\d°/);
    expect(() => reposeTarget(headTurned(REPOSE_LIMIT - 5))).not.toThrow();
  });

  it('straightens a turned head onto the sagittal plane without changing its length', () => {
    const t = reposeTarget(headTurned(12));
    const head = t.bones.find((b) => b.name === 'head');
    const was = plan.find((b) => b.name === 'head');
    expect(head?.tail[1]).toBe(0);
    expect(len(head as Bone)).toBeCloseTo(len(was as Bone), 9);
    expect(t.turns[0]?.bone).toBe('head');
    // The head also pitches down, so a 12° yaw is a slightly smaller turn in space.
    expect(t.turns[0]?.degrees).toBeGreaterThan(10);
    expect(t.turns[0]?.degrees).toBeLessThan(12.01);
  });

  it('makes left and right exact mirror images and keeps names, order and parents', () => {
    const skewed = plan.map((b) =>
      b.name.startsWith('fore_r')
        ? { ...b, head: v3.add(b.head, [0.03, 0, 0]), tail: v3.add(b.tail, [0.05, 0.01, 0]) }
        : b,
    );
    const t = reposeTarget(skewed).bones;
    expect(t.map((b) => [b.name, b.parent])).toEqual(plan.map((b) => [b.name, b.parent]));
    for (const l of t.filter((b) => /_l(_\d+)?$/.test(b.name))) {
      const r = t.find((b) => b.name === l.name.replace(/_l(?=_\d+$|$)/, '_r'));
      expect(r?.head).toEqual([l.head[0], -l.head[1], l.head[2]]);
      expect(r?.tail).toEqual([l.tail[0], -l.tail[1], l.tail[2]]);
    }
    const mid = t.find((b) => b.name === 'fore_l_1');
    const was = plan.find((b) => b.name === 'fore_l_1');
    expect((mid?.head[0] ?? 0) - (was?.head[0] ?? 0)).toBeCloseTo(0.015, 6);
  });
});

describe('mirror residual (before any mirroring)', () => {
  const body = capsuleCreature(bones);
  /** The fixture with everything ahead of the shoulders pushed sideways: a head off the plane. */
  const leaning: Mesh = {
    ...body,
    positions: Float32Array.from(body.positions, (v, i) => {
      const x = body.positions[i - 1] ?? 0;
      return i % 3 === 1 && x > 0.45 ? v + (x - 0.45) * 0.6 : v;
    }),
  };

  it('is large over the head of a model whose head leans off the plane, small over its trunk', () => {
    const r = mirrorResidual(leaning, plan, bones.height);
    expect(r.region).toBe('head');
    expect(r.worst).toBeGreaterThan(MIRROR_LIMIT);
    expect(r.regions['spine']?.p95 ?? 1).toBeLessThan(MIRROR_LIMIT / 2);
  });

  it('is zero on a symmetric model, which may be mirrored', () => {
    expect(mirrorResidual(body, plan, bones.height).worst).toBeLessThan(1e-3);
    expect(modelRig(body, FIXTURE_WOLF, { symmetric: '+' }).symmetric).toBe(true);
  });

  it('keeps modelRig from mirroring the leaning head (no doubled muzzle), and says why', () => {
    const rig = modelRig(leaning, FIXTURE_WOLF, { symmetric: '+' });
    expect(rig.symmetric).toBe(false);
    expect(rig.mirror?.region).toBe('head');
    expect(rig.far).toEqual([]);
    expect(rig.mesh.positions.length).toBe(leaning.positions.length);
  });
});
