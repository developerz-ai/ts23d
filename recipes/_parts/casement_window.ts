// Casement window: frame, glazing bars (sash) and a glass pane, plus a sill. Faces +X; origin =
// bottom centre of the frame, which sits in the wall opening. Pieces: `frame`, `sash`, `glass`
// (surface 'glass'). Real timber casement: 68 mm frame depth, 56–60 mm frame members.

import { box, definePart, type Mesh, merge, type PartPiece } from '@developerz.ai/ts23d';
import { NAT } from './shape.ts';

export const casement_window = definePart({
  name: 'casement_window',
  description: 'casement window: frame, glazing bars, glass pane and sill; faces +X',
  tags: ['building', 'window', 'glass'],
  params: { width: 1.2, height: 1.4, cols: 2, rows: 3, sill: true },
  schema: {
    width: { min: 0.3, max: 4, unit: 'm' },
    height: { min: 0.3, max: 4, unit: 'm' },
    cols: { min: 1, max: 8, unit: 'count', doc: 'panes across' },
    rows: { min: 1, max: 8, unit: 'count', doc: 'panes up' },
    sill: { doc: 'projecting sill under the frame' },
  },
  build(b, p) {
    const d = 0.068;
    const f = 0.058;
    const bev = b.lod === 0 ? 0.004 : 0;
    const wood = (
      size: [number, number, number],
      at: [number, number, number],
      bevel = bev,
    ): Mesh => box({ size, at, color: NAT, strip: 'wood_painted', bevel });
    const frame: Mesh[] = [
      wood([d, p.width, f], [0, 0, 0]),
      wood([d, p.width, f], [0, 0, p.height - f]),
      wood([d, f, p.height - 2 * f], [0, -(p.width - f) / 2, f], 0),
      wood([d, f, p.height - 2 * f], [0, (p.width - f) / 2, f], 0),
    ];
    if (p.sill)
      frame.push(wood([0.12, p.width + 0.08, 0.035], [0.04, 0, -0.035], b.lod === 0 ? 0.006 : 0));
    const iw = p.width - 2 * f;
    const ih = p.height - 2 * f;
    const bar = 0.03;
    const sash: Mesh[] = [];
    if (b.lod < 2) {
      for (let i = 1; i < p.cols; i++)
        sash.push(wood([0.04, bar, ih], [0.005, -iw / 2 + (i * iw) / p.cols, f], 0));
      for (let j = 1; j < p.rows; j++)
        sash.push(wood([0.04, iw, bar], [0.005, 0, f + (j * ih) / p.rows - bar / 2], 0));
    }
    const pieces: PartPiece[] = [
      { name: 'frame', mesh: merge(frame) },
      ...(sash.length ? [{ name: 'sash', mesh: merge(sash) }] : []),
      {
        name: 'glass',
        mesh: box({
          size: [0.006, iw, ih],
          at: [0, 0, f],
          color: [0.8, 0.86, 0.88],
          strip: 'glass',
        }),
        surface: 'glass',
      },
    ];
    return pieces;
  },
});
