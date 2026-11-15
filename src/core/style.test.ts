import { describe, expect, it } from 'bun:test';
import { defineStyle } from './style.ts';

const palette = { primary: '#84402d', metal: '#5a5f63' };

describe('defineStyle', () => {
  it('refuses a palette colour that is not #rrggbb', () => {
    expect(() => defineStyle({ name: 'rts', palette: { primary: 'red' } })).toThrow(
      /T3D_RECIPE_INVALID: style 'rts': palette 'primary' is 'red'/,
    );
  });

  it('refuses an empty palette and inverted ranges', () => {
    expect(() => defineStyle({ name: 'rts', palette: {} })).toThrow(/palette is empty/);
    expect(() => defineStyle({ name: 'rts', palette, wear: [0.5, 0.1] })).toThrow(/wear/);
    expect(() => defineStyle({ name: 'rts', palette, bevel: [0, 0.02] })).toThrow(/bevel/);
  });

  it('refuses a non snake_case name', () => {
    expect(() => defineStyle({ name: 'My Style', palette })).toThrow(/snake_case/);
  });

  it('fills defaults on a valid style', () => {
    const s = defineStyle({ name: 'bestiary', palette, texelDensity: 512, wear: [0.05, 0.3] });
    expect(s.paletteDeltaE).toBe(12);
    expect(s.outlierZ).toBe(3.5);
    expect(s.__ts23d).toBe('style');
  });
});
