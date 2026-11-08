// Fixed steel ladder: two flat-bar stringers and round rungs. Origin = foot centre; climbs +Z, the
// climbing face is +X. Real (EN ISO 14122-4): 400–600 mm between stringers, rungs every 225–300 mm.

import { box, cylinder, definePart, type Mesh, merge } from '@developerz.ai/ts23d';
import { PAINT_YELLOW } from './shape.ts';

export const ladder = definePart({
  name: 'ladder',
  description: 'fixed steel ladder: flat-bar stringers, round rungs; climb face +X',
  tags: ['structure', 'industrial', 'access'],
  params: { height: 3, width: 0.5, pitch: 0.28 },
  schema: {
    height: { min: 0.5, max: 20, unit: 'm' },
    width: { min: 0.3, max: 1, unit: 'm', doc: 'clear width between stringers' },
    pitch: { min: 0.2, max: 0.35, unit: 'm', doc: 'rung spacing' },
  },
  build(b, p) {
    const sw = 0.012;
    const sd = 0.06;
    const bevel = b.lod === 0 ? 0.002 : 0;
    const rail = (y: number): Mesh =>
      box({
        size: [sd, sw, p.height],
        at: [0, y, 0],
        color: PAINT_YELLOW,
        strip: 'steel_painted',
        bevel,
      });
    const meshes: Mesh[] = [rail(-(p.width + sw) / 2), rail((p.width + sw) / 2)];
    const n = Math.floor((p.height - 0.15) / p.pitch);
    const rung = (z: number): Mesh =>
      cylinder({
        radius: 0.012,
        length: p.width + sw,
        at: [0, 0, z],
        axis: 'y',
        segments: b.pick([10, 6, 4]),
        color: PAINT_YELLOW,
        strip: 'steel_painted',
      });
    for (let i = 1; i <= n; i++) meshes.push(rung(i * p.pitch));
    return merge(meshes);
  },
});
