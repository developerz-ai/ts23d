// Short-link chain along +X: each link a round bar swept round a stadium, alternate links turned
// 90°. Origin = first link's centre. Real short-link chain: pitch ≈ 3 d, inside width ≈ 1.4 d.

import { definePart, merge, place, sweep, type Vec3 } from '@developerz.ai/ts23d';
import { DARK_STEEL } from './shape.ts';

export const chain = definePart({
  name: 'chain',
  description: 'short-link chain along +X; alternate links at 90°',
  tags: ['hardware', 'industrial'],
  params: { links: 8, wire: 0.01 },
  schema: {
    links: { min: 1, max: 200, unit: 'count' },
    wire: { min: 0.002, max: 0.08, unit: 'm', doc: 'bar diameter d' },
  },
  build(b, p) {
    const d = p.wire;
    const half = (1.5 * d) / 2;
    const rr = 1.2 * d;
    const n = b.pick([6, 4, 2]);
    // Stadium centreline: two straights ±half along X, ends of radius rr; start mid-straight.
    const path: Vec3[] = [[0, -rr, 0]];
    for (const [cx, a0] of [
      [half, -Math.PI / 2],
      [-half, Math.PI / 2],
    ] as const)
      for (let k = 0; k <= n; k++) {
        const a = a0 + (k / n) * Math.PI;
        path.push([cx + rr * Math.cos(a), rr * Math.sin(a), 0]);
      }
    path.push([0, -rr, 0]);
    const link = sweep({
      section: { radius: d / 2, segments: b.pick([8, 6, 4]) },
      path,
      caps: true,
      color: DARK_STEEL,
      strip: 'steel_galvanised',
    });
    const pitch = 2 * half + 2 * rr - d;
    return merge(
      Array.from({ length: p.links }, (_, i) =>
        place(link, { at: [i * pitch, 0, 0], roll: i % 2 ? Math.PI / 2 : 0 }),
      ),
    );
  },
});
