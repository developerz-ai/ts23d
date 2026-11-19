// fins.ts: the LOD0 ray ridges shade as ridges. Every vertex normal on a ridged fin face agrees
// with the faces around it to within 2° (failure first: the ridges moved the vertices and kept the smooth
// plate's normals, so the lighting showed a flat fin).

import { describe, expect, it } from 'bun:test';
import type { Mesh } from '@developerz.ai/ts23d';
import { anal, dorsal2, upperLobe } from './fins.ts';

/** The worst agreement (dot) between a vertex normal and the mean of its faces' normals,
 *  over vertices off the two sharp edges (where the normal lies in the plate on purpose). */
function worstAgreement(m: Mesh): number {
  const P = m.positions;
  const N = m.normals;
  const acc = new Float64Array(P.length);
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [m.indices[t] ?? 0, m.indices[t + 1] ?? 0, m.indices[t + 2] ?? 0];
    const u = [0, 1, 2].map((k) => (P[b * 3 + k] ?? 0) - (P[a * 3 + k] ?? 0));
    const v = [0, 1, 2].map((k) => (P[c * 3 + k] ?? 0) - (P[a * 3 + k] ?? 0));
    const f = [
      (u[1] ?? 0) * (v[2] ?? 0) - (u[2] ?? 0) * (v[1] ?? 0),
      (u[2] ?? 0) * (v[0] ?? 0) - (u[0] ?? 0) * (v[2] ?? 0),
      (u[0] ?? 0) * (v[1] ?? 0) - (u[1] ?? 0) * (v[0] ?? 0),
    ];
    for (const w of [a, b, c])
      for (let k = 0; k < 3; k++) acc[w * 3 + k] = (acc[w * 3 + k] ?? 0) + (f[k] ?? 0);
  }
  let worst = 1;
  for (let w = 0; w < P.length / 3; w++) {
    const n = [N[w * 3] ?? 0, N[w * 3 + 1] ?? 0, N[w * 3 + 2] ?? 0];
    // Faces only: the fin's sharp edges carry an in-plane normal (|n.y| ~ 0) by design.
    if (Math.abs(n[1] ?? 0) < 0.5) continue;
    const g = [acc[w * 3] ?? 0, acc[w * 3 + 1] ?? 0, acc[w * 3 + 2] ?? 0];
    const l = Math.hypot(g[0] ?? 0, g[1] ?? 0, g[2] ?? 0);
    if (l === 0) continue;
    worst = Math.min(
      worst,
      ((n[0] ?? 0) * (g[0] ?? 0) + (n[1] ?? 0) * (g[1] ?? 0) + (n[2] ?? 0) * (g[2] ?? 0)) / l,
    );
  }
  return worst;
}

describe('ray ridges', () => {
  it('give the LOD0 fins normals that follow the ridged faces', () => {
    for (const fin of [dorsal2(0), anal(0), upperLobe(0)])
      expect(worstAgreement(fin)).toBeGreaterThan(0.9994);
  });

  it('the check fails on a ridged fin carrying flat-plate normals', () => {
    const fin = dorsal2(0);
    const flat = { ...fin, normals: fin.normals.map((v, i) => (i % 3 === 1 ? Math.sign(v) : 0)) };
    expect(worstAgreement(flat)).toBeLessThan(0.9994);
  });
});
