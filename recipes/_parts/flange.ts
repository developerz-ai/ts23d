// Weld-neck pipe flange with a bolt circle of nuts. Origin = the gasket face, the neck runs along +Z
// (towards the pipe). Composes hex_nut for the bolts. Real DN100 PN16: Ø 220 mm, 8 × M16 on a
// 180 mm PCD, 20 mm thick (EN 1092-1).

import { definePart, lathe, type Mesh, merge, place } from '@developerz.ai/ts23d';
import { hex_nut } from './hex_nut.ts';
import { METRIC_SIZES, type MetricSize } from './metric.ts';
import { PAINT_GREEN } from './shape.ts';

export const flange = definePart({
  name: 'flange',
  description: 'weld-neck pipe flange with a ring of bolts (nuts on the back face)',
  tags: ['pipe', 'industrial', 'hardware'],
  params: { pipe: 0.114, outer: 0.22, thickness: 0.02, bolts: 8, boltSize: 'M16' as MetricSize },
  schema: {
    pipe: { min: 0.01, max: 2, unit: 'm', doc: 'pipe outside diameter it welds to' },
    outer: { min: 0.03, max: 3, unit: 'm', doc: 'flange outside diameter' },
    thickness: { min: 0.004, max: 0.2, unit: 'm' },
    bolts: { min: 0, max: 48, unit: 'count' },
    boltSize: { oneOf: METRIC_SIZES },
  },
  validate: (p) =>
    p.outer < p.pipe * 1.3
      ? `outer Ø ${p.outer} m leaves no room round a ${p.pipe} m pipe`
      : undefined,
  build(b, p) {
    const rp = p.pipe / 2;
    const ro = p.outer / 2;
    const t = p.thickness;
    const rn = rp + (ro - rp) * 0.3;
    const c = b.lod === 0 ? t * 0.1 : 0;
    const seg = b.pick([32, 16, 10]);
    const body = lathe({
      profile: [
        [rp * 0.86, 0],
        [ro - c, 0],
        [ro, c],
        [ro, t],
        [rn, t],
        [rp, t + p.thickness * 2],
        [rp * 0.86, t + p.thickness * 2],
        [rp * 0.86, 0],
      ],
      segments: seg,
      color: PAINT_GREEN,
      strip: 'steel_painted',
    });
    const meshes: Mesh[] = [body];
    const nut = b.mesh(hex_nut, { size: p.boltSize });
    const pcd = (rn + ro) / 2;
    for (let i = 0; i < p.bolts; i++) {
      const a = ((i + 0.5) / p.bolts) * Math.PI * 2;
      meshes.push(place(nut, { at: [pcd * Math.cos(a), pcd * Math.sin(a), t - 0.0005] }));
    }
    return merge(meshes);
  },
});
