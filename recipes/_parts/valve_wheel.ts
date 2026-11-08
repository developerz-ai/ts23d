// Valve handwheel: a round rim on spokes, hub and stem. Origin = stem base, wheel up (+Z), turns
// about Z. Real gate-valve handwheels: Ø 100–400 mm, 3–6 spokes, painted cast iron.

import { beam, cylinder, definePart, lathe, type Mesh, merge } from '@developerz.ai/ts23d';
import { DARK_STEEL, PAINT_RED, torusProfile } from './shape.ts';

export const valve_wheel = definePart({
  name: 'valve_wheel',
  description: 'valve handwheel: round rim, spokes, hub and stem; turns about Z',
  tags: ['pipe', 'industrial', 'valve'],
  params: { diameter: 0.25, spokes: 4, stem: 0.12 },
  schema: {
    diameter: { min: 0.06, max: 1.2, unit: 'm' },
    spokes: { min: 2, max: 8, unit: 'count' },
    stem: { min: 0.01, max: 1, unit: 'm', doc: 'stem height below the hub' },
  },
  build(b, p) {
    const R = p.diameter / 2;
    const r = Math.max(0.006, p.diameter * 0.045);
    const z = p.stem;
    const rim = lathe({
      profile: torusProfile(R - r, r, b.pick([10, 6, 4])),
      segments: b.pick([32, 16, 10]),
      at: [0, 0, z],
      color: PAINT_RED,
      strip: 'steel_painted',
    });
    const hubR = r * 2.2;
    const meshes: Mesh[] = [
      rim,
      cylinder({
        radius: hubR,
        length: r * 3,
        at: [0, 0, z],
        segments: b.pick([12, 8, 6]),
        color: PAINT_RED,
        strip: 'steel_painted',
      }),
      cylinder({
        radius: r * 1.1,
        length: z + r,
        at: [0, 0, (z + r) / 2 - r * 0.5 + 0.0005],
        segments: b.pick([10, 6, 4]),
        color: DARK_STEEL,
        strip: 'steel_galvanised',
      }),
    ];
    for (let i = 0; i < p.spokes; i++) {
      const a = (i / p.spokes) * Math.PI * 2 + Math.PI / 4;
      const dir = [Math.cos(a), Math.sin(a)] as const;
      meshes.push(
        beam({
          from: [dir[0] * hubR * 0.8, dir[1] * hubR * 0.8, z],
          to: [dir[0] * (R - r * 0.8), dir[1] * (R - r * 0.8), z],
          width: r * 1.2,
          segments: b.pick([8, 6, 4]),
          color: PAINT_RED,
          strip: 'steel_painted',
        }),
      );
    }
    return merge(meshes);
  },
});
