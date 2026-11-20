// Organic-mesh strip UVs. Failure first: the library's per-vertex projection crams metres of
// texture into the triangles that straddle an axis switch; per-face projection must not.

import { describe, expect, it } from 'bun:test';
import { type Mesh, sdf, stripRect } from '@developerz.ai/ts23d';
import { insetStripV, projectStripUV, STRIP_INSET } from './strip-inset.ts';

const STRIP = 'concrete';
const lumpy = (): Mesh =>
  sdf({
    field: (p) => Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]) - 2,
    bounds: [
      [-3, -3, -3],
      [3, 3, 3],
    ],
    resolution: 0.25,
    color: [1, 1, 1],
    strip: STRIP,
  });

/** Largest ratio of a triangle edge's U run (metres) to its 3D length. */
function worstStretch(m: Mesh): number {
  const r = stripRect(STRIP);
  const perMetre = (r.u1 - r.u0) / r.metres;
  let worst = 0;
  for (let t = 0; t < m.indices.length; t += 3)
    for (let k = 0; k < 3; k++) {
      const a = m.indices[t + k] ?? 0;
      const b = m.indices[t + ((k + 1) % 3)] ?? 0;
      const du = Math.abs((m.uvs[a * 2] ?? 0) - (m.uvs[b * 2] ?? 0)) / perMetre;
      const dx = (m.positions[a * 3] ?? 0) - (m.positions[b * 3] ?? 0);
      const dy = (m.positions[a * 3 + 1] ?? 0) - (m.positions[b * 3 + 1] ?? 0);
      const dz = (m.positions[a * 3 + 2] ?? 0) - (m.positions[b * 3 + 2] ?? 0);
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > 1e-6) worst = Math.max(worst, du / d);
    }
  return worst;
}

describe('projectStripUV', () => {
  it('the library mapping crams texture into axis-switch triangles (the defect)', () => {
    expect(worstStretch(lumpy())).toBeGreaterThan(3);
  });
  it('never runs U faster than the surface after per-face projection', () => {
    const m = projectStripUV(lumpy(), STRIP, 1);
    expect(worstStretch(m)).toBeLessThanOrEqual(1.0001);
    expect(m.indices.length).toBe(lumpy().indices.length);
  });
  it('magnifies U by `uScale` (big triangles keep square texels with a band as many times taller)', () => {
    const m = projectStripUV(lumpy(), STRIP, 4, 4);
    const w = worstStretch(m);
    expect(w).toBeLessThanOrEqual(0.2501);
    expect(w).toBeGreaterThan(0.2);
  });
});

describe('insetStripV', () => {
  it('keeps every V off the padded rows of the strip', () => {
    const r = stripRect(STRIP);
    const lo = Math.min(r.v0, r.v1);
    const h = Math.abs(r.v1 - r.v0);
    const raw = lumpy();
    const near = (m: Mesh): boolean => {
      for (let i = 1; i < m.uvs.length; i += 2) {
        const f = ((m.uvs[i] ?? 0) - lo) / h;
        if (f < STRIP_INSET - 1e-4 || f > 1 - STRIP_INSET + 1e-4) return true;
      }
      return false;
    };
    expect(near(raw)).toBe(true);
    expect(near(insetStripV(raw, STRIP))).toBe(false);
    expect(near(projectStripUV(raw, STRIP, 1))).toBe(false);
  });
});
