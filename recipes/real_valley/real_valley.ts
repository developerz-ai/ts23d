// Real valley: 4 × 4 km of Yosemite Valley's east end at true scale — Half Dome, Glacier Point,
// Tenaya Canyon and the Merced canyon above Happy Isles — meshed from a pinned USGS 3DEP elevation
// model (public domain, via AWS Terrain Tiles), not from noise. Dossier, sources, attribution and
// the photo comparison: README.md.
//
// Pipeline: data/dem-yosemite_valley.json (257² heights, ≈ 15.6 m spacing, sha256-verified on
// decode) → terrainFromDEM: the survey as measured (no synthetic erosion), colour by altitude
// and slope, nature strips per triangle (cliff on the granite walls, gravel on talus, moss under
// the forest) and a skirt down to z = 0. No water plane: the floor falls only 12 m over 2 km, so a
// flat level floods meadows instead of tracing the Merced (a ~30 m river the 15 m survey can't see).
// Wikidata (CC0) supplies Half Dome's summit altitude: it sets `real.height` and must match the DEM.

import { type BuildContext, defineAsset } from '@developerz.ai/ts23d';
import {
  citeWikidata,
  quantity,
  readDem,
  readWikidata,
  terrainFromDEM,
} from '@developerz.ai/ts23d/data';
import demJson from './data/dem-yosemite_valley.json';
import halfDomeJson from './data/wikidata-Q925252.json';

export const DEM = readDem(demJson, 'data/dem-yosemite_valley.json');
export const HALF_DOME = readWikidata(halfDomeJson, 'data/wikidata-Q925252.json');

/** Skirt depth below the lowest surveyed point (the Merced at the tile's west edge), m. */
const BASE = 40;
/** Altitude of z = 0 (what terrainFromDEM derives from the same DEM and BASE). */
export const DATUM = Math.floor(DEM.min - BASE);

function build(ctx: BuildContext): void {
  const t = terrainFromDEM(DEM, {
    lod: ctx.lod,
    base: BASE,
    // No erosion `detail`: tried (40k droplets, ± thermal) and it rounded Half Dome's face and the
    // valley walls — measured granite cliffs beat simulated ones. Survey as measured.
    ground: {
      // Mixed conifer forest covers the floor and rims; no snow in late summer.
      treeline: 3200,
      snowline: 3600,
      rockSlope: 1.0,
      screeSlope: 0.75,
    },
  });
  ctx.part('terrain', t.terrain);
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
