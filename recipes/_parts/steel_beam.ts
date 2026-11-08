// Rolled steel section — I-beam (IPE), channel (UPN) or equal angle — extruded along +X from the
// origin; section centred on Y, standing on z = 0. Real IPE 200: 200 × 100 mm, web 5.6, flange 8.5.

import { definePart, prism, type Vec2 } from '@developerz.ai/ts23d';
import { PAINT_GREEN } from './shape.ts';

type Section = 'I' | 'C' | 'L';

/** The section outline in (y, z), counter-clockwise; w = width, h = depth, tw web, tf flange. */
function outline(s: Section, w: number, h: number, tw: number, tf: number): Vec2[] {
  const hw = w / 2;
  if (s === 'I')
    return [
      [-hw, 0],
      [hw, 0],
      [hw, tf],
      [tw / 2, tf],
      [tw / 2, h - tf],
      [hw, h - tf],
      [hw, h],
      [-hw, h],
      [-hw, h - tf],
      [-tw / 2, h - tf],
      [-tw / 2, tf],
      [-hw, tf],
    ];
  if (s === 'C')
    return [
      [-hw, 0],
      [hw, 0],
      [hw, tf],
      [-hw + tw, tf],
      [-hw + tw, h - tf],
      [hw, h - tf],
      [hw, h],
      [-hw, h],
    ];
  return [
    [-hw, 0],
    [hw, 0],
    [hw, tf],
    [-hw + tw, tf],
    [-hw + tw, h],
    [-hw, h],
  ];
}

export const steel_beam = definePart({
  name: 'steel_beam',
  description: 'rolled steel I-beam, channel or angle along +X',
  tags: ['structure', 'industrial', 'steel'],
  params: {
    section: 'I' as Section,
    length: 2,
    depth: 0.2,
    width: 0.1,
    web: 0.0056,
    flange: 0.0085,
  },
  schema: {
    section: { oneOf: ['I', 'C', 'L'], doc: 'I (IPE/HEA), C (UPN channel), L (angle)' },
    length: { min: 0.05, max: 40, unit: 'm' },
    depth: { min: 0.02, max: 1.2, unit: 'm', doc: 'section height' },
    width: { min: 0.02, max: 0.6, unit: 'm', doc: 'flange width' },
    web: { min: 0.002, max: 0.05, unit: 'm', doc: 'web thickness' },
    flange: { min: 0.002, max: 0.06, unit: 'm', doc: 'flange thickness' },
  },
  validate: (p) =>
    p.flange * 2 >= p.depth || p.web >= p.width
      ? 'web/flange thicker than the section they belong to'
      : undefined,
  build(_b, p) {
    const m = prism({
      profile: outline(p.section, p.width, p.depth, p.web, p.flange),
      depth: p.length,
      plane: 'yz',
      centred: false,
      color: PAINT_GREEN,
      strip: 'steel_painted',
    });
    return m;
  },
});
