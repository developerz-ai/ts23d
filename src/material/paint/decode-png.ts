// Minimal PNG decoder for stamping supplied images into cells and image strips: 8- or 16-bit grey,
// grey+alpha, RGB, RGBA (16-bit keeps the high byte) and 8-bit palette (with tRNS), non-interlaced. Zero dependencies beyond node:zlib. Anything else
// throws T3D_RECIPE_INVALID with the conversion to make.

import { inflateSync } from 'node:zlib';
import { Ts23dError } from '../../core/index.ts';

export interface Rgba {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
const CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** How a decode failure is reported: the caller's code and fix (default: a cell image). */
export type PngFailure = (cause: string) => never;

function cellImage(cause: string): never {
  throw new Ts23dError('T3D_RECIPE_INVALID', {
    cause: `cell image: ${cause}`,
    fix: 'pass PNG bytes, 8 or 16 bits per channel, non-interlaced (e.g. re-save as RGBA8 PNG)',
  });
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** PNG bytes → RGBA8 (row-major, top row first); unsupported input calls `bad`. */
export function decodePng(bytes: Uint8Array, bad: PngFailure = cellImage): Rgba {
  if (bytes.length < 33 || SIG.some((s, i) => bytes[i] !== s)) bad('not a PNG (bad signature)');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let type = -1;
  let depth = 8;
  let palette: Uint8Array = new Uint8Array();
  let trns: Uint8Array = new Uint8Array();
  const idat: Uint8Array[] = [];
  for (let o = 8; o + 8 <= bytes.length; ) {
    const len = dv.getUint32(o);
    const name = String.fromCharCode(...bytes.subarray(o + 4, o + 8));
    const body = bytes.subarray(o + 8, o + 8 + len);
    if (name === 'IHDR') {
      width = dv.getUint32(o + 8);
      height = dv.getUint32(o + 12);
      type = body[9] ?? -1;
      depth = body[8] ?? 0;
      if (depth !== 8 && !(depth === 16 && type !== 3))
        bad(`bit depth ${depth} (8, or 16 for non-palette images, is supported)`);
      if (body[12] !== 0) bad('interlaced');
    } else if (name === 'PLTE') palette = body;
    else if (name === 'tRNS') trns = body;
    else if (name === 'IDAT') idat.push(body);
    else if (name === 'IEND') break;
    o += 12 + len;
  }
  const ch = CHANNELS[type];
  if (!ch || width === 0 || height === 0) bad(`colour type ${type} or empty image`);
  const raw = new Uint8Array(inflateSync(Buffer.concat(idat)));
  const B = depth / 8;
  const bpp = ch * B;
  const stride = width * bpp;
  if (raw.length < height * (stride + 1)) bad('truncated image data');
  const px = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)] ?? 0;
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? (px[row + x - bpp] ?? 0) : 0;
      const b = y > 0 ? (px[row - stride + x] ?? 0) : 0;
      const c = x >= bpp && y > 0 ? (px[row - stride + x - bpp] ?? 0) : 0;
      const v = raw[src + x] ?? 0;
      const pred =
        f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? paeth(a, b, c) : 0;
      px[row + x] = (v + pred) & 255;
    }
  }
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * bpp;
    const at = (k: number): number => px[s + k * B] ?? 0;
    const g = at(0);
    const o = i * 4;
    if (type === 3) {
      data[o] = palette[g * 3] ?? 0;
      data[o + 1] = palette[g * 3 + 1] ?? 0;
      data[o + 2] = palette[g * 3 + 2] ?? 0;
      data[o + 3] = trns[g] ?? 255;
    } else if (ch >= 3) {
      data[o] = g;
      data[o + 1] = at(1);
      data[o + 2] = at(2);
      data[o + 3] = ch === 4 ? at(3) : 255;
    } else {
      data[o] = g;
      data[o + 1] = g;
      data[o + 2] = g;
      data[o + 3] = ch === 2 ? at(1) : 255;
    }
  }
  return { width, height, data };
}
