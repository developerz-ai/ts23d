// Pose strip: refuses what it cannot draw, leaves the rest pose alone, bends what a frame turns,
// and lays the panels out in a labelled grid.

import { describe, expect, it } from 'bun:test';
import {
  type Bone,
  compile,
  defineAsset,
  type Quat,
  quatFromAxisAngle,
  quatRotate,
  Ts23dError,
  type Vec3,
} from '../core/index.ts';
import { skinWeights, weightBonesOf } from '../passes/index.ts';
import { box } from '../primitives/index.ts';
import { type PoseFrame, posedAsset, poseStrip } from './pose-strip.ts';

const bones: Bone[] = [
  { name: 'upper', head: [0, 0, 0.5], tail: [0.5, 0, 0.5] },
  { name: 'lower', parent: 'upper', head: [0.5, 0, 0.5], tail: [1, 0, 0.5] },
];
const arm = compile(
  defineAsset({
    name: 'arm',
    kind: 'prop',
    budget: { triangles: [999, 999, 999] },
    build(ctx) {
      for (const b of bones) ctx.bone(b.name, b);
      const bar = box({ size: [1, 0.1, 0.1], color: [0.6, 0.5, 0.4], at: [0.5, 0, 0.5] });
      ctx.part('bar', skinWeights(bar, weightBonesOf(bones), { blend: 0.05 }));
    },
  }),
);

/** `lower` turned `deg` about Y at its head. */
function bent(deg: number): PoseFrame {
  const q: Quat = quatFromAxisAngle([0, 1, 0], (deg * Math.PI) / 180);
  return {
    label: `lower ${deg}`,
    joints: new Map<string, { head: Vec3; rot: Quat }>([
      ['upper', { head: [0, 0, 0.5], rot: [0, 0, 0, 1] }],
      ['lower', { head: [0.5, 0, 0.5], rot: q }],
    ]),
  };
}

describe('poseStrip', () => {
  it('refuses an asset without a skeleton, and no frames', () => {
    const plain = compile(
      defineAsset({
        name: 'plain',
        kind: 'prop',
        budget: { triangles: [99, 99, 99] },
        build: (ctx) => void ctx.part('b', box({ size: [1, 1, 1], color: [1, 1, 1] })),
      }),
    );
    expect(() => poseStrip(plain, [bent(0)])).toThrow(Ts23dError);
    expect(() => poseStrip(arm, [])).toThrow('no frames');
  });

  it('leaves the rest pose where it was and bends the far end by the frame', () => {
    const rest = posedAsset(arm, bent(0)).parts[0]?.mesh?.positions ?? new Float32Array();
    expect([...rest]).toEqual(
      [...(arm.parts[0]?.mesh?.positions ?? [])].map((v) => Math.fround(v)),
    );
    const P = posedAsset(arm, bent(90)).parts[0]?.mesh?.positions ?? new Float32Array();
    // The bar's far-end vertex (x = 1) swings down to below the elbow.
    let tip = 0;
    for (let i = 0; i < rest.length; i += 3) if ((rest[i] ?? 0) > (rest[tip * 3] ?? 0)) tip = i / 3;
    const want = quatRotate(quatFromAxisAngle([0, 1, 0], Math.PI / 2), [
      0.5,
      rest[tip * 3 + 1] ?? 0,
      (rest[tip * 3 + 2] ?? 0) - 0.5,
    ]);
    expect(P[tip * 3 + 2] ?? 0).toBeCloseTo(0.5 + want[2], 2);
  });

  it('draws one labelled panel per frame on a grid', () => {
    const png = poseStrip(arm, [bent(0), bent(45), bent(90)], { panel: [64, 48], columns: 2 });
    const view = new DataView(png.buffer, png.byteOffset);
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([128, 96]);
  });
});
