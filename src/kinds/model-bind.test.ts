import { describe, expect, it } from 'bun:test';
import type { Bone } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { bindModel } from './model-bind.ts';

// A 4 m bar on two bones end to end: the far half belongs to bone 0.
const bones: readonly Bone[] = [
  { name: 'spine_0', head: [-2, 0, 0.2], tail: [0, 0, 0.2] },
  { name: 'spine_1', parent: 'spine_0', head: [0, 0, 0.2], tail: [2, 0, 0.2] },
];
const bar = () => box({ size: [4, 0.4, 0.4], color: [1, 1, 1], at: [0, 0, 0] });

/** Weight vertex `v` gives bone `j`. */
const weightOn = (m: ReturnType<typeof bindModel>, v: number, j: number): number =>
  [0, 1, 2, 3].reduce(
    (q, s) => q + ((m.joints?.[v * 4 + s] ?? -1) === j ? (m.weights?.[v * 4 + s] ?? 0) : 0),
    0,
  );

describe('bindModel', () => {
  it("keeps a vertex's weight on bone 0 (empty slots are joint 0 weight 0, not an override)", () => {
    const mesh = bar();
    const out = bindModel(mesh, bones, 4);
    const n = mesh.positions.length / 3;
    const far = Array.from({ length: n }, (_, v) => v).filter(
      (v) => (mesh.positions[v * 3] ?? 0) < -1,
    );
    expect(far.length).toBeGreaterThan(0);
    for (const v of far) expect(weightOn(out, v, 0)).toBeGreaterThan(0.5);
  });

  it('weights every vertex to exactly 1 in 255ths on at most 4 bones', () => {
    const out = bindModel(bar(), bones, 4);
    const W = out.weights ?? new Float32Array();
    for (let v = 0; v < W.length; v += 4) {
      const sum = (W[v] ?? 0) + (W[v + 1] ?? 0) + (W[v + 2] ?? 0) + (W[v + 3] ?? 0);
      expect(Math.round(sum * 255)).toBe(255);
    }
  });
});
