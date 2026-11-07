import { beforeAll, describe, expect, it } from 'bun:test';
import { DEFAULT_SHEET, type PaintedSheet, paintTrimSheet } from './generator.ts';
import { MATERIAL_LIBRARY } from './library.ts';
import { toStripRecipe } from './material-def.ts';
import { MATERIAL_STRIPS, type MaterialStripId, stripRect } from './trim-sheet.ts';

const SIZE = 512;
let sheet: PaintedSheet;
beforeAll(() => {
  sheet = paintTrimSheet({ ...DEFAULT_SHEET, size: SIZE });
});

/** Mean of channel k of a map over a strip's rows. */
function mean(map: 'albedo' | 'orm', id: MaterialStripId, k: number): number {
  const r = stripRect(id);
  let s = 0;
  let n = 0;
  for (let y = Math.ceil(r.v0 * SIZE) + 2; y < Math.floor(r.v1 * SIZE) - 2; y++)
    for (let x = 0; x < SIZE; x += 3) {
      s += sheet[map][(y * SIZE + x) * 4 + k] ?? 0;
      n++;
    }
  return s / n / 255;
}

describe('material library', () => {
  it('every entry validates and is laid out (a missing or invalid one fails here)', () => {
    expect(Object.keys(MATERIAL_LIBRARY).sort()).toEqual([...MATERIAL_STRIPS].sort());
    for (const d of Object.values(MATERIAL_LIBRARY)) {
      expect(() => toStripRecipe(d)).not.toThrow();
      expect(d.sources?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('bare metals are metallic, woods and soft goods are not', () => {
    for (const id of ['chrome', 'brass', 'copper', 'aluminium', 'steel_galvanised'] as const)
      expect(mean('orm', id, 2)).toBeGreaterThan(0.75);
    for (const id of [
      'oak',
      'pine',
      'wood_weathered',
      'wood_painted',
      'rubber',
      'canvas',
      'leather',
    ] as const)
      expect(mean('orm', id, 2)).toBeLessThan(0.05);
    // Paint and oxide are dielectric films over metal.
    expect(mean('orm', 'steel_painted', 2)).toBeLessThan(0.3);
    expect(mean('orm', 'iron_rust', 2)).toBeLessThan(mean('orm', 'iron_cast', 2) + 0.2);
  });

  it('roughness spans mirror to matte in the right order', () => {
    const g = (id: MaterialStripId): number => mean('orm', id, 1);
    expect(g('chrome')).toBeLessThan(0.15);
    expect(g('chrome')).toBeLessThan(g('brass'));
    expect(g('brass')).toBeLessThan(g('oak'));
    expect(g('oak')).toBeLessThan(g('wood_weathered'));
    expect(g('plastic')).toBeLessThan(g('rubber'));
  });

  it('carries intrinsic colour: brass is warm, galvanised neutral, rubber dark', () => {
    const rgb = (id: MaterialStripId): number[] => [0, 1, 2].map((k) => mean('albedo', id, k));
    const [br, , bb] = rgb('brass');
    expect((br ?? 0) - (bb ?? 0)).toBeGreaterThan(0.2);
    const [gr, , gb] = rgb('steel_galvanised');
    expect(Math.abs((gr ?? 0) - (gb ?? 0))).toBeLessThan(0.06);
    expect(rgb('rubber')[0]).toBeLessThan(0.25);
    expect(rgb('oak')[0]).toBeGreaterThan(rgb('oak')[2] ?? 1);
  });
});
