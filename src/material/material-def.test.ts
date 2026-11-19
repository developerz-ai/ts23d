import { describe, expect, it } from 'bun:test';
import { toStripRecipe } from './material-def.ts';

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code ?? 'thrown';
  }
  return 'ok';
}

describe('toStripRecipe: weathering params', () => {
  it('rejects params.age / porosity / wear / wet outside 0..1, like the top-level dials', () => {
    for (const k of ['age', 'porosity', 'wear', 'wet'])
      expect(code(() => toStripRecipe({ id: 'test_w', roughness: 0.5, params: { [k]: 10 } }))).toBe(
        'T3D_MATERIAL_INVALID',
      );
    expect(() => toStripRecipe({ id: 'test_w', roughness: 0.5, params: { age: -1 } })).toThrow(
      /params\.age/,
    );
  });

  it('accepts them inside 0..1', () => {
    const r = toStripRecipe({ id: 'test_w', roughness: 0.5, params: { age: 1, porosity: 0.2 } });
    expect(r.params).toEqual({ age: 1, porosity: 0.2 });
  });
});
