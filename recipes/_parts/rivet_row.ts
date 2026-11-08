// A row of round-head (snap) or countersunk-flat rivet heads on a plate. Origin = first rivet on
// the plate surface; the row runs along +X, heads stand up +Z. Real snap head: Ø 1.6–1.75 d,
// height 0.6–0.7 d. LOD0 only by default (a rivet is a normal-map detail at distance).

import { definePart, lathe, merge, place } from '@developerz.ai/ts23d';
import { DARK_STEEL } from './shape.ts';

export const rivet_row = definePart({
  name: 'rivet_row',
  description: 'row of snap (round) or flat rivet heads along +X',
  tags: ['fastener', 'hardware', 'detail'],
  params: { count: 8, pitch: 0.05, diameter: 0.012, head: 'round' as 'round' | 'flat' },
  schema: {
    count: { min: 1, max: 400, unit: 'count' },
    pitch: { min: 0.005, max: 2, unit: 'm', doc: 'centre-to-centre spacing' },
    diameter: { min: 0.002, max: 0.05, unit: 'm', doc: 'rivet shank diameter d' },
    head: { oneOf: ['round', 'flat'], doc: 'snap head or flush countersunk' },
  },
  validate: (p) =>
    p.pitch < p.diameter * 1.8
      ? `pitch ${p.pitch} m overlaps heads of Ø ${p.diameter * 1.7}`
      : undefined,
  lod: { upTo: 0 },
  build(b, p) {
    const r = p.diameter * 0.85;
    const h = p.head === 'round' ? p.diameter * 0.65 : p.diameter * 0.12;
    const profile: [number, number][] =
      p.head === 'round'
        ? [
            [r, -0.001],
            [r, 0],
            [r * 0.92, h * 0.45],
            [r * 0.65, h * 0.85],
            [r * 0.25, h],
          ]
        : [
            [r, -0.001],
            [r, h * 0.4],
            [r * 0.8, h],
          ];
    const head = lathe({
      profile,
      segments: b.pick([10, 8, 6]),
      caps: true,
      color: DARK_STEEL,
      strip: 'iron_cast',
    });
    return merge(
      Array.from({ length: p.count }, (_, i) => place(head, { at: [i * p.pitch, 0, 0] })),
    );
  },
});
