// Tubular guard railing: posts, handrail, knee rail and a toe board. Runs along +Y from the origin
// (the first post's foot). Real (EN ISO 14122-3): handrail 1.1 m, knee rail ≤ 0.5 m below it,
// toe board ≥ 100 mm, posts ≤ 1.5 m apart, Ø 42 mm tube.

import { box, cylinder, definePart, type Mesh, merge } from '@developerz.ai/ts23d';
import { PAINT_YELLOW } from './shape.ts';

export const railing = definePart({
  name: 'railing',
  description: 'tubular guard railing along +Y: posts, handrail, knee rail, toe board',
  tags: ['structure', 'industrial', 'safety'],
  params: { length: 3, height: 1.1, spacing: 1.5, toeBoard: true },
  schema: {
    length: { min: 0.3, max: 30, unit: 'm' },
    height: { min: 0.6, max: 1.5, unit: 'm', doc: 'top of the handrail' },
    spacing: { min: 0.3, max: 2, unit: 'm', doc: 'max post spacing' },
    toeBoard: { doc: '100 mm kick plate at the foot' },
  },
  build(b, p) {
    const r = 0.021;
    const seg = b.pick([12, 8, 5]);
    const posts = Math.max(2, Math.ceil(p.length / p.spacing) + 1);
    const step = p.length / (posts - 1);
    const meshes: Mesh[] = [];
    for (let i = 0; i < posts; i++)
      meshes.push(
        cylinder({
          radius: r,
          length: p.height - r,
          at: [0, i * step, (p.height - r) / 2],
          segments: seg,
          color: PAINT_YELLOW,
          strip: 'steel_painted',
        }),
      );
    const rail = (z: number): Mesh =>
      cylinder({
        radius: r,
        length: p.length + 2 * r,
        at: [0, p.length / 2, z],
        axis: 'y',
        segments: seg,
        color: PAINT_YELLOW,
        strip: 'steel_painted',
      });
    meshes.push(rail(p.height - r), rail(p.height / 2));
    if (p.toeBoard && b.lod < 2)
      meshes.push(
        box({
          size: [0.006, p.length + 2 * r, 0.1],
          at: [r + 0.003, p.length / 2, 0],
          color: PAINT_YELLOW,
          strip: 'steel_painted',
        }),
      );
    return merge(meshes);
  },
});
