// Fire escapes are seen from the street, from below. Failure first: the top and side rails were
// built without their bottom faces, so looking up between the corner posts showed open boxes.
import { describe, expect, it } from 'bun:test';
import type { Mesh } from '@developerz.ai/ts23d';
import { fireEscape } from './facade.ts';

/** Plan y extent covered by down-facing triangles lying at height z. */
function undersideSpan(m: Mesh, z: number): number {
  let [lo, hi] = [Infinity, -Infinity];
  const P = m.positions;
  for (let t = 0; t < m.indices.length; t += 3) {
    const ids = [m.indices[t] ?? 0, m.indices[t + 1] ?? 0, m.indices[t + 2] ?? 0];
    if (!ids.every((i) => Math.abs((P[i * 3 + 2] ?? 0) - z) < 1e-6)) continue;
    const [a, b, c] = ids.map((i) => [P[i * 3] ?? 0, P[i * 3 + 1] ?? 0] as const);
    const cross =
      ((b?.[0] ?? 0) - (a?.[0] ?? 0)) * ((c?.[1] ?? 0) - (a?.[1] ?? 0)) -
      ((b?.[1] ?? 0) - (a?.[1] ?? 0)) * ((c?.[0] ?? 0) - (a?.[0] ?? 0));
    if (cross >= 0) continue; // faces up
    for (const p of [a, b, c]) {
      lo = Math.min(lo, p?.[1] ?? 0);
      hi = Math.max(hi, p?.[1] ?? 0);
    }
  }
  return hi - lo;
}

describe('fire escape rails', () => {
  for (const lod of [0, 1, 2] as const)
    it(`LOD${lod}: the top rail is closed underneath along the whole platform`, () => {
      const [w, fh] = [3, 3.2];
      const m = fireEscape(w, 3, fh, lod);
      expect(undersideSpan(m, fh + 0.87)).toBeGreaterThan(w * 0.98);
    });
});
