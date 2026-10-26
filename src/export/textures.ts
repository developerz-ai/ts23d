// The trim sheet in glTF: three images (albedo sRGB, normal + ORM linear), three textures and one
// sampler (REPEAT along U so strips tile, CLAMP along V so the atlas never wraps rows, trilinear
// mips). Embedded: PNGs ride in the BIN chunk after the geometry (self-contained single files).
// External: images reference `<prefix>_{albedo,normal,orm}.png` by URI, so fifty assets share one
// texture set on disk and in GPU memory — the point of the trim sheet. Write the PNGs once with
// `sheetPngs`. Texture indices are fixed: 0 albedo, 1 normal, 2 ORM (materials.ts binds them).

import { encodePng } from '../core/index.ts';
import type { PaintedSheet } from '../material/index.ts';
import type { Json } from './bin-writer.ts';

export type SheetMap = 'albedo' | 'normal' | 'orm';
export const SHEET_MAPS: readonly SheetMap[] = ['albedo', 'normal', 'orm'];

/** Reference a shared sheet by URI instead of embedding it. */
export interface ExternalSheet {
  readonly external: true;
  /** URI prefix relative to the .glb, e.g. `../textures/trim_sheet`. Default `trim_sheet`. */
  readonly prefix?: string;
}

export type SheetBinding = PaintedSheet | ExternalSheet;

export const sheetFileName = (map: SheetMap, prefix = 'trim_sheet'): string =>
  `${prefix}_${map}.png`;

const LINEAR = 9729;
const LINEAR_MIPMAP_LINEAR = 9987;
const REPEAT = 10497;
const CLAMP_TO_EDGE = 33071;

const pngCache = new WeakMap<PaintedSheet, Readonly<Record<SheetMap, Uint8Array>>>();

/** PNG bytes of each map, encoded once per sheet (every LOD's GLB reuses them). */
export function sheetPngs(sheet: PaintedSheet): Readonly<Record<SheetMap, Uint8Array>> {
  const hit = pngCache.get(sheet);
  if (hit) return hit;
  const pngs = {
    albedo: encodePng(sheet.size, sheet.size, sheet.albedo),
    normal: encodePng(sheet.size, sheet.size, sheet.normal),
    orm: encodePng(sheet.size, sheet.size, sheet.orm),
  };
  pngCache.set(sheet, pngs);
  return pngs;
}

const isExternal = (s: SheetBinding): s is ExternalSheet => 'external' in s;

/**
 * glTF `images` / `textures` / `samplers` for the sheet. Embedded image bytes are returned as
 * `tail`, to append to the BIN chunk at `offset` (4-aligned); their bufferViews go into `views`.
 */
export function sheetGltf(
  sheet: SheetBinding,
  views: Json[],
  offset: number,
): { json: Json; tail: Uint8Array } {
  const textures = SHEET_MAPS.map((_, i) => ({ sampler: 0, source: i }));
  const samplers = [
    { magFilter: LINEAR, minFilter: LINEAR_MIPMAP_LINEAR, wrapS: REPEAT, wrapT: CLAMP_TO_EDGE },
  ];
  if (isExternal(sheet)) {
    const images = SHEET_MAPS.map((m) => ({
      name: `trim_sheet_${m}`,
      uri: sheetFileName(m, sheet.prefix),
    }));
    return { json: { images, textures, samplers }, tail: new Uint8Array() };
  }
  const pngs = sheetPngs(sheet);
  const parts: Uint8Array[] = [];
  const images: Json[] = [];
  let at = offset;
  for (const m of SHEET_MAPS) {
    const png = pngs[m];
    views.push({ buffer: 0, byteOffset: at, byteLength: png.byteLength });
    images.push({ name: `trim_sheet_${m}`, bufferView: views.length - 1, mimeType: 'image/png' });
    const pad = (4 - (png.byteLength % 4)) % 4;
    parts.push(png, new Uint8Array(pad));
    at += png.byteLength + pad;
  }
  const tail = new Uint8Array(at - offset);
  let o = 0;
  for (const p of parts) {
    tail.set(p, o);
    o += p.byteLength;
  }
  return { json: { images, textures, samplers }, tail };
}
