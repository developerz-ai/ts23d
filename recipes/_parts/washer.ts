// Plain washer (ISO 7089): a flat ring with softened outer edges. Origin = bottom face, axis +Z.
// Dropped at LOD2.

import { definePart, lathe } from '@developerz.ai/ts23d';
import { METRIC, METRIC_SIZES, type MetricSize } from './metric.ts';
import { ringProfile, ZINC } from './shape.ts';

export const washer = definePart({
  name: 'washer',
  description: 'ISO 7089 plain washer: flat ring sized for a metric bolt',
  tags: ['fastener', 'hardware', 'metric'],
  params: { size: 'M12' as MetricSize },
  schema: { size: { oneOf: METRIC_SIZES, doc: 'ISO metric thread size it fits' } },
  lod: { upTo: 1 },
  build(b, p) {
    const { d, washer: od, washerH: h } = METRIC[p.size];
    return lathe({
      profile: ringProfile(d * 0.55, od / 2, 0, h, b.lod === 0 ? h * 0.25 : 0),
      segments: b.pick([20, 12, 8]),
      color: ZINC,
      strip: 'steel_galvanised',
    });
  },
});
