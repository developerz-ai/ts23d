// Mountain range: a 2 × 2 km alpine map tile. Numbers and their caveats: README.md (dossier).
//
// Pipeline, all seeded from ctx.rng (three variants = three seeds + valley headings):
//   1. masses — ridged multifractal (sharp ridgelines, smooth lows) domain-warped so ranges fold,
//      over a U-shaped glacial trough along `valley`, plus low fBm hills.
//   2. erosion on one 256² grid shared by every LOD — hydraulic droplets carve gullies and drop
//      fans, then thermal erosion caps cliffs at 45°.
//   3. colour — forest below the treeline, meadow above, rock on steep ground, scree on fans, damp
//      gullies, snow above the snowline where the slope holds it.
//   4. mesh — heightfield at 256 / 128 / 64 cells by LOD, sampling the eroded grid, with a skirt
//      down to z = 0 (a solid tile). One part, one draw call.

import {
  type BuildContext,
  defineFamily,
  fbm,
  gradientNoise2,
  heightfield,
  hex,
  hydraulicErosion,
  ridged,
  sampler,
  terrainColor,
  terrainGrid,
  thermalErosion,
  warp,
} from '@developerz-ai/ts23d';

/** Altitude (m above sea level) of z = 0. */
const DATUM = 1650;
const HALF = 1000;
const RECT = [-HALF, -HALF, HALF, HALF] as const;

const PALETTE = {
  forest: hex('#2f4a2a'),
  grass: hex('#6f8a45'),
  scree: hex('#8a8272'),
  rock: hex('#5a5652'),
  snow: hex('#f2f4f7'),
  wet: hex('#4a4a3c'),
};

interface Params {
  /** Unit direction of the main valley in plan. */
  readonly valley: readonly [number, number];
  /** Valley floor and ridge relief, m. */
  readonly floor: number;
  readonly relief: number;
  readonly treeline: number;
  readonly snowline: number;
  /** Hydraulic droplets on the 257² grid (~2 per point carves strongly). */
  readonly droplets: number;
}

function build(ctx: BuildContext, p: Readonly<Params>): void {
  const rng = ctx.rng;
  const [vx, vy] = p.valley;
  const wx = fbm(gradientNoise2(rng.fork('warp-x')), { scale: 900, octaves: 3 });
  const wy = fbm(gradientNoise2(rng.fork('warp-y')), { scale: 900, octaves: 3 });
  const range = warp(
    ridged(gradientNoise2(rng.fork('range')), { scale: 1700, octaves: 6, gain: 0.35 }),
    wx,
    wy,
    350,
  );
  const hills = fbm(gradientNoise2(rng.fork('hills')), { scale: 700, octaves: 5 });
  const altitude = (x: number, y: number): number => {
    // Distance across the valley axis, meandering by up to 300 m; U-shaped trough profile.
    const along = x * vx + y * vy;
    const across = -x * vy + y * vx - 300 * wx(along * 0.7, 0);
    const d = Math.min(1, (across / 450) ** 2);
    return p.floor + p.relief * range(x, y) * (0.2 + 0.8 * d) + 60 * hills(x, y) + 120 * d;
  };
  let grid = terrainGrid({ rect: RECT, cells: 256, height: (x, y) => altitude(x, y) - DATUM });
  grid = hydraulicErosion(grid, rng.fork('erosion'), { droplets: p.droplets });
  grid = thermalErosion(grid, { talus: 1, iterations: 25 });
  const color = terrainColor(grid, {
    palette: PALETTE,
    datum: DATUM,
    treeline: p.treeline,
    snowline: p.snowline,
    rockSlope: 0.85,
    snowSlope: 1.2,
    noise: fbm(gradientNoise2(rng.fork('jitter')), { scale: 120, octaves: 3 }),
    jitter: 70,
  });
  const cells = ctx.pick([256, 128, 64]);
  ctx.part(
    'terrain',
    heightfield({
      rect: RECT,
      cells: [cells, cells],
      height: sampler(grid),
      color,
      skirt: 0,
      skirtColor: hex('#5a4a3a'),
    }),
  );
}

export const mountainRange = defineFamily<Params>({
  kind: 'terrain',
  description:
    '2 × 2 km alpine map tile: eroded ridges, a glacial valley, forest, meadow, rock and snow bands.',
  tags: ['terrain', 'landscape', 'alpine', 'erosion', 'map'],
  budget: { triangles: [140000, 40000, 10000] },
  defaults: {
    valley: [1, 0],
    floor: 1720,
    relief: 950,
    treeline: 2000,
    snowline: 2480,
    droplets: 100000,
  },
  build,
});

export const mountain_range = mountainRange.variant({ name: 'mountain_range', seed: 1 });
export const mountain_range_b = mountainRange.variant({
  name: 'mountain_range_b',
  seed: 2,
  params: { valley: [0.8, 0.6] },
});
export const mountain_range_c = mountainRange.variant({
  name: 'mountain_range_c',
  seed: 3,
  params: { valley: [0.6, -0.8], relief: 1050, snowline: 2550 },
});
