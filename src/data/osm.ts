// OpenStreetMap extract (ODbL 1.0) → a pinned, normalised record: building footprints (closed
// rings in a local metric frame, x east / y north of the bbox centre) with `height`,
// `building:levels` and `min_height`, road centrelines with their `highway` class, and land-use
// areas. Pure parsing of an Overpass (`out body; >; out skel qt;` or `out geom`) or OSM API 0.6
// `map.json` response; the network lives in scripts/data-osm.ts. The record carries the source
// URL, the raw response's sha256, the fetch date, the licence and the attribution every asset
// made from it must credit (ADR 015: built assets are Produced Works). `readOsm` re-hashes the
// features, so a hand-edited extract refuses with T3D_DATA_HASH.

import { Ts23dError, type Vec2 } from '../core/index.ts';
import { sha256, verifyPin } from './sha256.ts';
import { type GeoCentre, lonLatToLocal } from './terrarium.ts';

export const OSM_LICENSE = 'ODbL-1.0';
export const OSM_ATTRIBUTION =
  '© OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)';

/** [minLon, minLat, maxLon, maxLat]. */
export type OsmBbox = readonly [number, number, number, number];

export interface OsmBuilding {
  readonly id: number;
  /** Footprint, counter-clockwise, no closing duplicate, metres. */
  readonly ring: readonly Vec2[];
  /** `height` tag (m), or null. */
  readonly height: number | null;
  readonly levels: number | null;
  /** `min_height` tag (m; a bridge-over or an overhang starts there), default 0. */
  readonly minHeight: number;
  readonly building: string;
  readonly address?: string;
}

export interface OsmRoad {
  readonly id: number;
  readonly highway: string;
  readonly name?: string;
  readonly line: readonly Vec2[];
}

export interface OsmArea {
  readonly id: number;
  /** `landuse=grass` → 'landuse', 'grass'; also `leisure`, `natural`, `amenity=parking`. */
  readonly key: string;
  readonly value: string;
  readonly ring: readonly Vec2[];
}

export interface OsmFeatures {
  readonly buildings: readonly OsmBuilding[];
  readonly roads: readonly OsmRoad[];
  readonly areas: readonly OsmArea[];
}

export interface OsmSource {
  readonly url: string;
  /** Overpass QL, when the source was Overpass. */
  readonly query?: string;
  /** ISO date (provenance only). */
  readonly fetched: string;
  /** sha256 of the raw response bytes. */
  readonly sha256: string;
}

export interface OsmRecord extends OsmFeatures {
  readonly format: 'ts23d-osm/1';
  readonly name: string;
  readonly bbox: OsmBbox;
  readonly centre: GeoCentre;
  readonly frame: 'local-equirectangular, x east, y north, metres from the bbox centre';
  readonly source: OsmSource;
  readonly license: typeof OSM_LICENSE;
  readonly attribution: typeof OSM_ATTRIBUTION;
  /** sha256 of the canonical JSON of { buildings, roads, areas }. */
  readonly sha256: string;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {});
const bad = (cause: string, fix: string): never => {
  throw new Ts23dError('T3D_DATA_OSM', { cause, fix });
};
const REPIN = 'bun run data osm --bbox <minLon,minLat,maxLon,maxLat> --name <id> --out <file>';

export function checkBbox(b: readonly number[]): OsmBbox {
  const [w = Number.NaN, s = Number.NaN, e = Number.NaN, n = Number.NaN] = b;
  const ok =
    b.length === 4 &&
    [w, s, e, n].every(Number.isFinite) &&
    w < e &&
    s < n &&
    w >= -180 &&
    e <= 180 &&
    s >= -85 &&
    n <= 85 &&
    (e - w) * (n - s) <= 0.0025;
  if (!ok)
    bad(
      `bbox [${b.join(', ')}] is not minLon,minLat,maxLon,maxLat within ±180/±85 and ≤ 0.0025 deg²`,
      'pass a small block, e.g. --bbox -74.0045,40.7335,-74.0030,40.7345 (≈ 130 × 110 m)',
    );
  return [w, s, e, n];
}

/** `height=17.3`, `height=17.3 m`; feet and other units are not guessed (null). */
export function parseHeight(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const m = /^\s*(\d+(?:\.\d+)?)\s*(m)?\s*$/.exec(v);
  return m ? Number(m[1]) : null;
}

const round = (v: number): number => Math.round(v * 100) / 100;
const area2 = (r: readonly Vec2[]): number =>
  r.reduce((s, a, i) => {
    const b = r[(i + 1) % r.length] ?? a;
    return s + a[0] * b[1] - b[0] * a[1];
  }, 0);

/** A closed way's ring: closing duplicate dropped, counter-clockwise. */
function ringOf(line: Vec2[]): Vec2[] {
  const r = line.slice();
  const [f, l] = [r[0], r[r.length - 1]];
  if (f && l && f[0] === l[0] && f[1] === l[1]) r.pop();
  return area2(r) < 0 ? r.reverse() : r;
}

const AREA_KEYS = ['landuse', 'leisure', 'natural', 'amenity'] as const;

