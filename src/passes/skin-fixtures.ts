// Test fixtures for the skin passes: a closed tube with many rings (bends smoothly under two bones)
// and the signed volume of a closed mesh. Not exported publicly.

import type { Mesh } from '../core/index.ts';

/** A closed tube along +X, `rings` rings of `seg` vertices, fan caps. */
export function tube(length: number, radius: number, rings = 41, seg = 16): Mesh {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let r = 0; r < rings; r++)
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      pos.push((r / (rings - 1)) * length, Math.cos(a) * radius, Math.sin(a) * radius);
    }
  for (let r = 0; r + 1 < rings; r++)
    for (let s = 0; s < seg; s++) {
      const a = r * seg + s;
      const b = r * seg + ((s + 1) % seg);
      idx.push(a, b + seg, b, a, a + seg, b + seg);
    }
  const c0 = pos.length / 3;
  pos.push(0, 0, 0, length, 0, 0);
  for (let s = 0; s < seg; s++) {
    const n = (s + 1) % seg;
    idx.push(c0, s, n, c0 + 1, (rings - 1) * seg + n, (rings - 1) * seg + s);
  }
  const v = pos.length / 3;
  return {
    positions: new Float32Array(pos),
    normals: new Float32Array(v * 3),
    uvs: new Float32Array(v * 2),
    colors: new Float32Array(v * 3).fill(0.5),
    indices: new Uint32Array(idx),
  };
}

export const volume = (p: Float32Array, idx: Uint32Array): number => {
  let s = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t] ?? 0, idx[t + 1] ?? 0, idx[t + 2] ?? 0].map((i) => i * 3) as [
      number,
      number,
      number,
    ];
    const ax = p[a] ?? 0;
    const ay = p[a + 1] ?? 0;
    const az = p[a + 2] ?? 0;
    const bx = p[b] ?? 0;
    const by = p[b + 1] ?? 0;
    const bz = p[b + 2] ?? 0;
    const cx = p[c] ?? 0;
    const cy = p[c + 1] ?? 0;
    const cz = p[c + 2] ?? 0;
    s += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return s / 6;
};

/** A unit-radius UV sphere (poles duplicated per segment; fine for per-vertex maths). */
export function ball(rings = 12, seg = 16): Mesh {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let r = 0; r <= rings; r++)
    for (let s = 0; s <= seg; s++) {
      const th = (r / rings) * Math.PI;
      const ph = (s / seg) * Math.PI * 2;
      pos.push(Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th));
    }
  for (let r = 0; r < rings; r++)
    for (let s = 0; s < seg; s++) {
      const a = r * (seg + 1) + s;
      idx.push(a, a + seg + 1, a + 1, a + 1, a + seg + 1, a + seg + 2);
    }
  const v = pos.length / 3;
  return {
    positions: new Float32Array(pos),
    normals: new Float32Array(pos),
    uvs: new Float32Array(v * 2),
    colors: new Float32Array(v * 3).fill(0.5),
    indices: new Uint32Array(idx),
  };
}
