// A simple wooden chair or stool: four legs, a seat slab, a backrest (chair). Origin = floor centre
// under the seat; the sitter faces +X. Real dining chair: seat 450 mm high, 420 × 420 mm, back to 0.9 m.

import { box, definePart, type Mesh, merge } from '@developerz.ai/ts23d';
import { NAT } from './shape.ts';

export const seat = definePart({
  name: 'seat',
  description: 'wooden chair or stool: four legs, seat slab, backrest',
  tags: ['furniture', 'prop', 'wood'],
  params: {
    style: 'chair' as 'chair' | 'stool',
    height: 0.45,
    width: 0.42,
    depth: 0.42,
    back: 0.9,
  },
  schema: {
    style: { oneOf: ['chair', 'stool'] },
    height: { min: 0.25, max: 0.9, unit: 'm', doc: 'top of the seat' },
    width: { min: 0.25, max: 1.2, unit: 'm' },
    depth: { min: 0.25, max: 0.8, unit: 'm' },
    back: { min: 0.6, max: 1.4, unit: 'm', doc: 'top of the backrest (chair)' },
  },
  validate: (p) =>
    p.style === 'chair' && p.back < p.height + 0.15
      ? 'backrest top must be ≥ 0.15 m above the seat'
      : undefined,
  build(b, p) {
    const t = 0.03;
    const leg = 0.04;
    const bev = b.lod === 0 ? 0.005 : 0;
    const wood = (size: [number, number, number], at: [number, number, number]): Mesh =>
      box({ size, at, color: NAT, strip: 'oak', bevel: bev });
    const meshes: Mesh[] = [wood([p.depth, p.width, t], [0, 0, p.height - t])];
    const lx = p.depth / 2 - leg / 2 - 0.01;
    const ly = p.width / 2 - leg / 2 - 0.01;
    for (const sx of [-1, 1])
      for (const sy of [-1, 1]) {
        const tall = p.style === 'chair' && sx < 0;
        meshes.push(
          wood([leg, leg, (tall ? p.back : p.height - t) + 0.002], [sx * lx, sy * ly, 0]),
        );
      }
    if (b.lod < 2) {
      meshes.push(
        wood([leg * 0.6, p.width - 2 * leg, leg], [lx, 0, 0.16]),
        wood([leg * 0.6, p.width - 2 * leg, leg], [-lx, 0, 0.16]),
      );
      if (p.style === 'chair')
        for (const [z, h] of [
          [p.back - 0.12, 0.1],
          [p.height + 0.15, 0.05],
        ] as const)
          meshes.push(wood([0.022, 2 * ly, h], [-lx, 0, z]));
    }
    return merge(meshes);
  },
});