/** Normalise a raw response into features (sorted by id, so the bytes are stable). */
export function osmFeatures(raw: unknown, centre: GeoCentre): OsmFeatures {
  const els = obj(raw)['elements'];
  if (!Array.isArray(els))
    return bad(
      'OSM response has no `elements` array (an error page or a truncated download?)',
      `retry: ${REPIN}`,
    );
  const nodes = new Map<number, Vec2>();
  for (const e of els.map(obj))
    if (e['type'] === 'node' && typeof e['lat'] === 'number' && typeof e['lon'] === 'number')
      nodes.set(Number(e['id']), lonLatToLocal(centre, e['lon'], e['lat']));
  const buildings: OsmBuilding[] = [];
  const roads: OsmRoad[] = [];
  const areas: OsmArea[] = [];
  for (const e of els.map(obj)) {
    if (e['type'] !== 'way') continue;
    const id = Number(e['id']);
    const tags = obj(e['tags']) as Record<string, string>;
    const geom = e['geometry'];
    const pts: Vec2[] = Array.isArray(geom)
      ? geom.map((g) => {
          const p = obj(g);
          return lonLatToLocal(centre, Number(p['lon']), Number(p['lat']));
        })
      : (Array.isArray(e['nodes']) ? e['nodes'] : []).map((n) => {
          const p = nodes.get(Number(n));
          return (
            p ??
            bad(
              `way ${id} references node ${n}, missing from the extract`,
              `re-fetch with the nodes of every way: ${REPIN}`,
            )
          );
        });
    const line = pts.map((p): Vec2 => [round(p[0]), round(p[1])]);
    const closed =
      line.length >= 4 && line[0]?.[0] === line.at(-1)?.[0] && line[0]?.[1] === line.at(-1)?.[1];
    if (tags['building'] && closed) {
      const street = tags['addr:street'];
      const no = tags['addr:housenumber'];
      buildings.push({
        id,
        ring: ringOf(line),
        height: parseHeight(tags['height']),
        levels: parseHeight(tags['building:levels']),
        minHeight: parseHeight(tags['min_height']) ?? 0,
        building: tags['building'],
        ...(street && no ? { address: `${no} ${street}` } : {}),
      });
    } else if (tags['highway'] && !closed) {
      roads.push({
        id,
        highway: tags['highway'],
        ...(tags['name'] ? { name: tags['name'] } : {}),
        line,
      });
    } else if (closed) {
      const key = AREA_KEYS.find((k) => tags[k]);
      if (key) areas.push({ id, key, value: tags[key] ?? '', ring: ringOf(line) });
    }
  }
  const byId = <T extends { id: number }>(xs: T[]): T[] => xs.sort((a, b) => a.id - b.id);
  return { buildings: byId(buildings), roads: byId(roads), areas: byId(areas) };
}

const canonical = (f: OsmFeatures): Uint8Array =>
  new TextEncoder().encode(
    JSON.stringify({ buildings: f.buildings, roads: f.roads, areas: f.areas }),
  );

/** Parse a raw response into a pinned record. */
export function parseOsm(
  raw: unknown,
  o: { name: string; bbox: readonly number[]; source: OsmSource },
): OsmRecord {
  if (!/^[a-z][a-z0-9_]*$/.test(o.name))
    bad(`name '${o.name}' is not snake_case`, 'e.g. --name west_village');
  const bbox = checkBbox(o.bbox);
  const centre = { lat: (bbox[1] + bbox[3]) / 2, lon: (bbox[0] + bbox[2]) / 2 };
  const f = osmFeatures(raw, centre);
  return {
    format: 'ts23d-osm/1',
    name: o.name,
    bbox,
    centre,
    frame: 'local-equirectangular, x east, y north, metres from the bbox centre',
    source: o.source,
    license: OSM_LICENSE,
    attribution: OSM_ATTRIBUTION,
    sha256: sha256(canonical(f)),
    ...f,
  };
}

/** A committed record: format and fields checked, features re-hashed against the pin. */
export function readOsm(json: unknown, where = 'OSM extract'): OsmRecord {
  const j = obj(json);
  const ok =
    j['format'] === 'ts23d-osm/1' &&
    j['license'] === OSM_LICENSE &&
    typeof j['sha256'] === 'string' &&
    Array.isArray(j['buildings']) &&
    Array.isArray(j['roads']) &&
    Array.isArray(j['areas']) &&
    Array.isArray(j['bbox']);
  if (!ok) bad(`${where} is not a ts23d-osm/1 record`, `pin it with \`${REPIN}\``);
  const r = json as OsmRecord;
  verifyPin(canonical(r), r.sha256, where);
  return r;
}

/** Credit line for `sources` / `copyright`: source URL, date, licence and attribution. */
export const citeOsm = (r: OsmRecord): string =>
  `OpenStreetMap extract '${r.name}' bbox ${r.bbox.join(',')} (${r.source.url}, fetched ${r.source.fetched}, sha256 ${r.source.sha256.slice(0, 12)}…); ${r.attribution}`;
