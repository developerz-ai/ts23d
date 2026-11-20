// `t3d review`: a skinned asset's pack gains poses.png (slice 10's pose strip at LOD1); a rigid
// prop's does not (the strip would throw without a skeleton). `t3d hero`: an asset's own `hero`
// view is the default camera and --az / --el / --fov still override it.

import { afterAll, describe, expect, it } from 'bun:test';
import { rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { type Bone, compile, defineAsset, merge } from '../core/index.ts';
import { DEFAULT_SHEET, paintTrimSheet } from '../material/index.ts';
import { skinWeights, weightBonesOf } from '../passes/index.ts';
import { box } from '../primitives/index.ts';
import { pathHeroThreaded } from '../render/index.ts';
import { parseArgs } from './args.ts';
import { heroOne, reviewOne } from './render-cmds.ts';

const out = join(import.meta.dir, '../../tmp/render-cmds-test');
afterAll(() => rm(out, { recursive: true, force: true }));
const sheet = paintTrimSheet({ ...DEFAULT_SHEET, size: 512 }, []);
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

describe('t3d hero and the asset hero view', () => {
  const crate = (name: string, hero?: { azDeg: number; elDeg: number }) =>
    defineAsset({
      name,
      kind: 'prop',
      budget: { triangles: [99, 99, 99] },
      ...(hero ? { hero } : {}),
      build: (ctx) => ctx.part('body', box({ size: [2, 1, 1], color: [0.5, 0.4, 0.3] })),
    });
  const shot = async (name: string, hero: Parameters<typeof crate>[1], flags: string[]) => {
    const a = parseArgs(['hero', 'x.ts', '--out', out, '--size', '64x48', ...flags]);
    const r = await heroOne(crate(name, hero), a, sheet);
    return Buffer.from(await Bun.file(r.files[0] ?? '').arrayBuffer());
  };

  it('renders from the hinted view by default; flags win', async () => {
    const plain = await shot('plain', undefined, []);
    const hinted = await shot('hinted', { azDeg: 145, elDeg: 40 }, []);
    expect(hinted.equals(plain)).toBe(false);
    expect(hinted.equals(await shot('flagged', undefined, ['--az', '145', '--el', '40']))).toBe(
      true,
    );
    const back = await shot('back', { azDeg: 145, elDeg: 40 }, ['--az', '-35', '--el', '18']);
    expect(back.equals(plain)).toBe(true);
  });

  it('uses one canonical path worker for a committed hero PNG', async () => {
    const asset = crate('path_worker');
    const args = parseArgs([
      'hero',
      'x.ts',
      '--out',
      out,
      '--size',
      '64x48',
      '--quality',
      'path',
      '--spp',
      '1',
    ]);
    const r = await heroOne(asset, args, sheet);
    const expected = await pathHeroThreaded(compile(asset), {
      width: 64,
      height: 48,
      spp: 1,
      sheet,
      threads: 1,
    });
    expect(
      Buffer.from(await Bun.file(r.files[0] ?? '').arrayBuffer()).equals(Buffer.from(expected)),
    ).toBe(true);
  });
});
