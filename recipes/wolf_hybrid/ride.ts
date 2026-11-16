// Pieces that ride the moved skin rather than wrapping onto the model: fur cards (each vertex
// moves as the closest point of the solid coat moved, and takes the model's colour there) and
// loose pieces inside a part (teeth move with their closest skin vertex).

import { type Mesh, triBvh, type Vec3, warpMesh } from '@developerz.ai/ts23d';
import type { Hybrid } from './blend.ts';

/** Loose pieces (teeth) move as their closest main-shell vertex moved: a fang stays behind the
 *  lip the model pulled in. */
export function ride(P: Float32Array, disp: Float32Array, onShell: (v: number) => boolean): void {
  const n = P.length / 3;
  const shell: number[] = [];
  const riders: number[] = [];
  for (let v = 0; v < n; v++) (onShell(v) ? shell : riders).push(v);
  for (const v of riders) {
    let best = -1;
    let bd = Infinity;
    for (const s of shell) {
      const d =
        ((P[s * 3] ?? 0) - (P[v * 3] ?? 0)) ** 2 +
        ((P[s * 3 + 1] ?? 0) - (P[v * 3 + 1] ?? 0)) ** 2 +
        ((P[s * 3 + 2] ?? 0) - (P[v * 3 + 2] ?? 0)) ** 2;
      if (d < bd) [bd, best] = [d, s];
    }
    if (best >= 0) for (let a = 0; a < 3; a++) disp[v * 3 + a] = disp[best * 3 + a] ?? 0;
  }
}

/** A card part riding the skin: each vertex moves as the closest point of the solid coat
 *  (`before` → `after`, same topology, world) moved, and takes the model's colour there (a card
 *  stands off the skin, past the texture gate). */
export function hybridCards(mesh: Mesh, at: Vec3, before: Mesh, after: Mesh, h: Hybrid): Mesh {
  const bvh = triBvh(before);
  const B = before.positions;
  const A = after.positions;
  const I = before.indices;
  const P = mesh.positions;
  const C = mesh.colors;
  const q: [number, number, number] = [0, 0, 0];
  const disp = new Float32Array(P.length);
  const colors = new Float32Array(C.length);
  for (let v = 0; v < P.length / 3; v++) {
    const w: Vec3 = [
      (P[v * 3] ?? 0) + at[0],
      (P[v * 3 + 1] ?? 0) + at[1],
      (P[v * 3 + 2] ?? 0) + at[2],
    ];
    const t = bvh.nearestTriangle(w);
    const d: [number, number, number] = [0, 0, 0];
    if (t >= 0) {
      bvh.closest(w, q);
      // Inverse-distance weights over the triangle's corners (smooth enough at card scale).
      let ws = 0;
      for (const c of [I[t * 3] ?? 0, I[t * 3 + 1] ?? 0, I[t * 3 + 2] ?? 0]) {
        const e = Math.hypot(
          (B[c * 3] ?? 0) - q[0],
          (B[c * 3 + 1] ?? 0) - q[1],
          (B[c * 3 + 2] ?? 0) - q[2],
        );
        const k = 1 / (e + 1e-5);
        ws += k;
        for (let a = 0; a < 3; a++)
          d[a] = (d[a] ?? 0) + k * ((A[c * 3 + a] ?? 0) - (B[c * 3 + a] ?? 0));
      }
      for (let a = 0; a < 3; a++) d[a] = (d[a] ?? 0) / ws;
    }
    disp.set(d, v * 3);
    const s = h.colour([q[0] + d[0], q[1] + d[1], q[2] + d[2]]);
    for (let a = 0; a < 3; a++) {
      const c = C[v * 3 + a] ?? 0;
      colors[v * 3 + a] = Math.max(0, Math.min(1, c + ((s.c[a] ?? 0) - c) * s.w));
    }
  }
  const moved = warpMesh(mesh, (_, v) => [
    disp[v * 3] ?? 0,
    disp[v * 3 + 1] ?? 0,
    disp[v * 3 + 2] ?? 0,
  ]);
  return { ...moved, colors };
}
