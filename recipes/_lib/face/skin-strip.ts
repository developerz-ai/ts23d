// The skin strip every face, bust and bare limb shares: near-white albedo (the vertex colour
// carries the tone and its zones), a pore micro relief for the normal map, and a roughness that
// follows it (oily crowns between the pores, matte pits), so skin stops reading as one flat
// painted surface. Isotropic on purpose: a box projection crosses any direction (D60), so nothing
// here has a grain. `onSkin` maps a mesh onto it at true scale.
//
// A strip row is 1/64 of the sheet tall, so true-scale pores need a band only ~2 cm of world
// high. UVs live on vertices and are interpolated across a triangle, so the band cannot simply
// wrap: `onSkin` gives every triangle its own band cell (and its own projection plane) and splits
// only the vertices whose triangles disagree — most stay shared.

import {
  defineMaterial,
  type Mesh,
  merge,
  type StripId,
  stripRect,
  tex,
  type Vec3,
} from '@developerz.ai/ts23d';

/** World metres the strip's row is painted for (V), and the share of the row at each edge the
 *  mapping stays out of (the sheet pads a row's edges with copies of its outer texels). */
const ROW = 0.032;
const INSET = 0.2;
/** How far past its cell a triangle may reach (in cells) before it is squeezed to fit. */
const SLACK = 0.25;

// Only features far smaller than the band: anything coarser repeats from cell to cell.
const pores = tex.cells({ size: 0.0026, out: 'f1', seed: 11 });
const fuzz = tex.noise({ size: 0.004, octaves: 2, seed: 13 });
const height = pores.mul(0.75).add(fuzz.mul(0.25));

export const SKIN_STRIP = defineMaterial({
  id: 'face_skin',
  // Its hash row (11) is the hydra's scales; 13 is free of every material the repo defines.
  row: 13,
  scaleMetres: ROW,
  spanMetres: 2,
  roughness: 0.5,
  graph: tex.material({
    height,
    depth: 0.0004,
    albedo: height.ramp([
      [0, '#ebe4df'],
      [1, '#f8f5f2'],
    ]),
    roughness: height.remap(0.62, 0.42),
  }),
  description: 'Skin micro relief: pores, glossier crowns (vertex colour carries the tone).',
  sources: ['https://physicallybased.info'],
});

/** The oily skin of the T-zone (forehead centre, nose, chin): the same pores, smoother between
 *  them, so a highlight runs down the nose and across the brow while the cheeks stay matte. */
export const SKIN_OILY = defineMaterial({
  id: 'face_skin_oily',
  row: 12,
  scaleMetres: ROW,
  spanMetres: 2,
  roughness: 0.36,
  graph: tex.material({
    height,
    depth: 0.0003,
    albedo: height.ramp([
      [0, '#ebe4df'],
      [1, '#f8f5f2'],
    ]),
    roughness: height.remap(0.5, 0.28),
  }),
  description: 'Oily skin (T-zone): the pore relief of face_skin, glossier between the pores.',
  sources: ['https://physicallybased.info'],
});

/** The same mesh on the skin strip: UVs re-projected per triangle (see the header), positions,
 *  normals and colours kept. `oil` (0 matte … 1 oily, in the mesh's space) sends the triangles
 *  whose centre it puts above ½ to the oily strip: roughness zones without a second draw. */
export function onSkin(m: Mesh, oil?: (p: Vec3) => number): Mesh {
  if (!oil) return onFineStrip(m, SKIN_STRIP, ROW);
  const P = m.positions;
  const dry: number[] = [];
  const wet: number[] = [];
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a = 0, b = 0, c = 0] = [m.indices[t], m.indices[t + 1], m.indices[t + 2]];
    const centre: Vec3 = [
      ((P[a * 3] ?? 0) + (P[b * 3] ?? 0) + (P[c * 3] ?? 0)) / 3,
      ((P[a * 3 + 1] ?? 0) + (P[b * 3 + 1] ?? 0) + (P[c * 3 + 1] ?? 0)) / 3,
      ((P[a * 3 + 2] ?? 0) + (P[b * 3 + 2] ?? 0) + (P[c * 3 + 2] ?? 0)) / 3,
    ];
    (oil(centre) > 0.5 ? wet : dry).push(a, b, c);
  }
  if (wet.length === 0) return onFineStrip(m, SKIN_STRIP, ROW);
  return merge([
    onFineStrip({ ...m, indices: new Uint32Array(dry) }, SKIN_STRIP, ROW),
    onFineStrip({ ...m, indices: new Uint32Array(wet) }, SKIN_OILY, ROW),
  ]);
}

/** The T-zone as an oil mask (1 on it, 0 a `soft` away): the forehead's centre band down the
 *  nose to the chin, from four midline points and the nose's half-width. */
export function tZone(
  k: {
    readonly forehead: Vec3;
    readonly glabella: Vec3;
    readonly noseTip: Vec3;
    readonly chin: Vec3;
  },
  halfNose: number,
): (p: Vec3) => number {
  const soft = halfNose * 0.6;
  return (p) => {
    const y = Math.abs(p[1]);
    // Above the brow: a band three nose-widths across; below it: the nose and the chin's centre.
    const brow = p[2] > k.glabella[2] ? y - halfNose * 3 : Number.POSITIVE_INFINITY;
    const nose = p[2] <= k.glabella[2] && p[2] > k.noseTip[2] - halfNose ? y - halfNose : Infinity;
    const chin = Math.hypot(y, p[2] - k.chin[2]) - halfNose * 1.2;
    const front = k.chin[0] - 0.04 - p[0];
    const d = Math.max(Math.min(brow, nose, chin), front, p[2] - k.forehead[2]);
    return Math.min(1, Math.max(0, 0.5 - d / soft));
  };
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
    for (const [i, v] of [a, b, c].entries()) {
      const tv = ts[i] ?? 0;
      // In its cell (alternate cells mirrored, so neighbours meet), or squeezed to fill one.
      let f = fits ? tv / BAND - cell : (tv - lo) / (hi - lo || 1);
      if (fits && cell % 2 !== 0) f = 1 - f;
      const k = `${v}|${axis}|${fits ? cell : `t${t}`}`;
      let id = key.get(k);
      if (id === undefined) {
        id = from.length;
        key.set(k, id);
        from.push(v);
        uv.push(
          r.u0 + (at(v, si) / r.metres) * (r.u1 - r.u0),
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
