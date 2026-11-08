// Wooden shipping crate: a board box framed by battens on every edge, with diagonal braces on the
// end faces at LOD0. Origin = base centre. Real: a 1.2 × 0.8 m Euro-pallet footprint crate.

import { beam, box, definePart, type Mesh, merge } from '@developerz.ai/ts23d';
import { NAT } from './shape.ts';

export const crate = definePart({
  name: 'crate',
  description: 'wooden crate: board box, edge battens, diagonal braces',
  tags: ['prop', 'container', 'wood'],
  params: { size: [0.8, 0.6, 0.6] as readonly number[], batten: 0.06 },
  schema: {
    size: { doc: 'outside length (X), width (Y), height (Z), metres' },
    batten: { min: 0.02, max: 0.15, unit: 'm', doc: 'edge batten width' },
  },
  validate: (p) =>
    p.size.length !== 3 || p.size.some((v) => !(v > p.batten * 2.5))
      ? 'size is [x, y, z], each > 2.5 battens'
      : undefined,
  build(b, p) {
    const [x = 1, y = 1, z = 1] = p.size;
    const w = p.batten;
    const t = 0.02;
    const bev = b.lod === 0 ? 0.004 : 0;
    const board = box({
      size: [x - 2 * t, y - 2 * t, z - 2 * t],
      at: [0, 0, t],
      color: NAT,
      strip: 'pine',
    });
    const meshes: Mesh[] = [board];
    if (b.lod === 2) return box({ size: [x, y, z], color: NAT, strip: 'pine' });
    const bat = (size: [number, number, number], at: [number, number, number]): Mesh =>
      box({ size, at, color: NAT, strip: 'wood_weathered', bevel: bev });
    for (const sx of [-1, 1])
      for (const sy of [-1, 1])
        meshes.push(bat([w, w, z], [(sx * (x - w)) / 2, (sy * (y - w)) / 2, 0]));
    for (const sz of [0, z - w]) {
      for (const sy of [-1, 1]) meshes.push(bat([x - 2 * w, w, w], [0, (sy * (y - w)) / 2, sz]));
      for (const sx of [-1, 1]) meshes.push(bat([w, y - 2 * w, w], [(sx * (x - w)) / 2, 0, sz]));
    }
    if (b.lod === 0)
      for (const sx of [-1, 1]) {
        const fx = sx * (x / 2 - t / 2);
        meshes.push(
          beam({
            from: [fx, -(y / 2 - w), w],
            to: [fx, y / 2 - w, z - w],
            width: w * 0.8,
            height: t * 1.4,
            up: [sx, 0, 0],
            color: NAT,
            strip: 'wood_weathered',
          }),
        );
      }
    return merge(meshes);
  },
});
