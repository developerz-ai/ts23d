// Clean trim-sheet UVs for organic meshes (SDF rocks, lumps). Two library behaviours draw stacked
// contour rings on them, and both are fixed here per mesh:
// 1. `sdf` projects each VERTEX onto the plane of its normal's dominant axis. A triangle whose
//    corners chose different axes interpolates between (x, y) and (y, z) coordinates metres apart,
//    so the strip's pattern is crammed into it as a stack of thin lines; on a bumpy surface those
//    triangles follow the axis switches round every bump (the concentric polygon rings).
//    `projectStripUV` projects per FACE instead, splitting the corners where the axis switches
//    (same positions and normals, so the shading stays smooth).
// 2. The sheet painter pads every strip row by copying its edge texels 1/8 of the row deep
//    (paint/compose.ts), so those texels are constant along V and the half-texel inset of the
//    mirrored-V primitives samples streaks. V is squeezed into the painted interior.

import type { Mesh, StripId } from '@developerz.ai/ts23d';
import { stripRect } from '@developerz.ai/ts23d';

/** Fraction of the row kept off each edge: the 1/8 pad plus one texel at the 2048 sheet. */
export const STRIP_INSET = 1 / 8 + 1 / 32;

/** V on `rect` for a fraction 0..1 of one band, inside the unpadded interior. */
const insetV = (v0: number, v1: number, f: number): number =>
  v0 + (v1 - v0) * (STRIP_INSET + f * (1 - 2 * STRIP_INSET));

/** `m` with the V of every vertex on `strip`'s row squeezed into the unpadded interior. */
export function insetStripV(m: Mesh, strip: StripId): Mesh {
  const r = stripRect(strip);
  const lo = Math.min(r.v0, r.v1);
  const hi = Math.max(r.v0, r.v1);
  const uvs = new Float32Array(m.uvs);
  for (let i = 1; i < uvs.length; i += 2) {
    const v = uvs[i] ?? 0;
    if (v < lo || v > hi) continue;
    uvs[i] = insetV(lo, hi, (v - lo) / (hi - lo));
  }
  return { ...m, uvs };
}

/** Dominant axis of a normal: 2 = Z (project x, y), 0 = X (project y, z), 1 = Y (project x, z). */
const axisOf = (x: number, y: number, z: number): 0 | 1 | 2 => {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const az = Math.abs(z);
  return az >= ax && az >= ay ? 2 : ax >= ay ? 0 : 1;
};

/**
 * Re-map every vertex of `m` onto `strip` by planar projection along each FACE's dominant axis:
 * U at true metres (repeating), V mirrored every `vMetres` band and kept off the padded rows.
 * Corners shared by faces of different axes are split; nothing else changes.
 * V is set per vertex, so a triangle taller than one band interpolates across it (the pattern
 * stretched into streaks): keep triangles under `vMetres`, or magnify the strip by `uScale`
 * (U at `uScale`× the strip's metres) with a band `uScale`× as tall, so the texels stay square.
 */
export function projectStripUV(m: Mesh, strip: StripId, vMetres: number, uScale = 1): Mesh {
  const r = stripRect(strip);
  const lo = Math.min(r.v0, r.v1);
  const hi = Math.max(r.v0, r.v1);
  const p = m.positions;
  const nVert = p.length / 3;
  // One copy of a vertex per projection axis it is used with.
  const copy = new Int32Array(nVert * 3).fill(-1);
  const src: number[] = [];
  const axes: number[] = [];
  const idx = new Uint32Array(m.indices.length);
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = m.indices[t] ?? 0;
    const b = m.indices[t + 1] ?? 0;
    const c = m.indices[t + 2] ?? 0;
    const e1 = [0, 1, 2].map((k) => (p[b * 3 + k] ?? 0) - (p[a * 3 + k] ?? 0));
    const e2 = [0, 1, 2].map((k) => (p[c * 3 + k] ?? 0) - (p[a * 3 + k] ?? 0));
    const ax = axisOf(
      (e1[1] ?? 0) * (e2[2] ?? 0) - (e1[2] ?? 0) * (e2[1] ?? 0),
      (e1[2] ?? 0) * (e2[0] ?? 0) - (e1[0] ?? 0) * (e2[2] ?? 0),
      (e1[0] ?? 0) * (e2[1] ?? 0) - (e1[1] ?? 0) * (e2[0] ?? 0),
    );
    [a, b, c].forEach((v, k) => {
      const key = v * 3 + ax;
      let out = copy[key] ?? -1;
      if (out < 0) {
        out = src.length;
        copy[key] = out;
        src.push(v);
        axes.push(ax);
      }
      idx[t + k] = out;
    });
  }
  const n = src.length;
  const positions = new Float32Array(n * 3);
  const normals = new Float32Array(n * 3);
  const cw = m.colors.length / nVert;
  const colors = new Float32Array(n * cw);
  const uvs = new Float32Array(n * 2);
  src.forEach((v, i) => {
    for (let k = 0; k < 3; k++) {
      positions[i * 3 + k] = p[v * 3 + k] ?? 0;
      normals[i * 3 + k] = m.normals[v * 3 + k] ?? 0;
    }
    for (let k = 0; k < cw; k++) colors[i * cw + k] = m.colors[v * cw + k] ?? 0;
    const x = p[v * 3] ?? 0;
    const y = p[v * 3 + 1] ?? 0;
    const z = p[v * 3 + 2] ?? 0;
    const ax = axes[i];
    const [s, t] = ax === 2 ? [x, y] : ax === 0 ? [y, z] : [x, z];
    const band = t / vMetres;
    const f = band - 2 * Math.floor(band / 2);
    uvs[i * 2] = r.u0 + (s / (r.metres * uScale)) * (r.u1 - r.u0);
    uvs[i * 2 + 1] = insetV(lo, hi, f <= 1 ? f : 2 - f);
  });
  return { ...m, positions, normals, colors, uvs, indices: idx };
}
