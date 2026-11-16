// `bun run data osm --bbox <minLon,minLat,maxLon,maxLat> --name <id> --out <file> [--source api|overpass]`:
// fetch one small OpenStreetMap extract ONCE, keep the raw response in the gitignored cache (by
// sha256) and write a normalised `ts23d-osm/1` record (footprints, heights, roads, land use in a
// local metric frame; source URL, raw sha256, date, ODbL licence and attribution) for a recipe to
// commit and import. `api` (default) is the OSM editing API's `map` call — fine for a block, and up
// when the public Overpass mirrors are at capacity; `overpass` sends the equivalent Overpass QL.

import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Ts23dError } from '../src/core/index.ts';
import { checkBbox, type OsmBbox, type OsmRecord, parseOsm, sha256 } from '../src/data/index.ts';
import { DATA_CACHE, type Fetch, writeJson } from './data-wikidata.ts';
import { withTimeout } from './fetch-timeout.ts';

const HEADERS = { 'User-Agent': 'ts23d-data (https://github.com/developerz-ai/ts23d)' };
export const OSM_API = 'https://api.openstreetmap.org/api/0.6/map.json';
export const OVERPASS = 'https://overpass-api.de/api/interpreter';

/** Overpass QL for the same features the API's `map` call returns, with every way's nodes. */
export function overpassQuery(b: OsmBbox): string {
  const box = `(${b[1]},${b[0]},${b[3]},${b[2]})`;
  const ways = ['building', 'highway', 'landuse', 'leisure', 'natural', 'amenity']
    .map((k) => `way["${k}"]${box};`)
    .join('');
  return `[out:json][timeout:60];(${ways});out body;>;out skel qt;`;
}

export function osmUrl(b: OsmBbox, source: 'api' | 'overpass'): string {
  return source === 'api'
    ? `${OSM_API}?bbox=${b.join(',')}`
    : `${OVERPASS}?data=${encodeURIComponent(overpassQuery(b))}`;
}

export async function fetchOsm(
  req: {
    readonly name: string;
    readonly bbox: readonly number[];
    readonly source?: 'api' | 'overpass';
  },
  get: Fetch = fetch,
  today = new Date().toISOString().slice(0, 10),
  cache = DATA_CACHE,
): Promise<OsmRecord> {
  const bbox = checkBbox(req.bbox);
  const source = req.source ?? 'api';
  const url = osmUrl(bbox, source);
  const res = await withTimeout(get)(url, { headers: HEADERS });
  if (!res.ok)
    throw new Ts23dError('T3D_DATA_OSM', {
      cause: `GET ${url} → HTTP ${res.status}`,
      fix: `retry later, or switch mirror: --source ${source === 'api' ? 'overpass' : 'api'}`,
    });
  const raw = new Uint8Array(await res.arrayBuffer());
  const hash = sha256(raw);
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(raw));
  } catch (cause) {
    throw new Ts23dError('T3D_DATA_OSM', {
      cause: `${url} did not answer JSON (${raw.byteLength} bytes): ${String(cause)}`,
      fix: 'the server sent an error page (at capacity?): retry, or switch --source',
    });
  }
  await mkdir(cache, { recursive: true });
  await Bun.write(join(cache, `${hash}.json`), raw);
  return parseOsm(json, {
    name: req.name,
    bbox,
    source: {
      url,
      ...(source === 'overpass' ? { query: overpassQuery(bbox) } : {}),
      fetched: today,
      sha256: hash,
    },
  });
}

/** argv after `osm`. */
export async function osmCommand(argv: readonly string[], get: Fetch = fetch): Promise<string[]> {
  const flag = (n: string): string | undefined => {
    const i = argv.indexOf(n);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const bbox = (flag('--bbox') ?? '').split(',').map(Number);
  const name = flag('--name');
  const out = flag('--out');
  const source = flag('--source') ?? 'api';
  if (!name || !out || (source !== 'api' && source !== 'overpass'))
    throw new Ts23dError('T3D_DATA_OSM', {
      cause: `osm needs --bbox, --name and --out, --source api|overpass (got ${argv.join(' ')})`,
      fix: 'bun run data osm --bbox -74.0045,40.7335,-74.0030,40.7345 --name west_village --out recipes/city_block/data/osm-west_village.json',
    });
  const rec = await fetchOsm({ name, bbox, source }, get);
  await mkdir(dirname(out), { recursive: true });
  await writeJson(out, rec);
  return [
    `✓ ${name}: ${rec.buildings.length} buildings, ${rec.roads.length} roads, ${rec.areas.length} areas → ${out}`,
    `  credit: ${rec.attribution}`,
  ];
}
