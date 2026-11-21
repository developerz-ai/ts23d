// How skin is mapped onto its strips (the strips themselves: ./skin-texture.ts). `onSkin` maps
// a mesh at true scale and sends each triangle to its zone's strip by masks: matte cheeks, the
// oily T-zone, the wet lips, the thin skin round the eyes, the dry scalp, clothing painted over
// the skin; the masks for a face's zones live here too.
//
// A strip row is 1/64 of the sheet tall, so true-scale pores need a band only ~1 cm of world
// high. UVs live on vertices and are interpolated across a triangle, so the band cannot simply
// wrap: `onSkin` gives every triangle its own band cell (and its own projection plane) and splits
// only the vertices whose triangles disagree — most stay shared. Each cell reads its own stretch
// of the row along U, so no slice repeats cell after cell up a cheek (D513). A triangle too tall
// for a cell keeps true scale on its own plane, so density stays even at every LOD (D550,
// ./texel-spread.ts measures it). The masks live in
// ./skin-zones.ts; the soft ones (freckles, clear skin, stubble) are dithered per triangle, so a
// zone's edge is a fading density of its texture, never a line across a cheek (D520, D523).

import { dmath, type Mesh, merge, type StripId, stripRect, type Vec3 } from '@developerz.ai/ts23d';
import {
  SKIN_CLEAR,
  SKIN_FINE,
  SKIN_FRECKLED,
  SKIN_MATTE,
  SKIN_OILY,
  SKIN_ROW,
  SKIN_STRIP,
  SKIN_STUBBLE,
  SKIN_WET,
} from './skin-texture.ts';

export {
  SKIN_CLEAR,
  SKIN_FINE,
  SKIN_FRECKLED,
  SKIN_MATTE,
  SKIN_OILY,
  SKIN_ROW,
  SKIN_STRIP,
  SKIN_STUBBLE,
  SKIN_WET,
  skinFinish,
} from './skin-texture.ts';
export {
  clearZone,
  eyeZone,
  freckleZone,
  lipZone,
  scalpZone,
  tZone,
} from './skin-zones.ts';

const ROW = SKIN_ROW;
/** The share of the row at each edge the mapping stays out of (the sheet pads a row's edges
 *  with copies of its outer texels). */
const INSET = 0.2;
/** How far past its cell a triangle may reach (in cells) before it is squeezed to fit. */
const SLACK = 0.25;

/** Clothing painted over the skin (a bust's tunic, ./garment.ts): the triangles whose centre
 *  `mask` puts above ½ go onto `strip` at its true scale (`metres`, its `scaleMetres`). */
export interface ClothZone {
  readonly mask: (p: Vec3) => number;
  readonly strip: StripId;
  readonly metres: number;
}

/** Where each skin zone is (masks in the mesh's space, 0 … 1; a triangle whose centre a mask
 *  puts above ½ goes onto that zone's strip, the first that claims it in this order; a soft
 *  zone's mask is the share of its triangles it claims there instead, dithered). */
export interface SkinZones {
  /** Clothing painted over the skin, on its own strip. */
  readonly cloth?: ClothZone;
  /** The lips: the wet strip. */
  readonly moist?: (p: Vec3) => number;
  /** A scalp: the matte strip. */
  readonly matte?: (p: Vec3) => number;
  /** The lids and the crow's-feet corners (`eyeZone`): the thin skin's strip. */
  readonly fine?: (p: Vec3) => number;
  /** A shaven beard: the stubble strip (soft: feather its edge over a centimetre). */
  readonly stubble?: (p: Vec3) => number;
  /** Freckles' cluster (`freckleZone`, soft): the freckled strip. */
  readonly freckle?: (p: Vec3) => number;
  /** The T-zone (`tZone`): the oily strip. */
  readonly oil?: (p: Vec3) => number;
  /** Clear skin (`clearZone`, soft): the finest pores' strip. */
  readonly clear?: (p: Vec3) => number;
}

/** A triangle's own threshold for a soft zone, 0 … 1: a hash of its centre (the mesh's own
 *  positions, so it is the same bytes on any machine). */
