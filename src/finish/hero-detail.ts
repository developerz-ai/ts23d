// The trim strip's own surface on top of the hero bake: a hero part leaves the trim sheet for its
// atlas, so the strip's micro-normal (fur strands, pores, grain) would be lost. Per texel of the
// part: sample the sheet's normal at the texel's trim UV, carry it to world through the trim UV's
// tangent frame, re-express it in the atlas tangent frame and blend it onto the baked field normal
// (whiteout: xy add, z multiply). The field gives the form and relief, the strip the fine grain.
// With a baked source colour, the texel's base becomes that colour × the strip's albedo (texel
// resolution instead of the mesh's vertex colour). Deterministic: bake-texels' fixed walk.

import { tangentsOf } from '../export/index.ts';
import type { PaintedSheet } from '../material/index.ts';
import { walkTexels } from '../passes/index.ts';
import type { AtlasPart } from './atlas.ts';
import { baseColour, sampleMap } from './colour.ts';

export interface StripLayer {
  /** RGBA8 atlas normal (the field bake), blended in place. */
  readonly normal: Uint8Array;
  /** RGBA8 sRGB atlas base colour, replaced in place where `color` was baked. */
  readonly base: Uint8Array;
  readonly sheet?: PaintedSheet;
  /** Strip normal strength (0 = none). Default 1. */
  readonly strength?: number;
  /** Linear RGB per texel from the source, −1 = none (bake-height's `color`). */
  readonly color?: Float32Array;
}

/** The strip layer over part `pi` (texels where `part[i] === pi`) of an atlas of `size`². */
export function trimDetail(
  a: AtlasPart,
  size: number,
  part: Int32Array,
  pi: number,
  o: StripLayer,
): void {
  const { normal, sheet, color } = o;
  const strength = sheet ? (o.strength ?? 1) : 0;
  if (strength === 0 && !color) return;
  const m = a.mesh;
  const trim = tangentsOf({ ...m, uvs: a.trimUv });
  const I = m.indices;
  const tex = new Float32Array(4);
  const t4 = new Float64Array(4);
  walkTexels(m, size, tangentsOf(m), (f) => {
    if (part[f.i] !== pi) return;
    const c = [I[f.tri * 3] ?? 0, I[f.tri * 3 + 1] ?? 0, I[f.tri * 3 + 2] ?? 0];
    let tu = 0;
    let tv = 0;
    t4.fill(0);
    for (let k = 0; k < 3; k++) {
      const w = f.w[k] ?? 0;
      const v = c[k] ?? 0;
      tu += (a.trimUv[v * 2] ?? 0) * w;
      tv += (a.trimUv[v * 2 + 1] ?? 0) * w;
      for (let j = 0; j < 4; j++) t4[j] = (t4[j] ?? 0) + (trim[v * 4 + j] ?? 0) * (j === 3 ? 0 : w);
    }
    const ci = f.i * 3;
    if (color && (color[ci] ?? -1) >= 0) {
      const rgb = baseColour(
        [color[ci] ?? 0, color[ci + 1] ?? 0, color[ci + 2] ?? 0],
        sheet,
        tu,
        tv,
        tex,
      );
      o.base.set([...rgb.map(Math.round), 255], f.i * 4);
    }
    if (!sheet || strength === 0) return;
    sampleMap(sheet.normal, sheet.size, tu, tv, tex);
    const dx = (((tex[0] ?? 128) / 255) * 2 - 1) * strength;
    const dy = (((tex[1] ?? 128) / 255) * 2 - 1) * strength;
    const dz = ((tex[2] ?? 255) / 255) * 2 - 1;
    // Trim frame: T from the trim tangents (orthogonalised), B = cross(N, T)·w.
    const n = f.n;
    const d = (t4[0] ?? 0) * (n[0] ?? 0) + (t4[1] ?? 0) * (n[1] ?? 0) + (t4[2] ?? 0) * (n[2] ?? 0);
    const T = [0, 1, 2].map((k) => (t4[k] ?? 0) - (n[k] ?? 0) * d);
    const tl = Math.hypot(T[0] ?? 0, T[1] ?? 0, T[2] ?? 0) || 1;
    for (let k = 0; k < 3; k++) T[k] = (T[k] ?? 0) / tl;
    const hand = (trim[(c[0] ?? 0) * 4 + 3] ?? 1) < 0 ? -1 : 1;
    const B = [
      ((n[1] ?? 0) * (T[2] ?? 0) - (n[2] ?? 0) * (T[1] ?? 0)) * hand,
      ((n[2] ?? 0) * (T[0] ?? 0) - (n[0] ?? 0) * (T[2] ?? 0)) * hand,
      ((n[0] ?? 0) * (T[1] ?? 0) - (n[1] ?? 0) * (T[0] ?? 0)) * hand,
    ];
    const W = [0, 1, 2].map((k) => (T[k] ?? 0) * dx + (B[k] ?? 0) * dy + (n[k] ?? 0) * dz);
    const dot = (v: Float64Array): number =>
      (v[0] ?? 0) * (W[0] ?? 0) + (v[1] ?? 0) * (W[1] ?? 0) + (v[2] ?? 0) * (W[2] ?? 0);
    // Detail in the atlas frame, then whiteout onto the field normal already in `normal`.
    const ax = dot(f.t);
    const ay = dot(f.b);
    const az = Math.max(1e-3, dot(f.n));
    const at = f.i * 4;
    const fx = ((normal[at] ?? 128) / 255) * 2 - 1;
    const fy = ((normal[at + 1] ?? 128) / 255) * 2 - 1;
    const fz = ((normal[at + 2] ?? 255) / 255) * 2 - 1;
    const r = [fx + ax, fy + ay, fz * az];
    const l = Math.hypot(r[0] ?? 0, r[1] ?? 0, r[2] ?? 1) || 1;
    for (let k = 0; k < 3; k++) normal[at + k] = Math.round((((r[k] ?? 0) / l) * 0.5 + 0.5) * 255);
  });
}
