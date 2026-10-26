// Minimal PNG decoder for stamping supplied images into cells: 8-bit grey, grey+alpha, RGB, RGBA
// and palette (with tRNS), non-interlaced. Zero dependencies beyond node:zlib. Anything else
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

function bad(cause: string): never {
  throw new Ts23dError('T3D_RECIPE_INVALID', {
    cause: `cell image: ${cause}`,
    fix: 'pass PNG bytes, 8 bits per channel, non-interlaced (e.g. re-save as RGBA8 PNG)',
  });
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export function decodePng(bytes: Uint8Array): Rgba {
  if (bytes.length < 33 || SIG.some((s, i) => bytes[i] !== s)) bad('not a PNG (bad signature)');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let type = -1;
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
      if (body[8] !== 8) bad(`bit depth ${body[8]} (only 8 is supported)`);
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
  const stride = width * ch;
  if (raw.length < height * (stride + 1)) bad('truncated image data');
  const px = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)] ?? 0;
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? (px[row + x - ch] ?? 0) : 0;
      const b = y > 0 ? (px[row - stride + x] ?? 0) : 0;
      const c = x >= ch && y > 0 ? (px[row - stride + x - ch] ?? 0) : 0;
      const v = raw[src + x] ?? 0;
      const pred =
        f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? paeth(a, b, c) : 0;
      px[row + x] = (v + pred) & 255;
    }
  }
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * ch;
    const g = px[s] ?? 0;
    const o = i * 4;
    if (type === 3) {
      data[o] = palette[g * 3] ?? 0;
      data[o + 1] = palette[g * 3 + 1] ?? 0;
      data[o + 2] = palette[g * 3 + 2] ?? 0;
      data[o + 3] = trns[g] ?? 255;
    } else if (ch >= 3) {
      data[o] = g;
      data[o + 1] = px[s + 1] ?? 0;
      data[o + 2] = px[s + 2] ?? 0;
      data[o + 3] = ch === 4 ? (px[s + 3] ?? 255) : 255;
    } else {
      data[o] = g;
      data[o + 1] = g;
      data[o + 2] = g;
      data[o + 3] = ch === 2 ? (px[s + 1] ?? 255) : 255;
    }
  }
  return { width, height, data };
}