function dither(c: Vec3): number {
  let h = 0x9e3779b9;
  for (const x of c) h = Math.imul(h ^ Math.round(x * 50000), 0x85ebca6b) ^ (h >>> 13);
  h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** The same mesh on the skin strips: UVs re-projected per triangle (see the header), positions,
 *  normals and colours kept; each triangle on its zone's strip (`SkinZones`), the rest on the
 *  cheek's: zones without a second draw. */
export function onSkin(m: Mesh, z: SkinZones = {}): Mesh {
  // [mask, strip, soft]
  const masks: readonly [((p: Vec3) => number) | undefined, StripId, boolean][] = [
    [z.cloth?.mask, z.cloth?.strip ?? SKIN_STRIP, false],
    [z.moist, SKIN_WET, false],
    [z.matte, SKIN_MATTE, false],
    [z.fine, SKIN_FINE, false],
    [z.stubble, SKIN_STUBBLE, true],
    [z.freckle, SKIN_FRECKLED, true],
    [z.oil, SKIN_OILY, false],
    [z.clear, SKIN_CLEAR, true],
  ];
  if (masks.every(([f]) => !f)) return onFineStrip(m, SKIN_STRIP, ROW);
  const P = m.positions;
  const groups: number[][] = masks.map(() => []);
  const dry: number[] = [];
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a = 0, b = 0, c = 0] = [m.indices[t], m.indices[t + 1], m.indices[t + 2]];
    const centre: Vec3 = [
      ((P[a * 3] ?? 0) + (P[b * 3] ?? 0) + (P[c * 3] ?? 0)) / 3,
      ((P[a * 3 + 1] ?? 0) + (P[b * 3 + 1] ?? 0) + (P[c * 3 + 1] ?? 0)) / 3,
      ((P[a * 3 + 2] ?? 0) + (P[b * 3 + 2] ?? 0) + (P[c * 3 + 2] ?? 0)) / 3,
    ];
    const h = dither(centre);
    const k = masks.findIndex(([f, , soft]) => f !== undefined && f(centre) > (soft ? h : 0.5));
    (k < 0 ? dry : (groups[k] ?? dry)).push(a, b, c);
  }
  const on = (idx: number[], strip: StripId, metres: number): Mesh[] =>
    idx.length ? [onFineStrip({ ...m, indices: new Uint32Array(idx) }, strip, metres)] : [];
  const parts = [
    ...on(dry, SKIN_STRIP, ROW),
    ...masks.flatMap(([, strip], i) =>
      on(groups[i] ?? [], strip, i === 0 ? (z.cloth?.metres ?? ROW) : ROW),
    ),
  ];
  return parts.length === 1 && parts[0] ? parts[0] : merge(parts);
}

type V3 = readonly [number, number, number];
const unit = (v: V3): V3 => {
  const l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
/** Projection planes: the cube's 13 axes (faces, edges, corners), each with s level (along the
 *  strip, so the fine strip's lines stay across the face) and t up it. Three axes left whole
 *  bands of a cheek tilted 45° off its plane, the pores stretched 1.4× (D550). */
const AXES: readonly V3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 1, 0],
  [1, -1, 0],
  [1, 0, 1],
  [1, 0, -1],
  [0, 1, 1],
  [0, 1, -1],
  [1, 1, 1],
  [1, 1, -1],
  [1, -1, 1],
  [1, -1, -1],
];
const PLANES: readonly { d: V3; s: V3; t: V3 }[] = AXES.map((v) => {
  const d = unit(v);
  const s: V3 = d[0] === 0 && d[1] === 0 ? [1, 0, 0] : unit(cross([0, 0, 1], d));
  return { d, s, t: cross(d, s) };
});
/** A directional strip's planes: the level ones and the top. Every level plane's t is world up,
 *  so V runs on unbroken across them and a weave's or a fine line's direction holds from one
 *  triangle to the next; a tilted plane's t leans, and neighbours picking different ones broke a
 *  knit's rib into triangular patches across a shoulder (D562). */
const LEVEL_PLANES = PLANES.filter((p) => p.d[2] === 0 || p.d[2] === 1);
/** The strips with no direction of their own (pores, freckles, stubble dots): any plane and any
 *  turn of it reads alike, so they take all 13 planes and the turns (D550). The fine and wet skin
 *  (lines across, lines down) and every cloth strip are directional. */
const ISOTROPIC: ReadonlySet<StripId> = new Set([
  SKIN_STRIP,
  SKIN_OILY,
  SKIN_MATTE,
  SKIN_CLEAR,
  SKIN_FRECKLED,
  SKIN_STUBBLE,
]);
/** In-plane turns a triangle too tall for a band cell may take, least turned first (so a
 *  strip's lines stay as near across the face as the triangle allows): a half turn in 7.5° steps. */
const TURNS = Array.from({ length: 24 }, (_, i) => {
  const a = (i % 2 ? -1 : 1) * Math.ceil(i / 2) * (Math.PI / 24);
  return [dmath.cos(a), dmath.sin(a)] as const;
});

/** `m` mapped at true scale onto a fine-grained strip whose row is painted for `row` metres of
 *  world (its `scaleMetres`): per-triangle band cells, as the header describes. A triangle too
 *  tall for a cell keeps true scale on its own plane, turned the least that fits across the row
 *  (shrunk evenly both ways only when no turn fits): squeezing it across the row alone smeared
 *  the pores into streaks on every large triangle (D550). A directional strip keeps its pattern's
 *  direction: level planes only, never turned (D562). */
