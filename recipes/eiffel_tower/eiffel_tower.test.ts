// The far LOD stays a see-through lattice: the legs and shaft are cutout parts mapped onto the
// lattice strip, and the strip's painted coverage really has holes. Failure first: LOD2 drew the
// four legs as solid opaque frustums, a value and density pop at the switch.

import { describe, expect, it } from 'bun:test';
import { compile, stripRect } from '@developerz.ai/ts23d';
import { eiffel_tower } from './eiffel_tower.ts';
import { FAR_LATTICE, lattice } from './far.ts';

describe('eiffel_tower far lattice', () => {
  const far = compile(eiffel_tower, { lod: 2 });
  const legs = far.parts.filter((p) => /^leg_\d$/.test(p.name));

  it('draws every far leg as a cutout part on the lattice strip', () => {
    expect(legs.length).toBe(4);
    const r = stripRect(FAR_LATTICE);
    for (const leg of legs) {
      expect(leg.surface).toBe('cutout');
      const uv = leg.mesh?.uvs ?? new Float32Array();
      for (let i = 1; i < uv.length; i += 2) {
        expect(uv[i] ?? 0).toBeGreaterThanOrEqual(r.v0);
        expect(uv[i] ?? 0).toBeLessThanOrEqual(r.v1);
      }
    }
  });

  it('paints a lattice with holes: about half the panel open, its quarter points clear', () => {
    let on = 0;
    const n = 64;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) on += lattice((i + 0.5) / n, (j + 0.5) / n, 1 / n, 1 / n);
    const cover = on / (n * n);
    expect(cover).toBeGreaterThan(0.3);
    expect(cover).toBeLessThan(0.7);
    // Between the cross and the frame: open, so the sky shows through.
    expect(lattice(0.5, 0.2, 1 / n, 1 / n)).toBe(0);
    // On a corner post and on the cross: solid.
    expect(lattice(0.02, 0.5, 1 / n, 1 / n)).toBe(1);
    expect(lattice(0.5, 0.5, 1 / n, 1 / n)).toBe(1);
  });
});
