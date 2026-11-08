// Hex bolt (ISO 4017): chamfered hex head, plain shank with a chamfered tip. Origin = underside of
// the head; head up (+Z), shank down into whatever it fastens. Dropped at LOD2.

import { definePart, lathe, merge } from '@developerz.ai/ts23d';
import { corners, METRIC, METRIC_SIZES, type MetricSize } from './metric.ts';
import { STEEL } from './shape.ts';

/** The hex head alone (shared with the nut): across-corners radius, chamfered top edge. */
export function hexHead(s: number, h: number, lod: 0 | 1 | 2, both = false) {
  const r = corners(s) / 2;
  const c = lod === 0 ? h * 0.15 : 0;
  const profile: [number, number][] =
    c > 0
      ? [
          ...(both ? [[r * 0.88, 0] as [number, number]] : []),
          [r, both ? c : 0],
          [r, h - c],
          [r * 0.88, h],
        ]
      : [
          [r, 0],
          [r, h],
        ];
  return lathe({
    profile,
    segments: 6,
    faceted: true,
    caps: true,
    color: STEEL,
    strip: 'steel_galvanised',
  });
}

export const hex_bolt = definePart({
  name: 'hex_bolt',
  description: 'ISO 4017 hex bolt: hex head on a plain shank; origin under the head',
  tags: ['fastener', 'hardware', 'metric'],
  params: { size: 'M12' as MetricSize, length: 0.04 },
  schema: {
    size: { oneOf: METRIC_SIZES, doc: 'ISO metric thread size' },
    length: { min: 0.008, max: 0.4, unit: 'm', doc: 'shank length under the head' },
  },
  lod: { upTo: 1 },
  build(b, p) {
    const { d, s, k } = METRIC[p.size];
    const r = d / 2;
    const shank = lathe({
      profile: [
        [r * 0.8, -p.length],
        [r, -p.length + r * 0.2],
        [r, 0.0005],
      ],
      segments: b.pick([12, 8, 6]),
      caps: true,
      color: STEEL,
      strip: 'steel_galvanised',
    });
    return merge([hexHead(s, k, b.lod), shank]);
  },
});
