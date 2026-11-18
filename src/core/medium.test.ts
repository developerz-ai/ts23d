// `medium` says what holds an asset up: it is checked at defineAsset and reaches the compiled asset
// only when the recipe declares it, so assets without one compile exactly as before.

import { describe, expect, test } from 'bun:test';
import { type AssetDefinition, compile, defineAsset, Ts23dError } from './index.ts';

const base: AssetDefinition = {
  name: 'medium_probe',
  kind: 'prop',
  budget: { triangles: [10, 10, 10] },
  build() {},
};

describe('asset medium', () => {
  test('an unknown medium is refused with a fix', () => {
    const bad = { ...base, medium: 'lava' } as unknown as AssetDefinition;
    expect(() => defineAsset(bad)).toThrow(Ts23dError);
    expect(() => defineAsset(bad)).toThrow(/medium 'lava'/);
  });

  test('a declared medium reaches the compiled asset', () => {
    expect(compile(defineAsset({ ...base, medium: 'water' })).medium).toBe('water');
  });

  test('no medium leaves no field', () => {
    expect('medium' in compile(defineAsset(base))).toBe(false);
  });
});
