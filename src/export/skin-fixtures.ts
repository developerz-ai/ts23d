// Test fixtures for skinned export: a two-bone arm (skinned, with a `bulge` morph), a wheel that
// spins (so `run` still exports), a socket riding the `lower` bone, and a `wave` clip keying a
// bone and the morph weight. Not exported publicly.

import { type Asset, type Bone, type Clip, defineAsset, dmath, merge } from '../core/index.ts';
import { hingeMorph, skinWeights, weightBonesOf } from '../passes/index.ts';
import { box, cylinder } from '../primitives/index.ts';

const c: [number, number, number] = [0.6, 0.5, 0.4];

const BONES: readonly Bone[] = [
  { name: 'upper', head: [0, 0, 0.5], tail: [0.5, 0, 0.5] },
  { name: 'lower', parent: 'upper', head: [0.5, 0, 0.5], tail: [1, 0, 0.5] },
];

const wave: Clip = {
  name: 'wave',
  seconds: 1,
  loop: true,
  tracks: [
    {
      bone: 'lower',
      path: 'rotation',
      times: new Float32Array([0, 0.5, 1]),
      values: new Float32Array([0, 0, 0, 1, 0, 0, dmath.sin(0.4), dmath.cos(0.4), 0, 0, 0, 1]),
    },
    {
      part: 'body',
      path: 'weights',
      times: new Float32Array([0, 0.5, 1]),
      values: new Float32Array([0, 1, 0]),
    },
  ],
};

export const arm = (clips: readonly Clip[] = [wave]): Asset =>
  defineAsset({
    name: 'arm',
    kind: 'creature',
    budget: { triangles: [9999, 9999, 9999] },
    clips,
    build(ctx) {
      for (const { name, ...b } of BONES) ctx.bone(name, b);
      const flesh = merge(
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) =>
          box({ size: [0.1, 0.12, 0.12], at: [0.05 + i * 0.1, 0, 0.5], color: c }),
        ),
      );
      const skinned = skinWeights(flesh, weightBonesOf(BONES), { blend: 0.05 });
      const bulge = hingeMorph(skinned, 'bulge', {
        at: [0.5, 0, 0.5],
        axis: [0, 1, 0],
        degrees: 10,
        weight: (p) => (p[0] > 0.6 ? 1 : 0),
      });
      ctx.part('body', { ...skinned, morphs: [bulge] });
      ctx.part(
        'wheel',
        cylinder({ radius: 0.1, length: 0.05, segments: 12, axis: 'y', color: c }),
        {
          at: [0, 0.3, 0.1],
          motion: { kind: 'spin', axis: [0, 1, 0], rps: 1 },
        },
      );
      ctx.socket('hand', { kind: 'attach', at: [1, 0, 0.5], data: { bone: 'lower' } });
    },
  });
