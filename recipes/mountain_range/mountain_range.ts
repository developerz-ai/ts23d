// Mountain range: a 2 × 2 km alpine map tile. Numbers and their caveats: README.md (dossier).
//
// Pipeline, all seeded from ctx.rng (three variants = three seeds, valley headings and windows):
//   1. field (field.ts) — ridged multifractal over a U-shaped glacial trough, sampled at the
//      variant's window (`offset`) of an endless field; eroded on one grid of the tile plus a
//      250 m margin (hydraulic droplets, thermal 45° cap, needle clamp), then cropped to 256²
//      shared by every LOD, so the border row is an interior, relaxed row of the erosion. Erosion
//      is per tile and not faded at the cut: neighbour tiles share the raw field exactly but their
//      eroded edges differ by metres (README: "The tile's edge", measured seam mismatch).
//   2. colour — smooth per-vertex blends (ground.ts: no per-triangle strip switches, so no stripe
//      banding): forest below the treeline, meadow above, rock on steep ground, scree on fans, damp
//      torrent beds; north faces lose forest ~220 m lower, and the lines break up with noise. Snow
//      is a smooth cover map (snow.ts) from blurred slope, aspect and crest convexity.
//   3. mesh — heightfield at 256 / 128 / 38 cells by LOD, sampling the eroded grid, with a skirt
//      down to z = 0 (a solid tile; its top is the surface's own border row) whose cut sides show
//      rock strata; conifer impostors over the forest belt and the valley stream. One draw call.

import {
  type BuildContext,
  defineFamily,
  dmath,
  fbm,
  gradientNoise2,
  heightfield,
  hex,
  sampler,
  terrainColor,
  type Vec3,
} from '@developerz.ai/ts23d';
import { banks, type CliffWear, cliffWear, pathDistance } from '../_lib/terrain/cliff.ts';
import {
  conifers,
  d8Flow,
  footprint,
  macroUV,
  mapAt,
  ribbon,
  sideTint,
  smoothPath,
  valleyPath,
} from '../_lib/terrain/ground.ts';
import { DATUM, type FieldParams, RECT, tileField } from './field.ts';
import { withSkirt } from './skirt.ts';
import { boxBlur, snowCover } from './snow.ts';

const PALETTE = {
  forest: hex('#2c3f26'),
  grass: hex('#6b7448'),
  scree: hex('#8c8578'),
  rock: hex('#6a6560'),
  snow: hex('#f2f4f7'),
  wet: hex('#4a4a3c'),
};
const STRATA = hex('#b8a894');
/** Frost-shattered rock standing in a snowfield: paler than the weathered faces below. */
const OUTCROP = hex('#a19a90');
const WATER = hex('#5a7a88');
/** River gravel: the pale washed bank either side of the stream. */
const GRAVEL = hex('#a8a296');
/** Stream width at its source and mouth, m, and the gravel bank either side of it. */
const STREAM = { width: [14, 28] as [number, number], bank: 14 };

interface Params extends FieldParams {
  readonly treeline: number;
  readonly snowline: number;
}

/** Lowest tile altitude the skirt walls start from (z = 0), and the wall height used by strata. */
const WALL = 1200;
/** Shift (m of altitude) applied to north-facing slopes: lower snow and tree lines in shade. */
const NORTH_SHIFT = 220;

