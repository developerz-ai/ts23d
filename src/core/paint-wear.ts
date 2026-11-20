// Wear on a paint slot. glTF base colour = texture × COLOR_0 × baseColorFactor, so a painted vertex
// can only be a darkening of its slot (`tone`): no lighter dust, no grey steel, no primer, no rust
// hue. A slot declared with `wear: true` splits its parts instead: a vertex whose hue or
// saturation has left the slot's (`isBare`: steel, primer, rust, dust, mud, soot) is bare, and
// bare triangles are written in the plain trim material with their own colour and never repainted; the rest stays paint (shading, grime, a light fade: still the slot's
// hue) and follows every livery. `settleWear` (compile) first cuts every triangle that mixes bare
// and paint vertices along the chip's border (inside the triangle, at a ragged point of each
// mixed edge), writes the cut points once per side and snaps the paint side to what the slot
// material shows, so renders, liveries and the GLB agree; `splitWear` (export) cuts a settled
// mesh into its paint and bare halves.

import { mappedOf } from './material-use.ts';
import type { Mesh, Morph } from './mesh.ts';
import type { Vec3 } from './vec.ts';

/** Bare: hue more than this many degrees from the slot's, or under half its saturation. */
export const WEAR_HUE = 10;
/** A wear slot must be this saturated (linear RGB, (max − min) ÷ max) for wear to read apart. */
export const WEAR_MIN_SATURATION = 0.35;

/**
 * What a painted vertex stores in COLOR_0: its colour ÷ the slot colour, per channel, so the
 * material's baseColorFactor (= slot colour) restores it exactly and a variant's factor keeps the
 * grime, wear and shading tones. Channels the slot barely has (< 10 % of its strongest, e.g. the
 * blue of a pure red) take the mean ratio of the others instead of dividing by ~0. Clamped to 0..1:
 * a vertex brighter than its slot (lettering, chrome) belongs in another slot or none.
 */
export function tone(c: Vec3, slot: Vec3): Vec3 {
  const top = Math.max(...slot);
  const sure = [0, 1, 2].filter((i) => (slot[i] ?? 0) >= 0.1 * top);
  const mean = sure.reduce((t, i) => t + (c[i] ?? 0) / (slot[i] ?? 1), 0) / sure.length;
  const ch = (i: number): number =>
    Math.min(1, Math.max(0, sure.includes(i) ? (c[i] ?? 0) / (slot[i] ?? 1) : mean));
  return [ch(0), ch(1), ch(2)];
}

const at = (a: Float32Array, v: number): Vec3 => [
  a[v * 3] ?? 0,
  a[v * 3 + 1] ?? 0,
  a[v * 3 + 2] ?? 0,
];

/** The colour the slot material shows for `c`: its tone × the slot. */
function painted(c: Vec3, slot: Vec3): Vec3 {
  const t = tone(c, slot);
  return [t[0] * slot[0], t[1] * slot[1], t[2] * slot[2]];
}

/** Hexcone hue in degrees (0..360) and saturation (0..1) of a linear RGB colour. */
export function hueSat(c: Vec3): { hue: number; sat: number } {
  const [r, g, b] = c;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (max <= 0 || d <= 0) return { hue: 0, sat: 0 };
  const h = max === r ? (g - b) / d : max === g ? 2 + (b - r) / d : 4 + (r - g) / d;
  return { hue: (h * 60 + 360) % 360, sat: d / max };
}

/** True when `c` is no longer the slot's paint: another hue, or washed out to grey. */
export function isBare(c: Vec3, slot: Vec3): boolean {
  const a = hueSat(c);
  const s = hueSat(slot);
  if (a.sat < 0.5 * s.sat) return true;
  const dh = Math.abs(a.hue - s.hue);
  return Math.min(dh, 360 - dh) > WEAR_HUE;
}

/** Per triangle: 1 = bare (two or more bare vertices), 0 = paint. */
function bareTriangles(m: Mesh, slot: Vec3): Uint8Array {
  const verts = m.colors.length / 3;
  const bare = new Uint8Array(verts);
  for (let v = 0; v < verts; v++) bare[v] = isBare(at(m.colors, v), slot) ? 1 : 0;
  const tris = new Uint8Array(m.indices.length / 3);
  for (let t = 0; t < tris.length; t++) {
    let n = 0;
    for (let k = 0; k < 3; k++) n += bare[m.indices[t * 3 + k] ?? 0] ?? 0;
    tris[t] = n >= 2 ? 1 : 0;
  }
  return tris;
}

/**
 * The skin of the point at fraction `t` from vertex `a` to `b`: each joint's weight blended
 * linearly (a joint only one end has counts 0 at the other), the strongest four kept (ties: lower
 * joint first) and renormalised, so a cut point deforms as the edge it sits on does.
 */
