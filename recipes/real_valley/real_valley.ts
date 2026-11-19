// Real valley: 4 × 4 km of Yosemite Valley's east end at true scale — Half Dome, Glacier Point,
// Tenaya Canyon and the Merced canyon above Happy Isles — meshed from a pinned USGS 3DEP elevation
// model (public domain, via AWS Terrain Tiles), not from noise. Dossier, sources, attribution and
// the photo comparison: README.md.
//
// Pipeline: data/dem-yosemite_valley.json (257² heights, ≈ 15.6 m spacing, sha256-verified on
// decode) → terrainFromDEM: the survey as measured (no synthetic erosion), colour by altitude
// and slope as smooth per-vertex blends (granite grey walls, pale talus, conifer floor), plus
// meadows on the flat floor and dark water streaks down the walls below drainage lines, and a
// skirt down to z = 0 whose cut sides show strata (../mountain_range/ground.ts). Conifer impostors
// over the forest; the Merced as a ribbon along the valley floor of the survey (no flat water
// plane: the floor falls only 12 m over 2 km, so a level floods the meadows instead).
// Wikidata (CC0) supplies Half Dome's summit altitude: it sets `real.height` and must match the DEM.

import {
  type BuildContext,
  defineAsset,
  fbm,
  gradientNoise2,
  hex,
  type Mesh,
  terrainColor,
  type Vec3,
} from '@developerz.ai/ts23d';
import {
  citeWikidata,
  quantity,
  readDem,
  readWikidata,
  terrainFromDEM,
} from '@developerz.ai/ts23d/data';
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
import demJson from './data/dem-yosemite_valley.json';
import halfDomeJson from './data/wikidata-Q925252.json';

export const DEM = readDem(demJson, 'data/dem-yosemite_valley.json');
export const HALF_DOME = readWikidata(halfDomeJson, 'data/wikidata-Q925252.json');

/** Skirt depth below the lowest surveyed point (the Merced at the tile's west edge), m. */
const BASE = 40;
/** Altitude of z = 0 (what terrainFromDEM derives from the same DEM and BASE). */
export const DATUM = Math.floor(DEM.min - BASE);

/** Granite grey (not olive), mixed conifer forest, dry meadow, pale talus, damp ground. */
const PALETTE = {
  forest: hex('#2e4026'),
  grass: hex('#7a7c4c'),
  scree: hex('#a39d92'),
  rock: hex('#9a968f'),
  snow: hex('#f2f4f7'),
  wet: hex('#4a4a40'),
};
const MEADOW = hex('#8f8a52');
/** Water streaks (desert varnish and algae) on the granite below drainage lines. */
const STREAK = hex('#4a4640');
const STRATA = hex('#c4b8a8');
const WATER = hex('#5a7a84');
/** Cut-side wall height for the strata band, m (the tile's relief above the datum). */
const WALL = 1800;

/** Mixed conifer forest covers the floor and rims; no snow in late summer. */
const GROUND = { treeline: 3200, snowline: 3600, rockSlope: 1.0, screeSlope: 0.75 };
/** Cells per LOD: LOD2 at 38 keeps the far tile inside the terrain band (4 k triangles). */
const CELLS = [256, 128, 38] as const;

