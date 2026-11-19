// The cask's iron hoops sit on the staves the lathe actually emits, at every LOD. Failure first:
// a hoop sized from the smooth bilge curve floats off a coarse three-row LOD2 body.

import { describe, expect, it } from 'bun:test';
import { createRng, hex, type Mesh } from '@developerz.ai/ts23d';
import { caskMesh } from './props.ts';

const R = 0.24; // head radius
const HOOP = hex('#c9c3bb');

/** Per hoop vertex: its radius minus the body's outer radius at the same angle and height. */
function hoopStandOff(m: Mesh): number[] {
  const n = m.positions.length / 3;
  const at = (i: number) => {
    const x = m.positions[i * 3] ?? 0;
    const y = m.positions[i * 3 + 1] ?? 0;
    return { a: Math.atan2(y, x), r: Math.hypot(x, y), z: m.positions[i * 3 + 2] ?? 0 };
  };
  const isHoop = (i: number) =>
    [0, 1, 2].every((c) => Math.abs((m.colors[i * 3 + c] ?? 0) - (HOOP[c] ?? 0)) < 1e-4);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!isHoop(i)) continue;
    const h = at(i);
    // The body's side on this angle: outermost radius per height, linearly interpolated.
    const side = new Map<number, number>();
    for (let j = 0; j < n; j++) {
      if (isHoop(j)) continue;
      const b = at(j);
      // The side never comes inside the head radius (R); the chime and head rings do.
      if (b.r < R - 1e-3 || Math.abs(Math.sin(b.a - h.a)) > 1e-3 || Math.cos(b.a - h.a) < 0)
        continue;
      const z = Math.round(b.z * 1e5) / 1e5;
      side.set(z, Math.max(side.get(z) ?? 0, b.r));
    }
    const zs = [...side.keys()].sort((p, q) => p - q);
    const k = zs.findIndex((z) => z >= h.z);
    const z1 = zs[k] ?? 0;
    const z0 = zs[Math.max(0, k - 1)] ?? z1;
    const t = z1 === z0 ? 0 : (h.z - z0) / (z1 - z0);
    const body = (side.get(z0) ?? 0) * (1 - t) + (side.get(z1) ?? 0) * t;
    out.push(h.r - body);
  }
  return out;
}

describe('caskMesh hoops', () => {
  for (const lod of [0, 1, 2] as const)
    it(`LOD${lod}: every hoop vertex hugs the emitted staves (within 6 mm out, 4 mm in)`, () => {
      const d = hoopStandOff(caskMesh(lod, 0.8, R, 0.285, createRng(1)));
      expect(d.length).toBeGreaterThan(0);
      expect(Math.max(...d)).toBeLessThan(0.006);
      expect(Math.min(...d)).toBeGreaterThan(-0.004);
    });
});
