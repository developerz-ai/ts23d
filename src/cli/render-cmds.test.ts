// `t3d review`: a skinned asset's pack gains poses.png (slice 10's pose strip at LOD1); a rigid
// prop's does not (the strip would throw without a skeleton).

import { afterAll, describe, expect, it } from 'bun:test';
import { rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { type Bone, defineAsset, merge } from '../core/index.ts';
import { DEFAULT_SHEET, paintTrimSheet } from '../material/index.ts';
import { skinWeights, weightBonesOf } from '../passes/index.ts';
import { box } from '../primitives/index.ts';
import { parseArgs } from './args.ts';
import { reviewOne } from './render-cmds.ts';

const out = join(import.meta.dir, '../../tmp/render-cmds-test');
afterAll(() => rm(out, { recursive: true, force: true }));
const sheet = paintTrimSheet({ ...DEFAULT_SHEET, size: 512 });
const args = parseArgs(['review', 'x.ts', '--out', out, '--size', '64x48']);

/** A two-bone limb whose elbow has a range of motion (so qa poseFrames has ROM extremes). */
const BONES: readonly Bone[] = [
  { name: 'upper', head: [0, 0, 0.5], tail: [0.5, 0, 0.5] },
  {
    name: 'lower',
    parent: 'upper',
    head: [0.5, 0, 0.5],
    tail: [1, 0, 0.5],
    limit: { axis: [0, 1, 0], min: -10, max: 120 },
  },
];
const limb = defineAsset({
  name: 'limb',
  kind: 'creature',
  budget: { triangles: [9999, 9999, 9999] },
  build(ctx) {
    for (const { name, ...b } of BONES) ctx.bone(name, b);
    const flesh = merge(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) =>
        box({ size: [0.1, 0.12, 0.12], at: [0.05 + i * 0.1, 0, 0.5], color: [0.6, 0.5, 0.4] }),
      ),
    );
    ctx.part('body', skinWeights(flesh, weightBonesOf(BONES), { blend: 0.05 }));
  },
});

describe('review pack poses', () => {
  it('writes no poses.png for a rigid prop', async () => {
    const crate = defineAsset({
      name: 'crate',
      kind: 'prop',
      budget: { triangles: [99, 99, 99] },
      build: (ctx) => ctx.part('body', box({ size: [1, 1, 1], color: [0.5, 0.4, 0.3] })),
    });
    const r = await reviewOne(crate, 'x.ts', args, sheet);
    expect(r.files.map((f) => basename(f))).not.toContain('poses.png');
  });

  it('adds poses.png for a skinned asset', async () => {
    const r = await reviewOne(limb, 'x.ts', args, sheet);
    expect(r.files.map((f) => basename(f))).toContain('poses.png');
  });
});