function mixSkin(joints: Uint16Array, weights: Float32Array, a: number, b: number, t: number) {
  const by = new Map<number, number>();
  for (const [v, f] of [
    [a, 1 - t],
    [b, t],
  ] as const)
    for (let k = 0; k < 4; k++) {
      const w = (weights[v * 4 + k] ?? 0) * f;
      if (w > 0) by.set(joints[v * 4 + k] ?? 0, (by.get(joints[v * 4 + k] ?? 0) ?? 0) + w);
    }
  const top = [...by].sort((p, q) => q[1] - p[1] || p[0] - q[0]).slice(0, 4);
  const sum = top.reduce((s, [, w]) => s + w, 0) || 1;
  return {
    joints: [0, 1, 2, 3].map((k) => top[k]?.[0] ?? 0),
    weights: [0, 1, 2, 3].map((k) => (top[k]?.[1] ?? 0) / sum),
  };
}

/** Copy vertex `from` of `m` into slot `to` of the output arrays (colour set by the caller). */
function copier(m: Mesh, count: number) {
  const out = {
    positions: new Float32Array(count * 3),
    normals: new Float32Array(count * 3),
    uvs: new Float32Array(count * 2),
    colors: new Float32Array(count * 3),
    ...(m.joints ? { joints: new Uint16Array(count * 4) } : {}),
    ...(m.weights ? { weights: new Float32Array(count * 4) } : {}),
  };
  const morphs = m.morphs?.map((t) => ({ name: t.name, positions: new Float32Array(count * 3) }));
  const copy = (from: number, to: number): void => {
    out.positions.set(m.positions.subarray(from * 3, from * 3 + 3), to * 3);
    out.normals.set(m.normals.subarray(from * 3, from * 3 + 3), to * 3);
    out.uvs.set(m.uvs.subarray(from * 2, from * 2 + 2), to * 2);
    out.colors.set(m.colors.subarray(from * 3, from * 3 + 3), to * 3);
    if (m.joints && out.joints) out.joints.set(m.joints.subarray(from * 4, from * 4 + 4), to * 4);
    if (m.weights && out.weights)
      out.weights.set(m.weights.subarray(from * 4, from * 4 + 4), to * 4);
    for (const [i, t] of (m.morphs ?? []).entries())
      morphs?.[i]?.positions.set(t.positions.subarray(from * 3, from * 3 + 3), to * 3);
  };
  /** Vertex `to` at fraction `t` from `a` to `b` (normal renormalised; skin blended by joint). */
  const mix = (a: number, b: number, t: number, to: number): void => {
    const blend = (src: Float32Array, dst: Float32Array, k: number): void => {
      for (let i = 0; i < k; i++)
        dst[to * k + i] = (src[a * k + i] ?? 0) * (1 - t) + (src[b * k + i] ?? 0) * t;
    };
    blend(m.positions, out.positions, 3);
    blend(m.normals, out.normals, 3);
    blend(m.uvs, out.uvs, 2);
    const nx = out.normals[to * 3] ?? 0;
    const ny = out.normals[to * 3 + 1] ?? 0;
    const nz = out.normals[to * 3 + 2] ?? 0;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    out.normals.set([nx / len, ny / len, nz / len], to * 3);
    if (m.joints && m.weights && out.joints && out.weights) {
      const s = mixSkin(m.joints, m.weights, a, b, t);
      out.joints.set(s.joints, to * 4);
      out.weights.set(s.weights, to * 4);
    }
    for (const [i, g] of (m.morphs ?? []).entries()) {
      const dst = morphs?.[i]?.positions;
      if (dst) blend(g.positions, dst, 3);
    }
  };
  const mesh = (indices: Uint32Array): Mesh => ({
    ...out,
    indices,
    ...(morphs ? { morphs: morphs as Morph[] } : {}),
    ...mappedOf(m),
  });
  return { out, copy, mix, mesh };
}

/**
 * Where a chip's border crosses the edge from bare vertex `a` to paint vertex `b`, as a fraction
 * from `a`. The mask is only sampled at the vertices, so the crossing could be anywhere between
 * them: a hash of the edge's midpoint picks it in 0.25..0.75, the same from both triangles that
 * share the edge (no T-junction) and different from edge to edge, so chips on a regular lattice
 * come out ragged instead of a sawtooth of identical triangles.
 */
function crossing(m: Mesh, a: number, b: number): number {
  let h = 0x9e3779b9;
  for (let k = 0; k < 3; k++) {
    const mid = ((m.positions[a * 3 + k] ?? 0) + (m.positions[b * 3 + k] ?? 0)) * 0.5;
    h = Math.imul(h ^ Math.round(mid * 4096), 0x85ebca6b);
    h ^= h >>> 13;
  }
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return 0.25 + 0.5 * ((h >>> 0) / 4294967296);
}

