import { afterAll, describe, expect, it } from 'bun:test';
import { defineMaterial, resetMaterials } from './define.ts';
import { DEFAULT_SHEET } from './generator.ts';
import { liveSheet } from './live-sheet.ts';
import { stripRect } from './trim-sheet.ts';

const SIZE = 512;
const roughnessAt = (orm: Uint8Array, id: Parameters<typeof stripRect>[0]): number => {
  const r = stripRect(id);
  const y = Math.round(((r.v0 + r.v1) / 2) * SIZE);
  return orm[(y * SIZE + 40) * 4 + 1] ?? -1;
};

resetMaterials();
afterAll(resetMaterials);

describe('liveSheet (D47)', () => {
  it('repaints when a material is defined after the first paint', () => {
    const live = liveSheet({ ...DEFAULT_SHEET, size: SIZE });
    const first = live.current();
    expect(first.repainted).toBe(true);
    expect(live.current().repainted).toBe(false);
    const late = defineMaterial({ id: 'test_late_matte', roughness: 0.95 });
    const second = live.current();
    expect(second.repainted).toBe(true);
    expect(second.sheet).not.toBe(first.sheet);
    expect(Math.abs(roughnessAt(second.sheet.orm, late) - 0.95 * 255)).toBeLessThan(25);
  });
});
