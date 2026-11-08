import { describe, expect, test } from 'bun:test';
import { estimateSeconds, isHeavy, startLod } from './lod-policy.ts';

const light = { kind: 'vehicle', tags: ['tracked'], triangles: [72_360, 18_096, 3_410] };
const huge = { kind: 'vehicle', tags: ['car'], triangles: [904_486, 78_258, 5_616] };
const bust = { kind: 'character', tags: ['bust', 'sculpt'], triangles: [43_784, 8_426, 1_196] };

describe('lod policy', () => {
  test('a light asset opens at LOD0 and is not heavy', () => {
    expect(isHeavy(light)).toBe(false);
    expect(startLod(light)).toBe(0);
  });

  test('a near-million-triangle LOD0 opens at LOD1', () => {
    expect(startLod(huge)).toBe(1);
  });

  test('a sculpted character is heavy at few triangles; a sculpted prop is not', () => {
    expect(startLod(bust)).toBe(1);
    expect(isHeavy({ ...bust, kind: 'prop' })).toBe(false);
  });

  test('estimates: unknown without counts, longer at LOD0 than LOD1', () => {
    expect(estimateSeconds({ kind: 'prop', tags: [], triangles: [] }, 0)).toBeNull();
    const l0 = estimateSeconds(huge, 0) ?? 0;
    const l1 = estimateSeconds(huge, 1) ?? 0;
    expect(l0).toBeGreaterThan(l1);
    expect(estimateSeconds(bust, 0) ?? 0).toBeGreaterThan(20);
  });
});
