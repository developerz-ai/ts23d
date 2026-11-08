// Lamp with a glowing piece: an enamel `pendant` hanging from the ceiling (origin = ceiling point,
// hangs −Z) or a caged `bulkhead` on a wall (origin = wall point, faces +X). Pieces: `body` and
// `glow` — declare `glow: [{ parts: ['*_glow'] }]` on the asset to make it emissive.
// Real: industrial pendant shade Ø 300–450 mm; bulkhead Ø 200–250 mm.

import {
  cylinder,
  definePart,
  lathe,
  type Mesh,
  merge,
  type PartPiece,
  sweep,
} from '@developerz.ai/ts23d';
import { DARK_STEEL, PAINT_GREEN, WARM_LIGHT } from './shape.ts';

export const lamp = definePart({
  name: 'lamp',
  description: 'enamel pendant or caged bulkhead lamp; its `glow` piece is the light',
  tags: ['light', 'industrial', 'glow'],
  params: { style: 'pendant' as 'pendant' | 'bulkhead', diameter: 0.36, drop: 0.6 },
  schema: {
    style: { oneOf: ['pendant', 'bulkhead'] },
    diameter: { min: 0.1, max: 1, unit: 'm', doc: 'shade or dome diameter' },
    drop: { min: 0.05, max: 3, unit: 'm', doc: 'cable length (pendant)' },
  },
  build(b, p) {
    const seg = b.pick([24, 14, 8]);
    const R = p.diameter / 2;
    if (p.style === 'pendant') {
      const top = -p.drop;
      const shade = lathe({
        // Closed enamel shell; written outside-then-inside (clockwise), reversed to counter-clockwise.
        profile: [
          [0.03, top],
          [R * 0.35, top - R * 0.12],
          [R, top - R * 0.55],
          [R, top - R * 0.58],
          [R - 0.004, top - R * 0.575],
          [R * 0.35 - 0.003, top - R * 0.12 - 0.003],
          [0.03, top - 0.004],
          [0.03, top],
        ]
          .map(([r, z]) => [r ?? 0, z ?? 0] as [number, number])
          .reverse(),
        segments: seg,
        color: PAINT_GREEN,
        strip: 'steel_painted',
        uv: 'metres',
      });
      const body: Mesh[] = [
        cylinder({
          radius: 0.05,
          length: 0.02,
          at: [0, 0, -0.01],
          segments: seg,
          color: DARK_STEEL,
          strip: 'steel_painted',
        }),
        cylinder({
          radius: 0.003,
          length: p.drop - 0.02,
          at: [0, 0, -0.02 - (p.drop - 0.02) / 2 + 0.001],
          segments: 6,
          color: DARK_STEEL,
          strip: 'rubber',
        }),
        cylinder({
          radius: 0.032,
          length: 0.06,
          at: [0, 0, top + 0.01],
          segments: b.pick([12, 8, 6]),
          color: DARK_STEEL,
          strip: 'steel_painted',
        }),
        shade,
      ];
      const bulb = lathe({
        // Open lathe profiles run upward (+z) so the caps and walls face out.
        profile: [
          [0.006, top - 0.128],
          [0.022, top - 0.12],
          [0.034, top - 0.09],
          [0.03, top - 0.06],
          [0.012, top - 0.02],
        ],
        segments: b.pick([12, 8, 6]),
        caps: true,
        color: WARM_LIGHT,
        strip: 'glass',
      });
      return [
        { name: 'body', mesh: merge(body) },
        { name: 'glow', mesh: bulb },
      ] satisfies PartPiece[];
    }
    const base = cylinder({
      radius: R * 1.1,
      length: 0.03,
      axis: 'x',
      at: [0.015, 0, 0],
      segments: seg,
      color: DARK_STEEL,
      strip: 'iron_cast',
    });
    const dome = lathe({
      profile: [
        [R * 0.95, 0.025],
        [R * 0.9, 0.06],
        [R * 0.6, R * 0.55],
        [R * 0.15, R * 0.68],
      ],
      segments: seg,
      caps: true,
      axis: 'x',
      color: WARM_LIGHT,
      strip: 'glass',
    });
    const cage: Mesh[] = [base];
    if (b.lod < 2)
      for (const a of [0, Math.PI / 2]) {
        const n = b.pick([10, 6, 4]);
        const path = Array.from({ length: n + 1 }, (_, k): [number, number, number] => {
          const t = (k / n) * Math.PI;
          const l = R * 1.02 * Math.cos(t);
          return [0.02 + R * 0.72 * Math.sin(t), l * Math.cos(a), l * Math.sin(a)];
        });
        cage.push(
          sweep({
            section: { radius: 0.005, segments: 6 },
            path,
            caps: true,
            color: DARK_STEEL,
            strip: 'iron_cast',
          }),
        );
      }
    return [
      { name: 'body', mesh: merge(cage) },
      { name: 'glow', mesh: dome },
    ] satisfies PartPiece[];
  },
});