/**
 * A painted mesh of a wear slot, settled: a triangle whose vertices are all paint or all bare
 * stays as it is; one that mixes them is cut along the chip's border (each mixed edge at
 * `crossing`) into a bare piece and a paint piece, so a chip follows the mask inside the
 * triangles instead of the lattice. Paint vertices show what the slot material will (their tone ×
 * the slot); bare ones keep their own colour, and a cut point is written twice, once in each
 * colour. Stable: a settled mesh has no mixed triangle left to cut.
 */
export function settleWear(m: Mesh, slot: Vec3): Mesh {
  const verts = m.colors.length / 3;
  const bare = new Uint8Array(verts);
  for (let v = 0; v < verts; v++) bare[v] = isBare(at(m.colors, v), slot) ? 1 : 0;
  const tris = m.indices.length / 3;
  // Cut points: one per mixed edge (keyed by its vertex pair), each written as a bare and a
  // paint vertex after the originals.
  const cuts = new Map<number, { readonly a: number; readonly b: number; readonly at: number }>();
  const cutOf = (a: number, b: number): number => {
    const k = a < b ? a * verts + b : b * verts + a;
    let c = cuts.get(k);
    if (!c) {
      const [x, y] = bare[a] ? [a, b] : [b, a];
      c = { a: x, b: y, at: verts + cuts.size * 2 };
      cuts.set(k, c);
    }
    return c.at;
  };
  const idx: number[] = [];
  for (let t = 0; t < tris; t++) {
    const vs = [0, 1, 2].map((k) => m.indices[t * 3 + k] ?? 0);
    const n = vs.reduce((s, v) => s + (bare[v] ?? 0), 0);
    if (n === 0 || n === 3) {
      idx.push(...vs);
      continue;
    }
    // Rotate so the lone vertex (the one bare, or the one paint) comes first; winding is kept.
    const r = vs.findIndex((v) => (bare[v] ?? 0) === (n === 1 ? 1 : 0));
    const [l = 0, p = 0, q = 0] = [vs[r], vs[(r + 1) % 3], vs[(r + 2) % 3]];
    // Bare twin at `at`, paint twin at `at + 1`.
    const lone = n === 1 ? 0 : 1;
    const x = cutOf(l, p);
    const y = cutOf(l, q);
    idx.push(l, x + lone, y + lone);
    idx.push(x + 1 - lone, p, q, x + 1 - lone, q, y + 1 - lone);
  }
  const { out, copy, mix, mesh } = copier(m, verts + cuts.size * 2);
  for (let v = 0; v < verts; v++) {
    copy(v, v);
    if (!bare[v]) out.colors.set(painted(at(m.colors, v), slot), v * 3);
  }
  for (const c of cuts.values()) {
    const t = crossing(m, c.a, c.b);
    for (const [w, colour] of [
      [c.at, at(m.colors, c.a)],
      [c.at + 1, painted(at(m.colors, c.b), slot)],
    ] as const) {
      mix(c.a, c.b, t, w);
      out.colors.set(colour, w * 3);
    }
  }
  return mesh(Uint32Array.from(idx));
}

/** The vertices of a settled wear-slot mesh that a livery must leave alone (1 = bare side). */
export function bareVertices(m: Mesh, slot: Vec3): Uint8Array {
  const tris = bareTriangles(m, slot);
  const keep = new Uint8Array(m.colors.length / 3);
  for (let t = 0; t < tris.length; t++)
    if (tris[t]) for (let k = 0; k < 3; k++) keep[m.indices[t * 3 + k] ?? 0] = 1;
  return keep;
}

/** The triangles of `m` whose class is `want`, as a compact mesh (null when there are none). */
function subMesh(m: Mesh, tris: Uint8Array, want: number): Mesh | null {
  const remap = new Int32Array(m.colors.length / 3).fill(-1);
  const order: number[] = [];
  const idx: number[] = [];
  for (let t = 0; t < tris.length; t++) {
    if (tris[t] !== want) continue;
    for (let k = 0; k < 3; k++) {
      const v = m.indices[t * 3 + k] ?? 0;
      if ((remap[v] ?? -1) < 0) {
        remap[v] = order.length;
        order.push(v);
      }
      idx.push(remap[v] ?? 0);
    }
  }
  if (!idx.length) return null;
  const { copy, mesh } = copier(m, order.length);
  for (const [i, v] of order.entries()) copy(v, i);
  return mesh(Uint32Array.from(idx));
}

/** A settled wear-slot mesh cut into its paint triangles and its bare ones (either may be null). */
export function splitWear(m: Mesh, slot: Vec3): { paint: Mesh | null; bare: Mesh | null } {
  const tris = bareTriangles(m, slot);
  if (!tris.includes(1)) return { paint: m, bare: null };
  return { paint: subMesh(m, tris, 0), bare: subMesh(m, tris, 1) };
}
