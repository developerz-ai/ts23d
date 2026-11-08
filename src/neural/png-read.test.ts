import { describe, expect, test } from 'bun:test';
import { deflateSync } from 'node:zlib';
import { encodePng } from '../core/index.ts';
import { inflate } from './inflate.ts';
import { readPng } from './png-read.ts';

describe('inflate + readPng (pure TS, browser-safe)', () => {
  test('a bad stream / not a PNG → T3D_IMPORT_UNSUPPORTED', () => {
    expect(() => inflate(Uint8Array.from([0x78, 0x01, 0xff]))).toThrow('T3D_IMPORT_UNSUPPORTED');
    expect(() => readPng(new Uint8Array(40), 'x')).toThrow('T3D_IMPORT_UNSUPPORTED');
  });
  test('inflate matches zlib on stored, fixed and dynamic blocks', () => {
    const text = new TextEncoder().encode('ts23d '.repeat(400));
    const noise = Uint8Array.from({ length: 70000 }, (_, i) => (i * 2654435761) >>> 24);
    for (const data of [new Uint8Array(), text, noise])
      for (const level of [0, 1, 9]) {
        const z = new Uint8Array(deflateSync(data, { level }));
        expect(Buffer.from(inflate(z)).equals(Buffer.from(data))).toBe(true);
      }
  });
  test('readPng round-trips encodePng (filtered, deflated RGBA)', () => {
    const w = 37;
    const h = 23;
    const rgba = Uint8Array.from({ length: w * h * 4 }, (_, i) => (i * 7 + (i >> 5)) & 255);
    const img = readPng(encodePng(w, h, rgba), 'x');
    expect([img.width, img.height]).toEqual([w, h]);
    expect(Buffer.from(img.data).equals(Buffer.from(rgba))).toBe(true);
  });
});
