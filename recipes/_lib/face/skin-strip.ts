// How skin is mapped onto its strips (the strips themselves: ./skin-texture.ts). `onSkin` maps
// a mesh at true scale and sends each triangle to its zone's strip by masks: matte cheeks, the
// oily T-zone, the wet lips, the thin skin round the eyes, the dry scalp, clothing painted over
// the skin; the masks for a face's zones live here too.
//
// A strip row is 1/64 of the sheet tall, so true-scale pores need a band only ~1 cm of world
// high. UVs live on vertices and are interpolated across a triangle, so the band cannot simply
// wrap: `onSkin` gives every triangle its own band cell (and its own projection plane) and splits
// only the vertices whose triangles disagree — most stay shared. Each cell reads its own stretch
// of the row along U, so no slice repeats cell after cell up a cheek (D513). The masks live in
// ./skin-zones.ts; the soft ones (freckles, clear skin, stubble) are dithered per triangle, so a
// zone's edge is a fading density of its texture, never a line across a cheek (D520, D523).

import { type Mesh, merge, type StripId, stripRect, type Vec3 } from '@developerz.ai/ts23d';
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

/** `m` mapped at true scale onto a fine-grained strip whose row is painted for `row` metres of
 *  world (its `scaleMetres`): per-triangle band cells, as the header describes. */
export function onFineStrip(m: Mesh, strip: StripId, row: number): Mesh {
  const r = stripRect(strip);
  // World metres one band cell covers (true scale on the used part of the row).
  const BAND = row * (1 - 2 * INSET);
  const P = m.positions;
  const T = m.indices;
  const key = new Map<string, number>();
  const from: number[] = [];
  const uv: number[] = [];
  const indices = new Uint32Array(T.length);
  const at = (v: number, e: number): number => P[v * 3 + e] ?? 0;
  for (let t = 0; t < T.length; t += 3) {
    const [a = 0, b = 0, c = 0] = [T[t], T[t + 1], T[t + 2]];
    const u = [at(b, 0) - at(a, 0), at(b, 1) - at(a, 1), at(b, 2) - at(a, 2)] as const;
    const w = [at(c, 0) - at(a, 0), at(c, 1) - at(a, 1), at(c, 2) - at(a, 2)] as const;
    const n = [
      Math.abs(u[1] * w[2] - u[2] * w[1]),
      Math.abs(u[2] * w[0] - u[0] * w[2]),
      Math.abs(u[0] * w[1] - u[1] * w[0]),
    ] as const;
    // Projection plane from the face normal's dominant axis: (s along the strip, t across it).
    const axis = n[2] >= n[0] && n[2] >= n[1] ? 2 : n[0] >= n[1] ? 0 : 1;
    const [si, ti] = axis === 2 ? [0, 1] : axis === 0 ? [1, 2] : [0, 2];
    const ts = [at(a, ti), at(b, ti), at(c, ti)] as const;
    const lo = Math.min(...ts);
    const hi = Math.max(...ts);
    const cell = Math.floor((lo + hi) / 2 / BAND);
    const fits = hi <= (cell + 1 + SLACK) * BAND && lo >= (cell - SLACK) * BAND;
    // Each band cell reads its own stretch of the row (a golden-ratio step along U): the same
    // slice mirrored cell after cell repeated every feature up a cheek in columns (D513).
    const step = (fits ? cell : t) * 0.6180339887;
    const shift = (step - Math.floor(step)) * r.metres;
    for (const [i, v] of [a, b, c].entries()) {
      const tv = ts[i] ?? 0;
      // In its cell, or squeezed to fill one. (Cells meet at a UV seam either way: each reads
      // its own stretch of the row, so mirroring them no longer joined their texels.)
      const f = fits ? tv / BAND - cell : (tv - lo) / (hi - lo || 1);
      const k = `${v}|${axis}|${fits ? cell : `t${t}`}`;
      let id = key.get(k);
      if (id === undefined) {
        id = from.length;
        key.set(k, id);
        from.push(v);
        uv.push(
          r.u0 + ((at(v, si) + shift) / r.metres) * (r.u1 - r.u0),
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