function build(ctx: BuildContext, p: Readonly<Params>): void {
  const rng = ctx.rng;
  const grid = tileField(rng, p);
  const height = sampler(grid);
  const flow = d8Flow(grid);
  const jitter = fbm(gradientNoise2(rng.fork('jitter')), { scale: 120, octaves: 3 });
  const base = terrainColor(grid, {
    palette: PALETTE,
    datum: DATUM,
    treeline: p.treeline,
    snowline: p.snowline,
    rockSlope: 0.85,
    // No slope holds snow here: snow comes from the smooth cover map below, not per point.
    snowSlope: -1,
    noise: jitter,
    jitter: 70,
  });
  const snow = snowCover(grid, {
    datum: DATUM,
    snowline: p.snowline,
    northShift: NORTH_SHIFT,
    jitter: (x, y) => 70 * jitter(x, y) + 45 * jitter(x * 2.3, y * 2.3),
  });
  // Snow round each point (±4 points, ~30 m): rock standing in a snowfield is a frost-shattered
  // outcrop, paler and unstreaked (meltwater streaks there drew dark smudges that read as holes).
  const snowNear = boxBlur(snow, grid.nx, grid.ny, 4);
  // Aspect: north faces (+Y) lose the forest sooner; the line breaks up.
  const northness = (x: number, y: number): number => {
    const e = 8;
    const dy = (height(x, y + e) - height(x, y - e)) / (2 * e);
    // Ground falling toward +Y faces north.
    return Math.max(-1, Math.min(1, -dy * 1.6));
  };
  // The valley stream: along the floor between the lowest points where the valley leaves the tile.
  const course = smoothPath(valleyPath(grid, 1200), ctx.pick([3, 5, 14]));
  const fromStream = pathDistance(course);
  // Rock weathering: water streaks down every face, bedding bands on the steep ground.
  const wear: CliffWear = {
    noise: fbm(gradientNoise2(rng.fork('streaks')), { scale: 1, octaves: 2 }),
    steep: [0.7, 1.15],
    streak: { color: hex('#3c3a36'), width: 14, amount: 0.65 },
    strata: { thickness: 38, amount: 0.12 },
  };
  const color = (x: number, y: number, z: number): Vec3 => {
    const shift = NORTH_SHIFT * northness(x, y) + 45 * jitter(x * 2.3, y * 2.3);
    const land = base(x, y, z + shift);
    const s = mapAt(grid, snow, x, y);
    const outcrop = (1 - s) * Math.min(1, 1.5 * mapAt(grid, snowNear, x, y));
    // Torrent beds: damp, darker gravel where water gathers below the snow.
    const wet = Math.max(0, Math.min(1, (mapAt(grid, flow, x, y) - 0.55) / 0.2)) * (1 - s);
    // Value breakup (±12 %, ~60 m patches): lichen-dark and fresh-pale rock, thin and thick turf.
    const v = 1 + 0.12 * jitter(x * 2, y * 2 + 500);
    const k = (c: number, w: number): number =>
      Math.min(
        1,
        ((land[c] ?? 0) +
          ((OUTCROP[c] ?? 0) - (land[c] ?? 0)) * outcrop +
          ((PALETTE.snow[c] ?? 0) - (land[c] ?? 0)) * s) *
          v *
          (1 - w * wet),
      );
    const c = cliffWear(
      [k(0, 0.25), k(1, 0.22), k(2, 0.15)],
      x,
      y,
      z,
      slopeAt(height, x, y),
      (1 - s) * (1 - Math.min(1, outcrop * 1.5)),
      wear,
    );
    const half = (STREAM.width[0] + STREAM.width[1]) / 4;
    return banks(c, fromStream(x, y), half, STREAM.bank, GRAVEL);
  };
  // LOD2 at 38 cells keeps the far tile inside the terrain band (4 k triangles, terrain.md).
  const cells = ctx.pick([256, 128, 38]);
  // Each vertex carries the mean colour of the ground it stands for, snow cover included: ±0.75
  // cell near (no one-cell snow seam on a crest), ±2 cells far, where a snowfield edge crossing
  // 53 m cells otherwise steps from one vertex to the next (white squares along the edge).
  const step = (RECT[2] - RECT[0]) / cells;
  const surface = heightfield({
    rect: RECT,
    cells: [cells, cells],
    height,
    color: footprint(color, height, ctx.pick([0.75, 0.75, 2]) * step, ctx.pick([3, 3, 9])),
  });
  // A solid tile down to z = 0, its walls topped by the surface's own border vertices.
  const block = withSkirt(surface, [cells, cells], 0);
  const ground = sideTint(macroUV(block, RECT, WALL), WALL, STRATA);
  // The forest belt: dense below the treeline on gentle, dry ground, thinning upward.
  const forest = (x: number, y: number): number => {
    const alt = height(x, y) + DATUM + NORTH_SHIFT * northness(x, y) + 70 * jitter(x, y);
    const slope = slopeAt(height, x, y);
    const wet = mapAt(grid, flow, x, y);
    return (
      Math.max(0, Math.min(1, (p.treeline - 40 - alt) / 160)) *
      Math.max(0, Math.min(1, (0.7 - slope) / 0.3)) *
      (wet > 0.62 ? 0 : 1)
    );
  };
  const trees = conifers(
    grid,
    height,
    forest,
    ctx.pick([1500, 1100, 110]),
    { height: [14, 26], radius: ctx.pick([3.2, 3.6, 5]) },
    PALETTE.forest,
    ctx.rng.fork('trees'),
  );
  const stream = ribbon(course, STREAM.width, height, 0.6, WATER);
  ctx.part('terrain', ground);
  // Static like the ground, so they share its one draw; each spire and the water rest on it.
  ctx.part('forest', trees, {
    connect: { as: 'rest', why: 'impostor spires stand in the ground on their base ring' },
  });
  ctx.part('stream', stream, {
    connect: { as: 'rest', why: 'the water surface lies in its bed, banks sunk into the ground' },
  });
}

