// Hex nut (ISO 4032), chamfered both faces, with the bolt's thread end standing proud at LOD0.
// Origin = bearing face (bottom), axis +Z. Dropped at LOD2.

import { cylinder, definePart, merge } from '@developerz.ai/ts23d';
import { hexHead } from './hex_bolt.ts';
import { METRIC, METRIC_SIZES, type MetricSize } from './metric.ts';
import { STEEL } from './shape.ts';

export const hex_nut = definePart({
  name: 'hex_nut',
  description: 'ISO 4032 hex nut, double-chamfered; optional thread end poking through',
  tags: ['fastener', 'hardware', 'metric'],
  params: { size: 'M12' as MetricSize, threadEnd: true },
  schema: {
    size: { oneOf: METRIC_SIZES, doc: 'ISO metric thread size' },
    threadEnd: { doc: 'show the bolt end standing ~1 thread diameter proud' },
  },
  lod: { upTo: 1 },
  build(b, p) {
    const { d, s, m } = METRIC[p.size];
    const nut = hexHead(s, m, b.lod, true);
    if (!p.threadEnd || b.lod > 0) return nut;
    const end = cylinder({
      radius: d / 2,
      length: d * 0.6,
      at: [0, 0, m + d * 0.3 - 0.0005],
      segments: 10,
      color: STEEL,
      strip: 'steel_galvanised',
    });
    return merge([nut, end]);
  },
});
