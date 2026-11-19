// Optics overrides: a malformed attenuation colour fails with a fix; a valid one becomes linear RGB.

import { describe, expect, it } from 'bun:test';
import { opticsOf } from './optics.ts';

describe('opticsOf: attenuation colour', () => {
  it('rejects a colour that is not three finite channels 0..1', () => {
    for (const attenuationColour of [[0.5], [0.5, 0.5, 0.5, 0.5], [0.5, Number.NaN, 0.5]])
      expect(() =>
        opticsOf('a', { ice: { attenuationColour: attenuationColour as never } }),
      ).toThrow(/attenuationColour/);
  });
  it('accepts linear RGB and sRGB hex', () => {
    expect(
      opticsOf('a', { ice: { attenuationColour: [0.1, 0.2, 0.3] } })?.ice?.attenuationColour,
    ).toEqual([0.1, 0.2, 0.3]);
    expect(
      opticsOf('a', { ice: { attenuationColour: '#ffffff' } })?.ice?.attenuationColour,
    ).toEqual([1, 1, 1]);
  });
});
