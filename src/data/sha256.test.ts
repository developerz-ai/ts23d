import { describe, expect, test } from 'bun:test';
import { sha256, verifyPin } from './sha256.ts';

const te = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('sha256', () => {
  test('a mismatching pin refuses with T3D_DATA_HASH', () => {
    expect(() => verifyPin(te('abc'), '0'.repeat(64), 'test')).toThrow('T3D_DATA_HASH');
    expect(() =>
      verifyPin(te('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 't'),
    ).not.toThrow();
  });

  test('FIPS 180-4 vectors', () => {
    expect(sha256(te(''))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256(te('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  test('matches Bun at every padding boundary', () => {
    for (const n of [1, 55, 56, 63, 64, 65, 119, 1000, 70001]) {
      const b = Uint8Array.from({ length: n }, (_, i) => (i * 131 + 7) & 255);
      expect(sha256(b)).toBe(new Bun.CryptoHasher('sha256').update(b).digest('hex'));
    }
  });
});
