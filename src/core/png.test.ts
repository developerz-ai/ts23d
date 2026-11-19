import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { decodePng } from '../material/index.ts';
import { readPng } from '../neural/png-read.ts';
import { encodePng } from './png.ts';

const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const same = (a: Uint8Array, b: Uint8Array): boolean => Buffer.from(a).equals(Buffer.from(b));

/** A fixed 64 × 48 image: flat ground, a gradient block and a dithered corner. */
function fixture(width = 64, height = 48): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const inBlock = x > 8 && x < 40 && y > 6 && y < 30;
      const px = inBlock ? [x * 4, y * 5, 120, 255] : [24, 26, 30, 255];
      out.set(
        x > 48 && y > 36 ? [(x * 37) & 255, (y * 91) & 255, (x * y) & 255, 200] : px,
        (y * width + x) * 4,
      );
    }
  return out;
}

/** The IDAT payload of a one-IDAT PNG, as `encodePng` writes it. */
function idat(png: Uint8Array): Uint8Array {
  const length = new DataView(png.buffer, png.byteOffset).getUint32(33);
  expect(String.fromCharCode(...png.subarray(37, 41))).toBe('IDAT');
  return png.subarray(41, 41 + length);
}

describe('encodePng', () => {
  // D183: the IDAT came from node:zlib, a different library in Bun and in Node, so one image had
  // two encodings (17,919 and 31,190 bytes for the same contact sheet). These hashes were checked
  // under Bun and under Node; they fail if the bytes ever depend on the runtime's zlib again.
  test('golden bytes: the same pixels give the same PNG on every runtime', () => {
    expect(sha(encodePng(64, 48, fixture()))).toBe(
      'c2e54e69126b23d613feefadb407e744351d160dd4089b349df0bb58de1cbb6e',
    );
    expect(sha(encodePng(1, 1, Uint8Array.of(1, 2, 3, 4)))).toBe(
      '69bf296785d54e4ec117aea10eac3a7269fc6d9fba672dc6819bdbc7817e883c',
    );
  });
  test('round-trips through both PNG decoders in the repo', () => {
    const rgba = fixture();
    const png = encodePng(64, 48, rgba);
    const a = decodePng(png);
    expect([a.width, a.height]).toEqual([64, 48]);
    expect(same(a.data, rgba)).toBe(true);
    expect(same(readPng(png, 'fixture').data, rgba)).toBe(true);
  });
  test('the pixel data is one zlib stream of unfiltered rows (filter byte 0 per row)', () => {
    const raw = new Uint8Array(inflateSync(idat(encodePng(64, 48, fixture()))));
    expect(raw.length).toBe(48 * (64 * 4 + 1));
    for (let y = 0; y < 48; y++) expect(raw[y * 257]).toBe(0);
    expect(same(raw.subarray(1, 257), fixture().subarray(0, 256))).toBe(true);
  });
  test('1 × 1, and an image whose rows span many deflate blocks', () => {
    const one = decodePng(encodePng(1, 1, Uint8Array.of(1, 2, 3, 4)));
    expect([...one.data]).toEqual([1, 2, 3, 4]);
    const big = fixture(700, 300);
    expect(same(decodePng(encodePng(700, 300, big)).data, big)).toBe(true);
    expect(encodePng(700, 300, big).length).toBeLessThan(big.length / 3);
  });
});
