// Every hinged panel the open showcase bakes open swings back shut, never further past its stop.
// Failure first: the fuel door was baked open 85° and still swung another 85° the same way.

import { describe, expect, it } from 'bun:test';
import { compile, dmath } from '@developerz.ai/ts23d';
import { roadster_v10, roadster_v10_open } from './roadster_v10.ts';

describe('roadster_v10_open clips', () => {
  it('reverses every one-way hinge of the closed car (hood, doors, trunk, fuel door)', () => {
    const shut = compile(roadster_v10, { lod: 1 });
    const open = compile(roadster_v10_open, { lod: 1 });
    /** A part's one-way hinge (sway) motion, if it has one. */
    const hinge = (p: (typeof shut.parts)[number] | undefined) =>
      p?.motion?.kind === 'sway' && p.motion.oneWay ? p.motion : undefined;
    const hinged = shut.parts.filter((p) => hinge(p));
    expect(hinged.map((p) => p.name)).toContain('fuel_door');
    for (const s of hinged) {
      const a = hinge(s);
      const b = hinge(open.parts.find((p) => p.name === s.name));
      const [u, v] = [a?.axis ?? [0, 0, 0], b?.axis ?? [0, 0, 0]];
      // Same sector, travelled the other way: the axis flips...
      const sum = dmath.hypot(u[0] + v[0], u[1] + v[1], u[2] + v[2]);
      expect({ part: s.name, sum }).toEqual({ part: s.name, sum: expect.closeTo(0, 9) });
      // ...and no further than the sector it was baked open by.
      expect(b?.degrees ?? Infinity).toBeLessThanOrEqual(a?.degrees ?? 0);
    }
  }, 120_000);
});
