// Small-hole filling: boundary edges (used by one face) chained into loops; a loop of at most
// `maxEdges` is closed with a fan wound against its border faces, so the shell stays consistently
// oriented. Larger loops (a neck cut, an open sleeve) are left open and counted.

import { edgeFaces } from './import-topology.ts';

export function fillHoles(
  idx: Uint32Array,
  pt: Int32Array,
  maxEdges: number,
): { indices: Uint32Array; filled: number; open: number } {
  const span = pt.reduce((a, b) => Math.max(a, b), 0) + 1;
  const edges = edgeFaces(idx, pt);
  // Hole edge b → a for each border half-edge a → b; the vertex standing for each point.
  const next = new Map<number, number>();
  const vertexOf = new Map<number, number>();
  for (let f = 0; f < idx.length / 3; f++)
    for (let k = 0; k < 3; k++) {
      const va = idx[f * 3 + k] ?? 0;
      const vb = idx[f * 3 + ((k + 1) % 3)] ?? 0;
      const a = pt[va] ?? 0;
      const b = pt[vb] ?? 0;
      if (edges.get(Math.min(a, b) * span + Math.max(a, b))?.length !== 1) continue;
      if (!next.has(b)) next.set(b, a);
      if (!vertexOf.has(a)) vertexOf.set(a, va);
      if (!vertexOf.has(b)) vertexOf.set(b, vb);
    }
  const used = new Set<number>();
  const extra: number[] = [];
  let filled = 0;
  let open = 0;
  for (const start of [...next.keys()].sort((x, y) => x - y)) {
    if (used.has(start)) continue;
    const loop: number[] = [];
    let p: number | undefined = start;
    while (p !== undefined && !used.has(p)) {
      used.add(p);
      loop.push(p);
      p = next.get(p);
    }
    if (p !== start) {
      open++;
      continue;
    }
    if (loop.length < 3 || loop.length > maxEdges) {
      open++;
      continue;
    }
    const v = loop.map((q) => vertexOf.get(q) ?? 0);
    for (let i = 1; i + 1 < v.length; i++) extra.push(v[0] ?? 0, v[i] ?? 0, v[i + 1] ?? 0);
    filled++;
  }
  if (!extra.length) return { indices: idx, filled, open };
  const out = new Uint32Array(idx.length + extra.length);
  out.set(idx);
  out.set(extra, idx.length);
  return { indices: out, filled, open };
}
