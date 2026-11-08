// Mesh soundness for the parts kit: closed (every edge walked both ways), wound with its normals,
// outward (positive signed volume), finite, colours in [0, 1]. Returns problems in words.

import type { Mesh } from '../src/index.ts';
import { openEdges, windingFlips } from '../src/primitives/closed.ts';

/** Signed volume (divergence theorem): > 0 for a closed, outward-wound surface. */
export function signedVolume(m: Mesh): number {
  const P = m.positions;
  let v = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => (m.indices[t + k] ?? 0) * 3) as [number, number, number];
    const ax = P[a] ?? 0;
    const ay = P[a + 1] ?? 0;
    const az = P[a + 2] ?? 0;
    const bx = P[b] ?? 0;
    const by = P[b + 1] ?? 0;
    const bz = P[b + 2] ?? 0;
    const cx = P[c] ?? 0;
    const cy = P[c + 1] ?? 0;
    const cz = P[c + 2] ?? 0;
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return v / 6;
}

/** What is wrong with one mesh, in words; [] = sound. */
export function meshProblems(m: Mesh): string[] {
  const out: string[] = [];
  if (![m.positions, m.normals, m.uvs, m.colors].every((a) => a.every(Number.isFinite)))
    out.push('NaN/Infinity in vertex data');
  if (m.colors.some((c) => c < 0 || c > 1)) out.push('vertex colour outside [0, 1]');
  const open = openEdges(m);
  if (open) out.push(`${open} open edges`);
  const flips = windingFlips(m);
  if (flips) out.push(`${flips} triangles wound against their normals`);
  if (!(signedVolume(m) > 0)) out.push(`inside-out (volume ${signedVolume(m).toExponential(2)})`);
  return out;
}
