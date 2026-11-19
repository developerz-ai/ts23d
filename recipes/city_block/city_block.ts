// City block — the West Village, Manhattan, between West 10th, Bleecker, Christopher and West 4th
// Streets: 130 × 110 m from a pinned OpenStreetMap extract (data/osm-west_village.json, ODbL; the
// footprints and `height` tags come from the NYC building import). Every building is its surveyed
// footprint extruded to its tagged height, coloured and windowed from a seed hashed from its OSM
// id, so neighbours differ and a rebuild is byte-identical; streets are the OSM centrelines. The
// asset is a Produced Work under the ODbL: the credit travels in `copyright` and `sources`.
// `scene()` returns the same block as an instanced scene (windows as EXT_mesh_gpu_instancing).

import {
  type BuildContext,
  cityPlan,
  cityWindow,
  cityWindows,
  defineAsset,
  hex,
  type Measure,
  type Vec2,
} from '@developerz.ai/ts23d';
import { citeOsm, type OsmBuilding, readOsm } from '@developerz.ai/ts23d/data';
import type { InstancedScene } from '@developerz.ai/ts23d/export';
import { buildBlock, TANK_RISE, tankAt } from './block.ts';
import osmJson from './data/osm-west_village.json';

export const OSM = readOsm(osmJson, 'data/osm-west_village.json');

const centroid = (r: readonly Vec2[]): Vec2 => [
  r.reduce((s, p) => s + p[0], 0) / r.length,
  r.reduce((s, p) => s + p[1], 0) / r.length,
];

/** Half the bbox in metres (local frame centred on the bbox). */
const HALF: Vec2 = [63, 55];

/** The block: buildings whose centroid lies inside the pinned bbox. */
export const BUILDINGS: readonly OsmBuilding[] = OSM.buildings.filter((b) => {
  const [x, y] = centroid(b.ring);
  return Math.abs(x) <= HALF[0] && Math.abs(y) <= HALF[1];
});

/** Federal and Greek-revival brick, brownstone and painted stucco (West Village photos, README). */
export const STYLE = {
  walls: [
    hex('#8b4a38'),
    hex('#6f3a2e'),
    hex('#9a5b42'),
    hex('#7a5444'),
    hex('#b38a6c'),
    hex('#c9b79c'),
  ],
  roof: hex('#3d3b39'),
  glass: hex('#26313b'),
  // Painted wood / brownstone cornices and lintel bands.
  trim: hex('#d8d0c0'),
  ground: hex('#8d8a84'),
  // A light neutral tint: the asphalt strip carries its own dark binder and pale aggregate
  // (a dark tint on it multiplied out to pure black from above).
  road: hex('#d6d4cf'),
} as const;

const OPTIONS = { ...STYLE, floorHeight: 3.2, streets: OSM.roads } as const;

/** The tallest buildings' tagged heights: QA `measures` (±2 %). */
const MEASURES: Measure[] = [...BUILDINGS]
  .filter((b) => b.height !== null)
  .sort((a, b) => (b.height ?? 0) - (a.height ?? 0) || a.id - b.id)
  .slice(0, 4)
  .map((b) => ({
    label: `${b.address ?? `way ${b.id}`} height (OSM height tag)`,
    value: b.height ?? 0,
    axis: 'z',
    parts: [`b${b.id}`],
    source: `https://www.openstreetmap.org/way/${b.id}`,
  }));

function build(ctx: BuildContext): void {
  buildBlock(ctx, BUILDINGS, OSM.roads, { ...STYLE, floorHeight: OPTIONS.floorHeight });
}

const xs = BUILDINGS.flatMap((b) => b.ring.map((p) => p[0]));
const ys = BUILDINGS.flatMap((b) => b.ring.map((p) => p[1]));
const tallest = Math.max(...BUILDINGS.map((b) => b.height ?? 0));
/** Highest point: a roof, or the top of a rooftop water tank (they stand on the taller roofs). */
const skyline = Math.max(
  tallest + 0.2,
  ...cityPlan(BUILDINGS, OPTIONS).map((p) => p.base + p.height + (tankAt(p) ? TANK_RISE : 0)),
);

export const city_block = defineAsset({
  name: 'city_block',
  kind: 'scene',
  description: `West Village block, Manhattan: ${BUILDINGS.length} buildings from a pinned OpenStreetMap extract (footprints + height tags), seeded facades, street centrelines; ODbL Produced Work`,
  tags: ['scene', 'city', 'building', 'real-data', 'osm', 'manhattan', 'modular'],
  license: 'ODbL-1.0',
  copyright: OSM.attribution,
  sources: [
    citeOsm(OSM),
    'https://wiki.openstreetmap.org/wiki/New_York_City/Buildings (NYC building import: footprints, heights)',
    'recipes/city_block/README.md (dossier, photos)',
  ],
  real: {
    // The slab reaches 4 m past the footprints on every side.
    length: Math.max(...xs) - Math.min(...xs) + 8,
    width: Math.max(...ys) - Math.min(...ys) + 8,
    height: skyline,
    tolerance: 0.02,
    measures: MEASURES,
  },
  budget: { triangles: [60000, 40000, 6000], draws: 3 },
  art: { focal: `b${BUILDINGS[0]?.id ?? 0}`, grounded: true },
  build,
});

/** The block's windows as one instanced set (the same plan and seeds the asset builds). */
export function scene(): InstancedScene {
  const transforms = cityPlan(BUILDINGS, OPTIONS).flatMap(cityWindows);
  return {
    name: 'city_block',
    sets: [{ name: 'window', mesh: cityWindow(STYLE.glass), transforms }],
    copyright: OSM.attribution,
  };
}
