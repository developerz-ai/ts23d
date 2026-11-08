// Metal strips obey the PBR metalness rule: 0 or 1 per texel (raw metal 1, rust/oxide/paint 0),
// transitions only at pixel edges; roughness carries the variation. Checked with the same helper
// users run on their own sheets (`assertValueRange`).

import { describe, expect, it } from 'bun:test';
import { assertValueRange } from '../../testing/index.ts';
import { DEFAULT_SHEET, MATERIAL_LIBRARY, paintTrimSheet } from '../index.ts';

const METALS = Object.values(MATERIAL_LIBRARY)
  .filter((m) => m.kind === 'metal')
  .map((m) => m.id);

describe('metal strips: metalness is binary', () => {
  const sheet = paintTrimSheet({ ...DEFAULT_SHEET, size: 512 });
  const maps = { size: sheet.size, albedo: sheet.albedo, normal: sheet.normal, orm: sheet.orm };

  it('covers the iron strips the helper flagged', () => {
    expect(METALS).toContain('iron_cast');
    expect(METALS).toContain('iron_rust');
  });

  it('every metal strip has < 20 % half-metal texels', () => {
    expect(() => assertValueRange(maps, { strips: METALS })).not.toThrow();
  });

  it('across the whole sheet almost every metal texel is 0 or 255 (edges only)', () => {
    let mid = 0;
    for (let i = 2; i < sheet.orm.length; i += 4) {
      const v = sheet.orm[i] ?? 0;
      if (v > 25 && v < 230) mid++;
    }
    expect(mid / (sheet.orm.length / 4)).toBeLessThan(0.02);
  });
});
