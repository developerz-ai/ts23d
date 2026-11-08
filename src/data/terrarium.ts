// Elevation tiles in the "terrarium" encoding (AWS Terrain Tiles / Mapzen joerd: 256² Web-Mercator
// PNG tiles, height = R·256 + G + B/256 − 32768 metres) → a regular grid in a local metric frame.
// Pure maths: the fetch script hands decoded tiles in; nothing here touches the network.

import { Ts23dError } from '../core/index.ts';

/** Mean Earth radius (IUGG), metres. */
export const EARTH_RADIUS = 6371008.8;
const TILE = 256;

/** One terrarium pixel → metres above sea level. */
export const decodeTerrarium = (r: number, g: number, b: number): number =>
  r * 256 + g + b / 256 - 32768;

/** WGS84 lon/lat (degrees) → global Web-Mercator pixel coordinates at zoom `z` (256 px tiles). */
export function lonLatToPixel(lon: number, lat: number, z: number): [number, number] {
  const n = TILE * 2 ** z;
  const phi = (lat * Math.PI) / 180;
  return [
    ((lon + 180) / 360) * n,
    ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * n,
  ];
}

export interface GeoCentre {
  readonly lat: number;
  readonly lon: number;
}

/**
 * Local tangent frame → lon/lat: x metres east, y metres north of `c` (equirectangular; on a
 * 10 km tile the error against a true projection is under a metre).
 */
export function localToLonLat(c: GeoCentre, x: number, y: number): [number, number] {
  const lat = c.lat + (y / EARTH_RADIUS) * (180 / Math.PI);
  const lon = c.lon + (x / (EARTH_RADIUS * Math.cos((c.lat * Math.PI) / 180))) * (180 / Math.PI);
  return [lon, lat];
}

/** The inverse of `localToLonLat`. */
export function lonLatToLocal(c: GeoCentre, lon: number, lat: number): [number, number] {
  const k = Math.PI / 180;
  return [(lon - c.lon) * k * EARTH_RADIUS * Math.cos(c.lat * k), (lat - c.lat) * k * EARTH_RADIUS];
}

export interface DemBox {
  readonly centre: GeoCentre;
  /** [east-west, north-south] extent in metres. */
  readonly size: readonly [number, number];
  /** Cells per side; the grid has (cells + 1)² points. */
  readonly cells: number;
  readonly zoom: number;
}

function checkBox(b: DemBox): void {
  const ok =
    Math.abs(b.centre.lat) < 85 &&
    Math.abs(b.centre.lon) <= 180 &&
    b.size.every((s) => s > 0 && s <= 200000) &&
    Number.isInteger(b.cells) &&
    b.cells >= 2 &&
    b.cells <= 4096 &&
    Number.isInteger(b.zoom) &&
    b.zoom >= 0 &&
    b.zoom <= 15;
  if (!ok)
    throw new Ts23dError('T3D_DATA_DEM', {
      cause: `DEM box ${JSON.stringify(b)} is out of range`,
      fix: 'lat within ±85°, size 1 m–200 km per side, cells 2–4096, zoom 0–15 (terrarium tops out at 15)',
    });
}

/** Tiles (x, y at `zoom`) covering the box, with one pixel of margin for bilinear sampling. */
export function tilesFor(b: DemBox): { x: number; y: number }[] {
  checkBox(b);
  const [w, h] = b.size;
  const [ax, ay] = lonLatToPixel(...localToLonLat(b.centre, -w / 2, h / 2), b.zoom);
  const [bx, by] = lonLatToPixel(...localToLonLat(b.centre, w / 2, -h / 2), b.zoom);
  const out: { x: number; y: number }[] = [];
  for (let y = Math.floor((ay - 1) / TILE); y <= Math.floor((by + 1) / TILE); y++)
    for (let x = Math.floor((ax - 1) / TILE); x <= Math.floor((bx + 1) / TILE); x++)
      out.push({ x, y });
  return out;
}

/** Decoded RGBA8 tile, row-major from its top (north) edge. */
export interface TileImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

/**
 * Sample the tiles bilinearly at every grid point of the box. Returns heights in metres,
 * row-major with j = 0 at the SOUTH edge and i = 0 at the WEST edge (the TerrainGrid layout).
 */
export function resampleTerrarium(
  b: DemBox,
  tile: (x: number, y: number) => TileImage,
): Float64Array {
  checkBox(b);
  const n = b.cells;
  const [w, h] = b.size;
  const at = (px: number, py: number): number => {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    const img = tile(tx, ty);
    if (img.width !== TILE || img.height !== TILE)
      throw new Ts23dError('T3D_DATA_DEM', {
        cause: `terrarium tile ${tx},${ty} is ${img.width}×${img.height}, not 256×256`,
        fix: 'use the 256 px terrarium tiles (…/terrarium/{z}/{x}/{y}.png)',
      });
    const k = ((py - ty * TILE) * TILE + (px - tx * TILE)) * 4;
    return decodeTerrarium(img.data[k] ?? 0, img.data[k + 1] ?? 0, img.data[k + 2] ?? 0);
  };
  const out = new Float64Array((n + 1) * (n + 1));
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      const [lon, lat] = localToLonLat(b.centre, -w / 2 + (w * i) / n, -h / 2 + (h * j) / n);
      // Pixel centres sit at +0.5: shift so integer coordinates are centres, then bilinear.
      const [fx, fy] = lonLatToPixel(lon, lat, b.zoom).map((v) => v - 0.5) as [number, number];
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const u = fx - x0;
      const v = fy - y0;
      const top = at(x0, y0) * (1 - u) + at(x0 + 1, y0) * u;
      const bot = at(x0, y0 + 1) * (1 - u) + at(x0 + 1, y0 + 1) * u;
      out[j * (n + 1) + i] = top * (1 - v) + bot * v;
    }
  return out;
}
