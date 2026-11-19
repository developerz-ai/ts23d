import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import { inflate } from '../neural/inflate.ts';
import { adler32, deflate } from './deflate.ts';
import { canonicalCodes, codeLengths } from './deflate-huffman.ts';

const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const same = (a: Uint8Array, b: Uint8Array): boolean => Buffer.from(a).equals(Buffer.from(b));

/** Fixed pseudo-random bytes (an LCG, not ctx.rng: the test must not move if the rng does). */
function noise(length: number, seed = 1): Uint8Array {
  let s = seed;
  return Uint8Array.from({ length }, () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s >>> 24;
  });
}

/** A picture-like buffer: flat background, soft discs, a dithered band. */
function picture(width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const d = Math.abs((x % 90) - 45) + Math.abs((y % 70) - 35);
      const px = d < 40 ? [90 + d, 80, 70 + ((x * y) & 7), 255] : [24, 26, 30, 255];
      out.set(
        y > height - 20 ? [(x * 7) & 255, (y * 13) & 255, (x ^ y) & 255, 255] : px,
        (y * width + x) * 4,
      );
    }
  return out;
}

const TEXT = new TextEncoder().encode('ts23d deterministic or broken. '.repeat(500));

const CASES: Readonly<Record<string, Uint8Array>> = {
  empty: new Uint8Array(),
  'one byte': Uint8Array.of(7),
  'two bytes': Uint8Array.of(7, 7),
  text: TEXT,
  'long run of zeros': new Uint8Array(300_000),
  'noise larger than two stored blocks': noise(150_000),
  'repeat exactly one window back': Uint8Array.from([...noise(32768, 3), ...noise(32768, 3)]),
  'repeat beyond the window': Uint8Array.from([...noise(40_000, 5), ...noise(40_000, 5)]),
  'picture, many blocks': picture(400, 300),
};

/** sha256 of the encoded stream. A change here changes every committed PNG and embedded sheet. */
const GOLDEN: Readonly<Record<string, string>> = {
  empty: 'aca503def43dc086a5aaa5c3d6f86bcbbc2aa6a80007ddea4a81bce2b376fceb',
  'one byte': '7bab40b0545897ad40082f5d8c07a3a080ce6be33accaf94daf7ba2036ca2a49',
  'two bytes': '06ab3fa9356b0c0938566df9a7324bdbcdd235e7e2e241bb067335d857311a44',
  text: '87ebfb37b388cbcc3ced60496ec876e416e12ee24835f2e4963bfd17a473b765',
  'long run of zeros': 'de15198c579bdce77533c8d26503eaa993a771d5774f1a4dc08db8c585254cfc',
  'noise larger than two stored blocks':
    '58faca58de02cdd06c8ea1b18244ffee2f1b6ee42b096b047b9407e38432d26f',
  'repeat exactly one window back':
    '1c31d71a622e6647e481a769d0bad6d0d2b533510c2580799fc43bfd30819d24',
  'repeat beyond the window': 'd089721ccef52a141c30833f152b3220613cba77db34cdc0d30194c5a2af155d',
  'picture, many blocks': '784ce1fa708ff8977dade391c26bc4326959b97e803b981d1c88d27de7261619',
};

describe('deflate (pure TypeScript zlib stream)', () => {
  test('golden bytes: the output is pinned, whatever zlib the runtime ships', () => {
    const got = Object.fromEntries(Object.entries(CASES).map(([k, v]) => [k, sha(deflate(v))]));
    expect(got).toEqual({ ...GOLDEN });
  });
  test('a flipped payload byte fails the Adler-32 check in the runtime inflater', () => {
    const z = deflate(TEXT);
    const bad = z.slice();
    bad[bad.length - 1] = (bad[bad.length - 1] ?? 0) ^ 1;
    expect(() => inflateSync(bad)).toThrow();
    expect(same(new Uint8Array(inflateSync(z)), TEXT)).toBe(true);
  });
  for (const [name, data] of Object.entries(CASES))
    test(`round-trips through node:zlib and the repo inflate: ${name}`, () => {
      const z = deflate(data);
      expect(z[0]).toBe(0x78);
      expect((((z[0] ?? 0) << 8) | (z[1] ?? 0)) % 31).toBe(0);
      expect(same(new Uint8Array(inflateSync(z)), data)).toBe(true);
      expect(same(inflate(z), data)).toBe(true);
    });
  test('it compresses: runs and repeats shrink, noise grows by block headers only', () => {
    const size = (name: string): number => deflate(CASES[name] ?? new Uint8Array()).length;
    expect(size('long run of zeros')).toBeLessThan(600);
    expect(size('text')).toBeLessThan(200);
    expect(size('repeat exactly one window back')).toBeLessThan(33_500);
    expect(size('picture, many blocks')).toBeLessThan(480_000 / 12);
    expect(size('noise larger than two stored blocks')).toBeLessThanOrEqual(150_000 + 6 + 5 * 12);
  });
  test('adler32 matches the published check values', () => {
    expect(adler32(new Uint8Array())).toBe(1);
    expect(adler32(new TextEncoder().encode('Wikipedia'))).toBe(0x11e60398);
    expect(adler32(new Uint8Array(1_000_000).fill(255))).toBe(
      new DataView(inflateTail(new Uint8Array(1_000_000).fill(255))).getUint32(0),
    );
  });
});

/** The four trailer bytes the runtime zlib writes for `data`: its Adler-32. */
function inflateTail(data: Uint8Array): ArrayBuffer {
  const z = new Uint8Array(deflateSync(data));
  return z.slice(z.length - 4).buffer;
}

describe('codeLengths', () => {
  const kraft = (lengths: Uint8Array, limit: number): number =>
    [...lengths].reduce((s, l) => s + (l > 0 ? 1 << (limit - l) : 0), 0);
  test('Fibonacci weights would need 20+ bits: lengths are capped and the code stays complete', () => {
    const freq = new Uint32Array(30);
    for (let i = 0, a = 1, b = 1; i < 30; i++) {
      freq[i] = a;
      [a, b] = [b, a + b];
    }
    for (const limit of [7, 15]) {
      const lengths = codeLengths(freq.subarray(0, limit === 7 ? 19 : 30), limit);
      expect(Math.max(...lengths)).toBe(limit);
      expect(kraft(lengths, limit)).toBe(1 << limit);
      // Heavier symbols never get longer codes.
      for (let i = 1; i < lengths.length; i++)
        expect(lengths[i] ?? 0).toBeLessThanOrEqual(lengths[i - 1] ?? 0);
    }
  });
  test('one used symbol, or none, still gives two 1-bit codes (a complete code)', () => {
    expect([...codeLengths(Uint32Array.of(0, 0, 9, 0), 15)]).toEqual([1, 0, 1, 0]);
    expect([...codeLengths(new Uint32Array(4), 15)]).toEqual([1, 1, 0, 0]);
  });
  test('uniform weights give a flat code; canonical codes are prefix-free and bit-reversed', () => {
    const lengths = codeLengths(new Uint32Array(8).fill(5), 15);
    expect([...lengths]).toEqual([3, 3, 3, 3, 3, 3, 3, 3]);
    expect([...canonicalCodes(lengths)]).toEqual([0, 4, 2, 6, 1, 5, 3, 7]);
    expect([...canonicalCodes(Uint8Array.of(2, 1, 3, 3))]).toEqual([0b01, 0b0, 0b011, 0b111]);
  });
});