export function onFineStrip(m: Mesh, strip: StripId, row: number): Mesh {
  const r = stripRect(strip);
  const free = ISOTROPIC.has(strip);
  const planes = free ? PLANES : LEVEL_PLANES;
  const turns = free ? TURNS : TURNS.slice(0, 1);
  // World metres one band cell covers (true scale on the used part of the row).
  const BAND = row * (1 - 2 * INSET);
  const P = m.positions;
  const T = m.indices;
  const key = new Map<string, number>();
  const from: number[] = [];
  const uv: number[] = [];
  const indices = new Uint32Array(T.length);
  const pos = (v: number): V3 => [P[v * 3] ?? 0, P[v * 3 + 1] ?? 0, P[v * 3 + 2] ?? 0];
  for (let t = 0; t < T.length; t += 3) {
    const vs = [T[t] ?? 0, T[t + 1] ?? 0, T[t + 2] ?? 0] as const;
    const [pa, pb, pc] = [pos(vs[0]), pos(vs[1]), pos(vs[2])];
    const ps = [pa, pb, pc];
    const n = unit(
      cross(
        [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]],
        [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]],
      ),
    );
    // The projection plane facing the triangle most squarely: (s along the strip, t across it).
    let pi = 0;
    for (let i = 1; i < planes.length; i++)
      if (Math.abs(dot(n, planes[i]?.d ?? n)) > Math.abs(dot(n, planes[pi]?.d ?? n))) pi = i;
    const plane = planes[pi] ?? { s: n, t: n };
    let ss = ps.map((q) => dot(q, plane.s));
    let ts = ps.map((q) => dot(q, plane.t));
    let lo = Math.min(...ts);
    let hi = Math.max(...ts);
    const cell = Math.floor((lo + hi) / 2 / BAND);
    const fits = hi <= (cell + 1 + SLACK) * BAND && lo >= (cell - SLACK) * BAND;
    let scale = 1;
    if (!fits) {
      // The triangle's own plane, the plane's s laid onto it, turned the least that fits the
      // row's reach, or (none fits) to its narrowest extent.
      const k0 = dot(plane.s, n);
      const s0 = unit([plane.s[0] - n[0] * k0, plane.s[1] - n[1] * k0, plane.s[2] - n[2] * k0]);
      const t0 = cross(n, s0);
      const reach = (1 + 2 * SLACK) * BAND;
      let best = Number.POSITIVE_INFINITY;
      for (const [c, sn] of turns) {
        if (best <= reach) break;
        const sx: V3 = [c * s0[0] + sn * t0[0], c * s0[1] + sn * t0[1], c * s0[2] + sn * t0[2]];
        const tx: V3 = [c * t0[0] - sn * s0[0], c * t0[1] - sn * s0[1], c * t0[2] - sn * s0[2]];
        const tt = ps.map((q) => dot(q, tx));
        const ext = Math.max(...tt) - Math.min(...tt);
        if (ext < best - 1e-12) {
          best = ext;
          ss = ps.map((q) => dot(q, sx));
          ts = tt;
        }
      }
      lo = Math.min(...ts);
      hi = Math.max(...ts);
      scale = hi - lo > reach ? reach / (hi - lo) : 1;
    }
    // Each band cell reads its own stretch of the row (a golden-ratio step along U): the same
    // slice mirrored cell after cell repeated every feature up a cheek in columns (D513).
    const step = (fits ? cell : t) * 0.6180339887;
    const shift = (step - Math.floor(step)) * r.metres;
    for (const [i, v] of vs.entries()) {
      const tv = ts[i] ?? 0;
      // In its cell, or centred on the row. (Cells meet at a UV seam either way: each reads
      // its own stretch of the row, so mirroring them no longer joined their texels.)
      const f = fits ? tv / BAND - cell : 0.5 + ((tv - (lo + hi) / 2) * scale) / BAND;
      const k = fits ? `${v}|${pi}|${cell}` : `${v}|t${t}`;
      let id = key.get(k);
      if (id === undefined) {
        id = from.length;
        key.set(k, id);
        from.push(v);
        uv.push(
          r.u0 + (((ss[i] ?? 0) * scale + shift) / r.metres) * (r.u1 - r.u0),
          r.v0 + (INSET + f * (1 - 2 * INSET)) * (r.v1 - r.v0),
        );
      }
      indices[t + i] = id;
    }
  }
  const take = <A extends Float32Array | Uint16Array>(src: A, size: number): A => {
    const out = new (src.constructor as new (n: number) => A)(from.length * size);
    for (let i = 0; i < from.length; i++)
      for (let e = 0; e < size; e++) out[i * size + e] = src[(from[i] ?? 0) * size + e] ?? 0;
    return out;
  };
  return {
    positions: take(m.positions, 3),
    normals: take(m.normals, 3),
    uvs: new Float32Array(uv),
    colors: take(m.colors, 3),
    indices,
    ...(m.joints && m.weights ? { joints: take(m.joints, 4), weights: take(m.weights, 4) } : {}),
    ...(m.morphs
      ? { morphs: m.morphs.map((x) => ({ name: x.name, positions: take(x.positions, 3) })) }
      : {}),
  };
}
