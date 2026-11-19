import { afterAll, describe, expect, it } from 'bun:test';
import { defineMaterial, resetMaterials } from './define.ts';
import { DEFAULT_SHEET } from './generator.ts';
import { checkSheetFor, liveSheet } from './live-sheet.ts';
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

  it('fails: a sheet painted before compile refuses an asset that maps into a later strip', () => {
    const live = liveSheet({ ...DEFAULT_SHEET, size: SIZE });
    const early = live.current().sheet;
    // As a recipe does in build(): the fur card strip appears while the asset compiles.
    const late = defineMaterial({ id: 'test_late_strip', roughness: 0.6 });
    const r = stripRect(late);
    const uvs = new Float32Array([0.2, (r.v0 + r.v1) / 2]);
    expect(() => checkSheetFor(early, uvs)).toThrow(/painted before material 'test_late_strip'/);
    // The repainted sheet holds the row; an asset outside it never cared.
    expect(() => checkSheetFor(live.current().sheet, uvs)).not.toThrow();
    const plain = stripRect('plain');
    expect(() => checkSheetFor(early, [0.2, (plain.v0 + plain.v1) / 2])).not.toThrow();
  });

  it('accepts a box on the row below a later strip: its top edge is not that strip', () => {
    const live = liveSheet({ ...DEFAULT_SHEET, size: SIZE });
    const early = live.current().sheet;
    const r = stripRect(defineMaterial({ id: 'test_late_edge', roughness: 0.6 }));
    const h = r.v1 - r.v0;
    // V = r.v0 is the lower row's v1 (box, loft, sweep and prism all put vertices there).
    expect(() => checkSheetFor(early, [0, r.v0 - h, 1, r.v0])).not.toThrow();
    expect(() =>
      checkSheetFor(early, [0, r.v0 - h, 1, r.v0 - h, 1, r.v0], [0, 1, 2]),
    ).not.toThrow();
    expect(() => checkSheetFor(early, [0, r.v0, 1, r.v1])).toThrow('T3D_MATERIAL_UNKNOWN');
    expect(() => checkSheetFor(early, [0, r.v0, 1, r.v0, 1, r.v1], [0, 1, 2])).toThrow(
      'T3D_MATERIAL_UNKNOWN',
    );
  });
});
