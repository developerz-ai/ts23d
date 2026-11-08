import { expect, test } from 'bun:test';
import { sha256Hex } from './sha256.ts';

const ref = (b: Uint8Array): string => new Bun.CryptoHasher('sha256').update(b).digest('hex');

test('sha256 matches FIPS vectors and Bun across block boundaries', () => {
  expect(sha256Hex(new Uint8Array())).toBe(
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  );
  expect(sha256Hex(new TextEncoder().encode('abc'))).toBe(
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  for (const n of [55, 56, 63, 64, 65, 1000, 70001]) {
    const b = Uint8Array.from({ length: n }, (_, i) => (i * 131 + 7) & 255);
    expect(sha256Hex(b)).toBe(ref(b));
  }
});
