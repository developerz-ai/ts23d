// A pinned digital elevation model as one committed JSON: the box (centre, size, cells), heights
// quantised to 16 bits (offset + step, base64 little-endian), the sha256 of those bytes, and full
// provenance (source, tiles, licence, attribution). `decodeDem` verifies the hash and returns a
// TerrainGrid in a local metric frame — a compile reads this file, never the network.

import { Ts23dError } from '../core/index.ts';
import type { TerrainGrid } from '../primitives/index.ts';
import { sha256, verifyPin } from './sha256.ts';
import type { DemBox } from './terrarium.ts';

export interface DemSource {
  readonly name: string;
  /** Tile URL template, e.g. https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png */
  readonly url: string;
  /** Every tile read, with the sha256 of its bytes: re-fetching must give the same heights. */
  readonly tiles: readonly {
    readonly z: number;
    readonly x: number;
    readonly y: number;
    readonly sha256: string;
  }[];
  /** ISO date (provenance only). */
  readonly fetched: string;
}

export interface DemRecord extends DemBox {
  readonly format: 'ts23d-dem/1';
  readonly name: string;
  readonly frame: 'local-equirectangular, x east, y north, metres from centre; rows south→north';
  readonly encoding: 'u16le-base64';
  /** Height (m) of code 0 and metres per code step. */
  readonly offset: number;
  readonly step: number;
  readonly min: number;
  readonly max: number;
  /** sha256 of the decoded u16 bytes. */
  readonly sha256: string;
  readonly source: DemSource;
  readonly license: string;
  /** Credit line to ship with any asset made from it. */
  readonly attribution: string;
  readonly heights: string;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function toBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = ((b[i] ?? 0) << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += B64[(n >> 18) & 63] ?? '';
    s += B64[(n >> 12) & 63] ?? '';
    s += i + 1 < b.length ? (B64[(n >> 6) & 63] ?? '') : '=';
    s += i + 2 < b.length ? (B64[n & 63] ?? '') : '=';
  }
  return s;
}

function fromBase64(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  let acc = 0;
  let bits = 0;
  for (const ch of clean) {
    const v = B64.indexOf(ch);
    if (v < 0)
      throw new Ts23dError('T3D_DATA_DEM', {
        cause: `DEM heights hold '${ch}', not base64`,
        fix: 'the file was edited by hand: restore it, or re-pin with `bun run data dem …`',
      });
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 255;
      acc &= (1 << bits) - 1;
    }
  }
  return out;
}

/** Quantise heights (metres, TerrainGrid layout) into a record; `step` defaults to 5 cm. */
export function encodeDem(
  box: DemBox,
  heights: Float64Array,
  meta: { name: string; source: DemSource; license: string; attribution: string; step?: number },
): DemRecord {
  const points = (box.cells + 1) ** 2;
  if (heights.length !== points)
    throw new Ts23dError('T3D_DATA_DEM', {
      cause: `${heights.length} heights for a ${box.cells}-cell box (needs ${points})`,
      fix: 'resample to (cells + 1)² points (resampleTerrarium does)',
    });
  const step = meta.step ?? 0.05;
  let min = Infinity;
  let max = -Infinity;
  for (const h of heights) {
    min = Math.min(min, h);
    max = Math.max(max, h);
  }
  const offset = Math.floor(min);
  if ((max - offset) / step > 65535)
    throw new Ts23dError('T3D_DATA_DEM', {
      cause: `relief ${(max - min).toFixed(0)} m does not fit 16 bits at ${step} m steps`,
      fix: `pass a coarser step (≥ ${((max - offset) / 65535).toFixed(3)} m)`,
    });
  const bytes = new Uint8Array(points * 2);
  const dv = new DataView(bytes.buffer);
  for (let k = 0; k < points; k++)
    dv.setUint16(k * 2, Math.round(((heights[k] ?? 0) - offset) / step), true);
  return {
    format: 'ts23d-dem/1',
    name: meta.name,
    centre: box.centre,
    size: box.size,
    cells: box.cells,
    zoom: box.zoom,
    frame: 'local-equirectangular, x east, y north, metres from centre; rows south→north',
    encoding: 'u16le-base64',
    offset,
    step,
    // Rounded to the quantisation so the record carries no float noise (2692.8500000000004).
    min: Number((offset + Math.round((min - offset) / step) * step).toFixed(6)),
    max: Number((offset + Math.round((max - offset) / step) * step).toFixed(6)),
    sha256: sha256(bytes),
    source: meta.source,
    license: meta.license,
    attribution: meta.attribution,
    heights: toBase64(bytes),
  };
}

/** Verify and decode: altitudes in metres above sea level on a grid centred on (0, 0). */
export function decodeDem(r: DemRecord): TerrainGrid {
  if (r.format !== 'ts23d-dem/1' || r.encoding !== 'u16le-base64')
    throw new Ts23dError('T3D_DATA_DEM', {
      cause: `DEM '${r.name}' has format ${r.format} / ${r.encoding}`,
      fix: "re-pin it with `bun run data dem …` (format 'ts23d-dem/1', encoding 'u16le-base64')",
    });
  const bytes = fromBase64(r.heights);
  const points = (r.cells + 1) ** 2;
  if (bytes.length !== points * 2)
    throw new Ts23dError('T3D_DATA_DEM', {
      cause: `DEM '${r.name}' holds ${bytes.length / 2} heights, a ${r.cells}-cell grid needs ${points}`,
      fix: 'the file is truncated or edited: restore it, or re-pin with `bun run data dem …`',
    });
  verifyPin(bytes, r.sha256, `DEM '${r.name}'`);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const z = new Float64Array(points);
  for (let k = 0; k < points; k++) z[k] = r.offset + dv.getUint16(k * 2, true) * r.step;
  const [w, h] = r.size;
  return { nx: r.cells + 1, ny: r.cells + 1, rect: [-w / 2, -h / 2, w / 2, h / 2], z };
}
