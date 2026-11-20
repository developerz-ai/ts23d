// The block's own strips: square concrete sidewalk flags (1.5 m, NYC DOT standard 5 ft) instead
// of the stretched concrete strip, and the house brick and brownstone bonds painted over a 2.7 m
// band, so side walls, rear walls and LOD1 take a third of the bands (and triangles) without
// stretching the courses. Same painters and params as the house rows: the far bond keeps the
// near one's mean value, so the wall does not change tone at the LOD switch.

import { defineMaterial, tex } from '@developerz.ai/ts23d';

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
    variation: 0.3,
    grime: 0.65,
  },
  description:
    'NYC concrete sidewalk flags, 5 ft square with tooled joints, each flag its own tone and stains.',
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

/** Oil drips: dark blots ~1–2 m across in about one 3 m cell in two (seen at a grazing angle
 *  from the sidewalk, a smaller blot foreshortens to a hairline). */
const oilCell = tex.cells({ size: 3, jitter: 1, out: 'id', seed: 71 }).smoothstep(0.47, 0.53);
const oil = tex
  .cells({ size: 3, jitter: 1, out: 'f1', seed: 71 })
  .smoothstep(0.45, 0.15)
  .mul(oilCell)
  .add(tex.noise({ size: 0.5, seed: 72 }).smoothstep(0.55, 0.75).mul(oilCell).mul(0.4))
  .clamp();
/** Patched asphalt: utility-cut patches ~4 m, each laid at its own time (its own grey). */
const patches = tex.cells({ size: 4.5, jitter: 0.6, out: 'id', seed: 73 });

/**
 * Street asphalt at the scale wear reads at (a 4 m band, mapped by `projectStripUV`): worn binder with pale aggregate in
 * the noise, patches in their own greys, and oil blots. The library strip's 0.5 m band holds
 * the aggregate but cannot hold a stain a metre wide.
 */
export const STREET_ASPHALT = defineMaterial({
  id: 'city_asphalt_worn',
  scaleMetres: 4,
  spanMetres: 16,
  roughness: 0.88,
  graph: tex.material({
    height: tex.noise({ size: 0.3, seed: 74 }).mul(0.6).add(patches.mul(0.4)),
    depth: 0.003,
    albedo: tex
      .noise({ size: 0.7, octaves: 3, seed: 75 })
      .ramp([
        [0.2, '#3b3a38'],
        [0.8, '#53514d'],
      ])
      .mix('#242322', patches.smoothstep(0.55, 0.6).mul(0.85))
      .mix('#6a6761', patches.smoothstep(0.2, 0.15).mul(0.75))
      .mix('#141312', oil.mul(0.85)),
    roughness: oil.lerp(0.9, 0.45),
  }),
  description:
    'NYC street asphalt: worn binder, utility-cut patches in their own greys, oil blots.',
});
