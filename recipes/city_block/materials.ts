// The block's own strips: square concrete sidewalk flags (1.5 m, NYC DOT standard 5 ft) instead
// of the stretched concrete strip, and the house brick and brownstone bonds painted over a 2.7 m
// band, so side walls, rear walls and LOD1 take a third of the bands (and triangles) without
// stretching the courses. Same painters and params as the house rows: the far bond keeps the
// near one's mean value, so the wall does not change tone at the LOD switch.

import { defineMaterial } from '@developerz.ai/ts23d';

/** One band of the far bonds, metres: a 3.2 m storey takes about one band. */
export const FAR_BAND = 2.7;
/** One band of the sidewalk strip: two flags. */
export const SIDEWALK_BAND = 3;

export const SIDEWALK = defineMaterial({
  id: 'city_sidewalk_flags',
  kind: 'bond',
  scaleMetres: SIDEWALK_BAND,
  spanMetres: 6,
  roughness: 0.9,
  params: {
    course: 1.5,
    length: 1.5,
    mortar: 0.02,
    depth: 0.004,
    bevel: 0.006,
    stagger: 0,
    relief: 0.0015,
    variation: 0.2,
    grime: 0.35,
  },
  description:
    'NYC concrete sidewalk flags, 5 ft square with tooled joints, each flag its own tone.',
  sources: ['https://www.nyc.gov/html/dot/downloads/pdf/sidewalk-standard-details.pdf'],
});

export const FAR_BRICK = defineMaterial({
  id: 'city_brick_far',
  kind: 'bond',
  scaleMetres: FAR_BAND,
  roughness: 0.85,
  params: { grime: 0.2 },
  description: 'The house brick bond over a 2.7 m band: side walls, rear walls and LOD1 facades.',
});

export const FAR_STONE = defineMaterial({
  id: 'city_stone_far',
  row: 11,
  kind: 'bond',
  scaleMetres: FAR_BAND,
  roughness: 0.9,
  params: {
    course: 0.22,
    length: 0.4,
    mortar: 0.016,
    depth: 0.012,
    bevel: 0.025,
    irregular: 0.5,
    relief: 0.004,
    variation: 0.3,
    grime: 0.2,
  },
  description: 'The house stone bond over a 2.7 m band (brownstone side and rear walls, LOD1).',
});