/** Rise over run at (x, y) from central differences on the height. */
function slopeAt(h: (x: number, y: number) => number, x: number, y: number): number {
  const e = 8;
  return dmath.hypot(h(x + e, y) - h(x - e, y), h(x, y + e) - h(x, y - e)) / (2 * e);
}

export const mountainRange = defineFamily<Params>({
  kind: 'terrain',
  description:
    '2 × 2 km alpine map tile: eroded ridges, a glacial valley, forest, meadow, rock and snow bands.',
  tags: ['terrain', 'landscape', 'alpine', 'erosion', 'map'],
  // LOD2 inside the terrain band (≤ 4 k triangles).
  budget: { triangles: [140000, 40000, 4000] },
  // From the north-east, a little high: the snow lies on north faces, which the default
  // south-east 3/4 view only sees from behind.
  hero: { azDeg: 35, elDeg: 25 },
  defaults: {
    valley: [1, 0],
    floor: 1720,
    relief: 950,
    offset: [0, 0],
    treeline: 2000,
    snowline: 2420,
    droplets: 160000,
  },
  build,
});

/**
 * The three tiles: seed, valley heading and window. Each window (`offset`) keeps the variant's
 * tallest summit 450–750 m inside the cut (README.md: dossier).
 */
export const VARIANTS = {
  mountain_range: { seed: 1, params: { offset: [100, -300] } },
  mountain_range_b: {
    seed: 2,
    params: { valley: [0.8, 0.6], offset: [400, 500], snowline: 2350 },
  },
  mountain_range_c: {
    seed: 3,
    params: { valley: [0.6, -0.8], relief: 1050, offset: [300, -400], snowline: 2250 },
  },
} as const satisfies Record<string, { seed: number; params: Partial<Params> }>;

export const mountain_range = mountainRange.variant({
  name: 'mountain_range',
  ...VARIANTS.mountain_range,
});
export const mountain_range_b = mountainRange.variant({
  name: 'mountain_range_b',
  ...VARIANTS.mountain_range_b,
  // From the east, nearly square to the east cut: the stream, the forest and the snow-capped cone
  // face the lens, and the north cut is seen edge-on. Seen at 35° its far end showed two thin
  // teeth: the field's own crest runs along that cut for ~200 m (two 830 m tops, ground falling
  // inward behind them), and the border stays the untouched field so neighbours meet flush.
  hero: { azDeg: 10, elDeg: 28 },
});
export const mountain_range_c = mountainRange.variant({
  name: 'mountain_range_c',
  ...VARIANTS.mountain_range_c,
  // Down the valley (it runs NW → SE) from its north-west end, so the forested floor and the
  // snowy north faces of both peaks face the lens instead of the near ridge's cut wall.
  hero: { azDeg: 127, elDeg: 32 },
});
