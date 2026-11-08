// PNG → RGBA8 for imported textures, on the pure-TS inflate (same result in Bun and the browser):
// 8-bit grey, grey+alpha, RGB, RGBA and palette (+tRNS), non-interlaced — what DCC exporters
// write. Anything else is T3D_IMPORT_UNSUPPORTED with the re-save to make.

import { Ts23dError } from '../core/index.ts';
import type { Rgba } from '../material/index.ts';
import { inflate } from './inflate.ts';

const CH: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

export function readPng(bytes: Uint8Array, name: string): Rgba {
  const bad = (cause: string): never => {
    throw new Ts23dError('T3D_IMPORT_UNSUPPORTED', {
      cause: `'${name}' baseColor PNG: ${cause}`,
      fix: 're-save the texture as an 8-bit, non-interlaced RGBA PNG',
    });
  };
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33 || sig.some((s, i) => bytes[i] !== s)) bad('not a PNG');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let [w, h, type, depth, lace] = [0, 0, -1, 0, 0];
  let pal: Uint8Array = new Uint8Array();
  let trns: Uint8Array = new Uint8Array();
  const idat: Uint8Array[] = [];
  for (let o = 8; o + 8 <= bytes.length; ) {
    const len = dv.getUint32(o);
    const tag = String.fromCharCode(...bytes.subarray(o + 4, o + 8));
    const body = bytes.subarray(o + 8, o + 8 + len);
    if (tag === 'IHDR') {
      [w, h, depth, type, lace] = [
        dv.getUint32(o + 8),
        dv.getUint32(o + 12),
        body[8] ?? 0,
        body[9] ?? 0,
        body[12] ?? 0,
      ];
    } else if (tag === 'PLTE') pal = body;
    else if (tag === 'tRNS') trns = body;
    else if (tag === 'IDAT') idat.push(body);
    else if (tag === 'IEND') break;
    o += 12 + len;
  }
  const ch = CH[type];
  if (!ch || depth !== 8 || lace)
    bad(`colour type ${type}, ${depth}-bit${lace ? ', interlaced' : ''}`);
  const z = new Uint8Array(idat.reduce((s, c) => s + c.length, 0));
  let at = 0;
  for (const part of idat) {
    z.set(part, at);
    at += part.length;
  }
  const raw = inflate(z);
  const c = ch ?? 4;
  const stride = w * c;
  if (raw.length < h * (stride + 1)) bad('pixel data is short');
  const px = new Uint8Array(w * h * c);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)] ?? 0;
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x] ?? 0;
      const a = x >= c ? (px[row + x - c] ?? 0) : 0;
      const b = y ? (px[row - stride + x] ?? 0) : 0;
      const d = y && x >= c ? (px[row - stride + x - c] ?? 0) : 0;
      const p = a + b - d;
      const pr =
        Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - d)
          ? a
          : Math.abs(p - b) <= Math.abs(p - d)
            ? b
            : d;
      px[row + x] = (v + ([0, a, b, (a + b) >> 1, pr][f] ?? 0)) & 255;
    }
  }
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const s = i * c;
    const k = px[s] ?? 0;
    const rgba =
      type === 6
        ? [k, px[s + 1] ?? 0, px[s + 2] ?? 0, px[s + 3] ?? 255]
        : type === 2
          ? [k, px[s + 1] ?? 0, px[s + 2] ?? 0, 255]
          : type === 4
            ? [k, k, k, px[s + 1] ?? 255]
            : type === 3
              ? [pal[k * 3] ?? 0, pal[k * 3 + 1] ?? 0, pal[k * 3 + 2] ?? 0, trns[k] ?? 255]
              : [k, k, k, 255];
    data.set(rgba, i * 4);
  }
  return { width: w, height: h, data };
}
