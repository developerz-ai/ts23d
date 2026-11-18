import { describe, expect, it } from 'bun:test';
import type { Bone, Mesh } from '../core/index.ts';
import { ownSides } from './creature-sides.ts';

// Two legs: hind_<s>_0 hip (z 1) → _1 knee (0.6) → _2 hock (0.3). Indices hind_l_* 0..2,
// hind_r_* 3..5, and a spine bone 6.
const bones: Bone[] = [
  ...(['l', 'r'] as const).flatMap((s, k) => {
    const y = k === 0 ? 0.1 : -0.1;
    return [
      { name: `wolf_hind_${s}_0`, head: [0, y, 1], tail: [0, y, 0.6] },
      { name: `wolf_hind_${s}_1`, head: [0, y, 0.6], tail: [0, y, 0.3] },
      { name: `wolf_hind_${s}_2`, head: [0, y, 0.3], tail: [0, y, 0] },
    ] as Bone[];
  }),
  { name: 'wolf_spine_0', head: [0, 0, 1], tail: [0.5, 0, 1] },
];

/** One vertex per row: [y, z] and its four (joint, weight) pairs. */
const mesh = (rows: readonly [number, number, readonly [number, number][]][]): Mesh => ({
  positions: new Float32Array(rows.flatMap(([y, z]) => [0, y, z])),
  normals: new Float32Array(rows.length * 3),
  uvs: new Float32Array(rows.length * 2),
  colors: new Float32Array(rows.length * 4),
  indices: new Uint32Array(0),
  joints: new Uint16Array(rows.flatMap(([, , w]) => [0, 1, 2, 3].map((s) => w[s]?.[0] ?? 0))),
  weights: new Float32Array(rows.flatMap(([, , w]) => [0, 1, 2, 3].map((s) => w[s]?.[1] ?? 0))),
});

const weightsOf = (m: Mesh, v: number): number[] =>
  [...(m.weights ?? new Float32Array(0)).subarray(v * 4, v * 4 + 4)].map(
    (w) => Math.round(w * 1000) / 1000,
  );

describe('ownSides (D72)', () => {
  it("takes the other leg's bones off a hoof vertex", () => {
    // A left hoof vertex (y 0.08, z 0.05) with 30 % of the right cannon (5): onto the left knee (1).
    const out = ownSides(
      mesh([
        [
          0.08,
          0.05,
          [
            [2, 0.7],
            [5, 0.3],
          ],
        ],
      ]),
      bones,
    );
    expect([...(out.joints ?? [])].slice(0, 2)).toEqual([2, 1]);
    expect(weightsOf(out, 0)).toEqual([0.7, 0.3, 0, 0]);
  });

  it('keeps shared weights above the hock (the groin)', () => {
    const m = mesh([
      [
        0.02,
        0.7,
        [
          [0, 0.5],
          [3, 0.5],
        ],
      ],
    ]);
    expect(weightsOf(ownSides(m, bones), 0)).toEqual([0.5, 0.5, 0, 0]);
  });

  it('reads the side in the asset frame (a piece placed with an offset)', () => {
    // Local y −0.02 is left of the midline once the piece sits at y +0.1.
    const m = mesh([
      [
        -0.02,
        0.05,
        [
          [2, 0.6],
          [5, 0.4],
        ],
      ],
    ]);
    const out = ownSides(m, bones, [0, 0.1, 0]);
    expect([...(out.joints ?? [])].slice(0, 2)).toEqual([2, 1]);
  });

  it("moves a vertex that only the other leg weights onto its own leg's upper bone", () => {
    const out = ownSides(mesh([[0.08, 0.05, [[5, 1]]]]), bones);
    expect(weightsOf(out, 0)).toEqual([1, 0, 0, 0]);
    expect([...(out.joints ?? [])].slice(0, 1)).toEqual([1]);
  });

  it('keeps the fold at the hock: the share that did not bend with it goes above it', () => {
    // 60 % own hock (2), 40 % the other hock (5): the 40 % lands on the own knee bone (1).
    const out = ownSides(
      mesh([
        [
          0.08,
          0.05,
          [
            [2, 0.6],
            [5, 0.4],
          ],
        ],
      ]),
      bones,
    );
    expect([...(out.joints ?? [])].slice(0, 2)).toEqual([2, 1]);
    expect(weightsOf(out, 0)).toEqual([0.6, 0.4, 0, 0]);
  });

  it('leaves a skeleton without paired limbs alone', () => {
    const m = mesh([[0.08, 0.05, [[6, 1]]]]);
    expect(ownSides(m, [bones[6] as Bone])).toBe(m);
  });
});
