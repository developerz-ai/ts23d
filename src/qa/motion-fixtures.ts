// Motion QA fixtures shared by the gate tests and finding-codes.test.ts: a skinned elbow tube whose
// limit is configurable (a 150° fold collapses) and a one-leg walker whose planted foot slips.

import {
  type Armature,
  type Bone,
  type Clip,
  type CompiledAsset,
  compile,
  defineAsset,
  dmath,
  type Mesh,
  quatFromAxisAngle,
} from '../core/index.ts';
import { skinWeights, weightBonesOf } from '../passes/index.ts';
import { box } from '../primitives/index.ts';

/** A closed tube along +X, radius r, `rings` rings of 16. */
export function tube(length: number, r: number, rings = 41): Mesh {
  const seg = 16;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < rings; i++)
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      pos.push((i / (rings - 1)) * length, dmath.cos(a) * r, dmath.sin(a) * r);
    }
  for (let i = 0; i + 1 < rings; i++)
    for (let s = 0; s < seg; s++) {
      const a = i * seg + s;
      const b = i * seg + ((s + 1) % seg);
      idx.push(a, b + seg, b, a, a + seg, b + seg);
    }
  const v = pos.length / 3;
  return {
    positions: new Float32Array(pos),
    normals: new Float32Array(v * 3),
    uvs: new Float32Array(v * 2),
    colors: new Float32Array(v * 3).fill(0.5),
    indices: new Uint32Array(idx),
  };
}

export const elbow = (max: number): Bone[] => [
  { name: 'upper', head: [0, 0, 0], tail: [1, 0, 0] },
  {
    name: 'lower',
    parent: 'upper',
    head: [1, 0, 0],
    tail: [2, 0, 0],
    limit: { axis: [0, 0, 1], min: 0, max },
  },
];

export function arm(max: number, skin: (m: Mesh, bones: Bone[]) => Mesh): CompiledAsset {
  const bones = elbow(max);
  return compile(
    defineAsset({
      name: 'arm',
      kind: 'prop',
      budget: { triangles: [99999, 99999, 99999] },
      build(ctx) {
        for (const b of bones) ctx.bone(b.name, b);
        ctx.part('flesh', skin(tube(2, 0.15), bones));
      },
    }),
  );
}

export const smooth = (m: Mesh, bones: Bone[]): Mesh =>
  skinWeights(m, weightBonesOf(bones), { blend: 0.12 });

/** A pelvis root with one leg (hip → paw) and the root travelling 1 m over 1 s. */
export const walkerBones: Armature['bones'] = [
  { name: 'root', head: [0, 0, 0.5], tail: [0.2, 0, 0.5] },
  { name: 'leg', parent: 'root', head: [0, 0, 0.5], tail: [0, 0, 0.02] },
];

/** Root travels `travel`; the leg swings back so the foot moves `travel − slip` over the ground. */
export function walk(slip: number, seam = 0): Clip {
  const n = 30;
  const times = Float32Array.from({ length: n + 1 }, (_, i) => i / n);
  const root = Float32Array.from({ length: (n + 1) * 3 }, (_, k) =>
    k % 3 === 0 ? Math.floor(k / 3) / n : 0,
  );
  const values = new Float32Array((n + 1) * 4);
  for (let i = 0; i <= n; i++) {
    // Foot x relative to the hip: −(travel − slip)·u, so the foot stays (nearly) put in the world.
    const dx = -(1 - slip) * (i / n) + 0.5;
    const a = dmath.asin(Math.max(-1, Math.min(1, dx / 0.48)));
    values.set(quatFromAxisAngle([0, 1, 0], -a + (i === n ? seam : 0)), i * 4);
  }
  return {
    name: 'walk',
    seconds: 1,
    loop: true,
    tracks: [
      { bone: 'root', path: 'translation', times, values: root },
      { bone: 'leg', path: 'rotation', times, values },
    ],
  };
}

export function rig(clip: Clip): CompiledAsset {
  return compile(
    defineAsset({
      name: 'strider',
      kind: 'prop',
      budget: { triangles: [999, 999, 999] },
      clips: [clip],
      build(ctx) {
        for (const b of walkerBones) ctx.bone(b.name, b);
        ctx.part('body', box({ size: [0.1, 0.1, 0.1], color: [0.5, 0.5, 0.5] }));
      },
    }),
  );
}
