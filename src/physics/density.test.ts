// Density table: every built-in strip (classic, library, nature) has a sourced density, and the
// UV → strip lookup files a nature strip's triangles under that strip.

import { describe, expect, it } from 'bun:test';
import { NATURE_STRIPS, STRIPS, stripRect } from '../material/index.ts';
import { DENSITY, densityOf, materialAtV } from './density.ts';

describe('DENSITY', () => {
  it('falls back to water for an unknown strip, and an override wins', () => {
    expect(densityOf('no_such_strip')).toBe(1000);
    expect(densityOf('sand', { sand: 1900 })).toBe(1900);
  });

  it('covers every built-in strip with a positive density', () => {
    const missing = STRIPS.filter((id) => !(DENSITY[id] && (DENSITY[id] ?? 0) > 0));
    expect(missing).toEqual([]);
  });

  it('nature strips carry their bulk densities (kg/m³)', () => {
    const want: Record<string, number> = {
      sand: 1600,
      soil: 1300,
      gravel: 1700,
      mud: 1700,
      rock_strata: 2300,
      cliff: 2700,
      moss: 400,
      grass: 300,
      snow: 300,
      ice: 917,
      bark_oak: 500,
      bark_pine: 500,
      bark_birch: 500,
      leaf_litter: 100,
      cobblestone: 2600,
      asphalt: 2300,
      water: 1000,
      lava: 2800,
    };
    for (const id of NATURE_STRIPS) expect([id, densityOf(id)]).toEqual([id, want[id] ?? -1]);
  });

  it('a triangle on a nature strip is weighed as that strip', () => {
    for (const id of ['snow', 'lava', 'bark_pine'] as const) {
      const r = stripRect(id);
      expect(materialAtV((r.v0 + r.v1) / 2)).toBe(id);
    }
  });
});