function build(ctx: BuildContext): void {
  const t = terrainFromDEM(DEM, {
    lod: ctx.lod,
    base: BASE,
    // No erosion `detail`: tried (40k droplets, ± thermal) and it rounded Half Dome's face and the
    // valley walls — measured granite cliffs beat simulated ones. Survey as measured.
    ground: { ...GROUND, palette: PALETTE },
    // Smooth per-vertex colour (ground.ts): per-triangle strips render as stripe banding here.
    strips: false,
    cells: [...CELLS],
  });
  const g = t.grid;
  const flow = d8Flow(g);
  const slope = (x: number, y: number): number => {
    const e = 12;
    return (
      Math.hypot(t.height(x + e, y) - t.height(x - e, y), t.height(x, y + e) - t.height(x, y - e)) /
      (2 * e)
    );
  };
  const mottle = fbm(gradientNoise2(ctx.rng.fork('meadow')), { scale: 160, octaves: 3 });
  const floor = DEM.min - DATUM + 25;
  const story = (x: number, y: number, z: number, c: Vec3): Vec3 => {
    const s = slope(x, y);
    const wet = mapAt(g, flow, x, y);
    let out = c;
    // Meadows on the flat valley floor (Ahwahnee, Stoneman): open ground between the trees.
    const meadow =
      Math.max(0, Math.min(1, (floor - z) / 20)) * Math.max(0, Math.min(1, (0.08 - s) / 0.05));
    out = mixC(out, MEADOW, meadow * Math.max(0, Math.min(1, mottle(x, y) * 2 + 0.4)));
    // Dark streaks down the granite walls wherever water runs over them.
    const streak =
      Math.max(0, Math.min(1, (s - 0.9) / 0.5)) * Math.max(0, Math.min(1, (wet - 0.32) / 0.18));
    return mixC(out, STREAK, 0.75 * streak);
  };
  // Far: each vertex the mean of the ground it stands for (±0.75 of a 105 m cell), so walls,
  // talus, forest and meadow fade across the far cells instead of switching cell by cell. The
  // base colour is the same terrainColor terrainFromDEM paints with (the cut sides are retinted
  // by sideTint below).
  const base = terrainColor(g, {
    palette: PALETTE,
    datum: t.datum * t.zPerMetre,
    treeline: GROUND.treeline * t.zPerMetre,
    snowline: GROUND.snowline * t.zPerMetre,
    rockSlope: GROUND.rockSlope,
    snowSlope: 1.1,
    jitter: 0,
  });
  const far = footprint(
    (x, y, z) => story(x, y, z, base(x, y, z)),
    t.height,
    (0.75 * (g.rect[2] - g.rect[0])) / CELLS[2],
    5,
  );
  const surface = recolour(t.terrain, (x, y, z, c) =>
    ctx.lod === 2 ? far(x, y, z) : story(x, y, z, c),
  );
  ctx.part('terrain', sideTint(macroUV(surface, g.rect, WALL), WALL, STRATA));
  // Conifers on the floor and the gentle rims, never on the walls or the meadows.
  const forest = (x: number, y: number): number => {
    const s = slope(x, y);
    const z = t.height(x, y);
    const open = z < floor ? Math.max(0, mottle(x, y) * 2 + 0.4) : 0;
    return Math.max(0, Math.min(1, (0.6 - s) / 0.3)) * (1 - Math.min(1, open));
  };
  ctx.part(
    'forest',
    conifers(
      g,
      t.height,
      forest,
      ctx.pick([2200, 1400, 110]),
      { height: [22, 45], radius: ctx.pick([4, 4.5, 6.5]) },
      PALETTE.forest,
      ctx.rng.fork('trees'),
    ),
    { connect: { as: 'rest', why: 'impostor spires stand in the ground on their base ring' } },
  );
  // The Merced: the least-cost path along the floor between the valley's lowest border points.
  const course = smoothPath(valleyPath(g, 2000), ctx.pick([3, 5, 14]));
  ctx.part('river', ribbon(course, [12, 24], t.height, 0.8, WATER), {
    connect: { as: 'rest', why: 'the water surface lies in its bed, banks sunk into the ground' },
  });
}

const mixC = (a: Vec3, b: Vec3, k: number): Vec3 => [
  a[0] + (b[0] - a[0]) * k,
  a[1] + (b[1] - a[1]) * k,
  a[2] + (b[2] - a[2]) * k,
];

/** Rewrite every vertex colour as f(x, y, z, current colour). */
function recolour(m: Mesh, f: (x: number, y: number, z: number, c: Vec3) => Vec3): Mesh {
  const colors = new Float32Array(m.colors);
  for (let i = 0; i < m.positions.length / 3; i++) {
    const c: Vec3 = [colors[i * 3] ?? 0, colors[i * 3 + 1] ?? 0, colors[i * 3 + 2] ?? 0];
    colors.set(
      f(m.positions[i * 3] ?? 0, m.positions[i * 3 + 1] ?? 0, m.positions[i * 3 + 2] ?? 0, c),
      i * 3,
    );
  }
  return { ...m, colors };
}

export const real_valley = defineAsset({
  name: 'real_valley',
  kind: 'terrain',
  description:
    'Yosemite Valley east end, 4 × 4 km at true scale from USGS 3DEP elevation: Half Dome, Glacier Point, Tenaya Canyon and the Merced canyon.',
  tags: ['terrain', 'landscape', 'real-data', 'dem', 'yosemite', 'map'],
  sources: [
    `${DEM.source.name} ${DEM.source.url} (z${DEM.zoom}, fetched ${DEM.source.fetched}); ${DEM.license}`,
    DEM.attribution,
    citeWikidata(HALF_DOME),
  ],
  copyright: DEM.attribution,
  real: {
    length: DEM.size[0],
    width: DEM.size[1],
    height: quantity(HALF_DOME, 'elevation') - DATUM,
    measures: [
      {
        label: 'Half Dome summit above the datum (Wikidata elevation)',
        axis: 'z',
        value: quantity(HALF_DOME, 'elevation') - DATUM,
        parts: ['terrain'],
        tolerance: 0.02,
        source: citeWikidata(HALF_DOME),
      },
    ],
  },
  budget: { triangles: [150000, 42000, 11000] },
  build,
});
