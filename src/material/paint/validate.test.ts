import { describe, expect, it } from 'bun:test';
import type { StripRecipe } from './types.ts';
import { validateStrip } from './validate.ts';

const base: StripRecipe = { kind: 'noise', scaleMetres: 1, roughness: 0.5 };
function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code ?? 'thrown';
  }
  return 'ok';
}

describe('validateStrip: weathering params', () => {
  it('rejects wear, age, wet and porosity outside 0..1 with a fix', () => {
    for (const k of ['wear', 'age', 'wet', 'porosity'])
      for (const v of [-0.1, 1.5, 10]) {
        expect(code(() => validateStrip('s', { ...base, params: { [k]: v } }))).toBe(
          'T3D_RECIPE_INVALID',
        );
      }
    let fix = '';
    try {
      validateStrip('s', { ...base, params: { age: 10 } });
    } catch (e) {
      fix = (e as { fix?: string }).fix ?? '';
    }
    expect(fix).toContain('0..1');
  });

  it('accepts them inside 0..1 and leaves painter params unbounded', () => {
    expect(
      code(() => validateStrip('s', { ...base, params: { age: 1, porosity: 0, wet: 0.5 } })),
    ).toBe('ok');
    expect(code(() => validateStrip('s', { ...base, params: { pitch: 4 } }))).toBe('ok');
  });
});
