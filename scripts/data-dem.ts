// `bun run data dem --centre <lat,lon> --size <m[,m]> --cells N --zoom Z --name <id> --out <file>`:
// fetch AWS Terrain Tiles (terrarium PNG), verify-and-cache each tile by sha256, resample the box
// to a (cells + 1)² grid in a local metric frame and write one committed DEM JSON (16-bit heights,
// tile hashes, licence, attribution). Outside the conterminous US you must state the licence and
// attribution of the regional source (tilezen/joerd docs/attribution.md) yourself.

import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Ts23dError } from '../src/core/index.ts';
import {
  type DemBox,
  type DemRecord,
  encodeDem,
  resampleTerrarium,
  sha256,
  type TileImage,
  tilesFor,
} from '../src/data/index.ts';
import { decodePng } from '../src/material/index.ts';
import { DATA_CACHE, type Fetch, writeJson } from './data-wikidata.ts';
import { withTimeout } from './fetch-timeout.ts';

export const TERRARIUM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
export const JOERD_ATTRIBUTION = 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md';
/** In the conterminous US the tiles come from USGS 3DEP (formerly NED): public domain. */
export const US_3DEP = {
  license: `Public domain (USGS 3DEP elevation, served as AWS Terrain Tiles; ${JOERD_ATTRIBUTION})`,
  attribution:
    'United States 3DEP (formerly NED) terrain data courtesy of the U.S. Geological Survey; tiles: AWS Terrain Tiles (Mapzen/tilezen joerd).',
};

const inUs = (lat: number, lon: number): boolean =>
  lat > 24.5 && lat < 49.4 && lon > -124.8 && lon < -66.9;

export interface DemRequest extends DemBox {
  readonly name: string;
  readonly license?: string;
  readonly attribution?: string;
}

async function tileBytes(url: string, get: Fetch, cache: string): Promise<Uint8Array> {
  const res = await withTimeout(get)(url);
  if (!res.ok)
    throw new Ts23dError('T3D_DATA_DEM', {
      cause: `GET ${url} → HTTP ${res.status}`,
      fix: 'check the zoom (terrarium has 0–15) and that the box is on Earth; retry later',
    });
  const b = new Uint8Array(await res.arrayBuffer());
  await Bun.write(join(cache, `${sha256(b)}.png`), b);
  return b;
}

export async function fetchDem(
  req: DemRequest,
  get: Fetch = fetch,
  today = new Date().toISOString().slice(0, 10),
  cache = DATA_CACHE,
): Promise<DemRecord> {
  const us = inUs(req.centre.lat, req.centre.lon);
  const license = req.license ?? (us ? US_3DEP.license : undefined);
  const attribution = req.attribution ?? (us ? US_3DEP.attribution : undefined);
  if (!license || !attribution)
    throw new Ts23dError('T3D_DATA_DEM', {
      cause: `no --license / --attribution for a box outside the conterminous US (${req.centre.lat}, ${req.centre.lon})`,
      fix: `look up the regional source and its required credit in ${JOERD_ATTRIBUTION} and pass both`,
    });
  await mkdir(cache, { recursive: true });
  const tiles = new Map<string, TileImage>();
  const pins: { z: number; x: number; y: number; sha256: string }[] = [];
  for (const t of tilesFor(req)) {
    const url = TERRARIUM.replace('{z}', `${req.zoom}`)
      .replace('{x}', `${t.x}`)
      .replace('{y}', `${t.y}`);
    const b = await tileBytes(url, get, cache);
    pins.push({ z: req.zoom, x: t.x, y: t.y, sha256: sha256(b) });
    tiles.set(
      `${t.x}/${t.y}`,
      decodePng(b, (cause) => {
        throw new Ts23dError('T3D_DATA_DEM', { cause: `${url}: ${cause}`, fix: 'retry the fetch' });
      }),
    );
  }
  const heights = resampleTerrarium(req, (x, y) => {
    const t = tiles.get(`${x}/${y}`);
    if (!t)
      throw new Ts23dError('T3D_DATA_DEM', {
        cause: `tile ${x},${y} not fetched`,
        fix: 'report this bug: tilesFor missed a tile',
      });
    return t;
  });
  return encodeDem(req, heights, {
    name: req.name,
    source: { name: 'AWS Terrain Tiles (terrarium)', url: TERRARIUM, tiles: pins, fetched: today },
    license,
    attribution,
  });
}

/** argv after `dem`. */
export async function demCommand(argv: readonly string[], get: Fetch = fetch): Promise<string[]> {
  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const nums = (s: string | undefined): number[] => (s ?? '').split(',').map(Number);
  const [lat = Number.NaN, lon = Number.NaN] = nums(flag('--centre') ?? flag('--center'));
  const [w = Number.NaN, h = w] = nums(flag('--size'));
  const out = flag('--out');
  const name = flag('--name');
  if (!out || !name || !Number.isFinite(lat + lon + w + h))
    throw new Ts23dError('T3D_DATA_DEM', {
      cause: `dem needs --centre, --size, --name and --out (got ${argv.join(' ')})`,
      fix: 'bun run data dem --centre 37.738,-119.553 --size 4000 --cells 256 --zoom 13 --name yosemite --out recipes/x/data/dem-yosemite.json',
    });
  const license = flag('--license');
  const attribution = flag('--attribution');
  const rec = await fetchDem(
    {
      name,
      centre: { lat, lon },
      size: [w, h],
      cells: Number(flag('--cells') ?? 256),
      zoom: Number(flag('--zoom') ?? 13),
      ...(license ? { license } : {}),
      ...(attribution ? { attribution } : {}),
    },
    get,
  );
  await mkdir(dirname(out), { recursive: true });
  await writeJson(out, rec);
  return [
    `✓ ${name}: ${rec.cells + 1}² points over ${w}×${h} m, ${rec.min.toFixed(0)}–${rec.max.toFixed(0)} m, ${rec.source.tiles.length} tile(s) → ${out}`,
    `  credit: ${rec.attribution}`,
  ];
}
