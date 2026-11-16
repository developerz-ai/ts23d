import { describe, expect, it } from 'bun:test';
import {
  type Armature,
  merge,
  quatFromAxisAngle,
  SKIN_INFLUENCES,
  Ts23dError,
} from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { optimize } from './optimize.ts';
import {
  bindPoseError,
  inverseBind,
  poseJoints,
  skinPositions,
  weightBonesOf,
} from './skin-bind.ts';
import { tube, volume } from './skin-fixtures.ts';
import { bindRigid, pieceIds, quantise, skinPieces, skinWeights } from './skin-weights.ts';

const arm: Armature = {
  bones: [
    { name: 'upper', head: [0, 0, 0], tail: [1, 0, 0] },
    { name: 'lower', parent: 'upper', head: [1, 0, 0], tail: [2, 0, 0] },
  ],
};

describe('skinWeights', () => {
  it('refuses a zero blend radius and bones outside the skeleton', () => {
    const m = tube(2, 0.2);
    expect(() => skinWeights(m, weightBonesOf(arm.bones), { blend: 0 })).toThrow(Ts23dError);
    expect(() => skinWeights(m, weightBonesOf(arm.bones), { blend: 0.1, only: [2] })).toThrow(
      'outside 0..1',
    );
  });

  it('quantises to 255ths that sum to exactly 255, at most 4, heaviest first', () => {
    const q = quantise([
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 0.5],
      [4, 0.25],
    ]);
    expect(q.length).toBeLessThanOrEqual(SKIN_INFLUENCES);
    expect(q.reduce((s, [, w]) => s + w, 0)).toBe(255);
    expect(q.map(([j]) => j)).toEqual([0, 1, 2, 3]);
    expect(quantise([])).toEqual([]);
  });

  it('weights every vertex to sum 1 and gives each end of the tube to its own bone', () => {
    const m = skinWeights(tube(2, 0.2), weightBonesOf(arm.bones), { blend: 0.08 });
    const n = m.positions.length / 3;
    for (let v = 0; v < n; v++) {
      const w = [0, 1, 2, 3].map((s) => Math.round((m.weights?.[v * 4 + s] ?? 0) * 255));
      expect(w.reduce((a, b) => a + b, 0)).toBe(255);
    }
    // Vertex 0 sits at x = 0 (upper), the last ring at x = 2 (lower).
    expect(m.joints?.[0]).toBe(0);
    expect(m.weights?.[0]).toBe(1);
    expect(m.joints?.[(n - 3) * 4]).toBe(1);
  });

  it('bind pose reproduces the rest positions; a bent 90° tube keeps ≥ 85 % volume', () => {
    const rest = tube(2, 0.2);
    const m = skinWeights(rest, weightBonesOf(arm.bones), { blend: 0.08 });
    expect(bindPoseError(m, arm)).toBeLessThan(1e-6);
    const ibm = inverseBind(arm);
    ibm[12] = (ibm[12] ?? 0) + 1e-4;
    expect(bindPoseError(m, arm, ibm)).toBeGreaterThan(5e-5);
    const bent = skinPositions(
      m,
      poseJoints(arm, new Map([['lower', quatFromAxisAngle([0, 0, 1], Math.PI / 2)]])),
      inverseBind(arm),
    );
    const v0 = volume(m.positions, m.indices);
    expect(volume(bent, m.indices) / v0).toBeGreaterThanOrEqual(0.85);
  });

  it('binds rigidly and per piece: every vertex of a piece shares its root weights', () => {
    const r = bindRigid(tube(1, 0.1), 3);
    expect(r.joints?.[4]).toBe(3);
    expect(r.weights?.[4]).toBe(1);
    const cards = merge([
      box({ size: [0.1, 0.1, 0.1], at: [0.2, 0, 0], color: [1, 1, 1] }),
      box({ size: [0.1, 0.1, 0.1], at: [1.9, 0, 0], color: [1, 1, 1] }),
    ]);
    const ids = pieceIds(cards);
    expect(new Set(ids).size).toBe(2);
    const s = skinPieces(cards, weightBonesOf(arm.bones), { blend: 0.05 });
    const first = ids.indexOf(ids[0] ?? 0);
    const last = ids.length - 1;
    expect(s.joints?.[first * 4]).toBe(0);
    expect(s.joints?.[last * 4]).toBe(1);
    const n = s.positions.length / 3;
    for (let v = 1; v < n; v++)
      if (ids[v] === ids[v - 1])
        expect([...(s.weights?.subarray(v * 4, v * 4 + 4) ?? [])]).toEqual([
          ...(s.weights?.subarray(v * 4 - 4, v * 4) ?? []),
        ]);
  });

  it('survives optimisation: weld and reorder carry joints, weights and morphs per vertex', () => {
    const m = skinWeights(tube(2, 0.2), weightBonesOf(arm.bones), { blend: 0.08 });
    const morphed = {
      ...m,
      morphs: [{ name: 'puff', positions: new Float32Array(m.positions.length).fill(0.01) }],
    };
    const { mesh } = optimize(morphed);
    const n = mesh.positions.length / 3;
    expect(mesh.joints?.length).toBe(n * 4);
    expect(mesh.weights?.length).toBe(n * 4);
    expect(mesh.morphs?.[0]?.positions.length).toBe(n * 3);
    expect(bindPoseError(mesh, arm)).toBeLessThan(1e-6);
    // The vertex at the far cap centre (x = 2) still belongs to `lower`.
    const far = [...Array(n).keys()].find(
      (v) => mesh.positions[v * 3] === 2 && mesh.positions[v * 3 + 1] === 0,
    );
    expect(mesh.joints?.[(far ?? 0) * 4]).toBe(1);
  });
});
