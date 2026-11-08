// Compression spring: round wire swept along a helix with closed (zero-pitch) end coils. Origin =
// bottom centre, axis +Z. Real valve spring: Ø 30 mm, 4 mm wire, 6 active coils, 45 mm free length.

import { definePart, sweep, type Vec3 } from '@developerz.ai/ts23d';
import { DARK_STEEL } from './shape.ts';

export const spring = definePart({
  name: 'spring',
  description: 'helical compression spring with closed ends; axis +Z',
  tags: ['hardware', 'mechanical'],
  params: { diameter: 0.03, wire: 0.004, coils: 6, length: 0.045 },
  schema: {
    diameter: { min: 0.005, max: 1, unit: 'm', doc: 'outside diameter' },
    wire: { min: 0.0005, max: 0.08, unit: 'm' },
    coils: { min: 1, max: 60, unit: 'count', doc: 'active coils' },
    length: { min: 0.005, max: 3, unit: 'm', doc: 'free length' },
  },
  validate: (p) =>
    p.length < (p.coils + 2) * p.wire * 1.05
      ? `length ${p.length} m is shorter than the solid height`
      : undefined,
  build(b, p) {
    const R = (p.diameter - p.wire) / 2;
    const steps = b.pick([16, 10, 6]);
    const ends = 0.75;
    const turns = p.coils + 2 * ends;
    const active = p.length - p.wire;
    const path: Vec3[] = [];
    const total = Math.round(turns * steps);
    for (let i = 0; i <= total; i++) {
      const u = (i / total) * turns;
      const z = u < ends ? 0 : u > turns - ends ? active : ((u - ends) / p.coils) * active;
      const a = u * Math.PI * 2;
      path.push([R * Math.cos(a), R * Math.sin(a), p.wire / 2 + z]);
    }
    return sweep({
      section: { radius: p.wire / 2, segments: b.pick([8, 6, 4]) },
      path,
      caps: true,
      color: DARK_STEEL,
      strip: 'steel_galvanised',
    });
  },
});
