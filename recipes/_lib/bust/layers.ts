// Garment layers of a dressed bust. A garment is a closed solid of its own (cloth-garment.ts),
// one layer per material: this meshes each layer on its strip at its LOD's cell, irons the cut
// edges, saws the layers off with the torso's arm cut, weathers the ones that carry the road,
// bakes AO across all of them and merges them into the parts the asset names. `buildDressedBust`
// wraps the shared bust builder round it: the skin is built without the body the outfit hides,
// the garments ride the same `face` node (they breathe with the chest), and the recipe's hard
// extras get the FULL anatomy to sit on, not the cut one. The far LOD's mesh passes live here too:
// `slice` (a mesh cut along a curve on its surface) and `tinted` (triangles in a flat colour of
// their own) draw the garments' edges and a far head's mouth and brows where they lie, not on
// the far cell's grid (D615, D616).

import {
  type BuildContext,
  bakeAo,
  dmath,
  type Field,
  faceMorphs,
  fair,
  type Mesh,
  merge,
  type PartOptions,
  type SculptEdit,
  type StripId,
  sculpt,
  sculptField,
  type WeatheringOptions,
  weather,
} from '@developerz.ai/ts23d';
import { skullLandmarks, skullOf } from '../face/skull.ts';
import { type BustRecipe, buildBust, bustEdits, SECTION } from './bust.ts';
import { onCloth, SECTION_SHADE, type SectionSource, sectionColours } from './cloth-tone.ts';
import { type FarInk, farInk } from './face-forms.ts';
import { faceRigOf } from './face-rig.ts';
import type { Surface, V } from './kit.ts';

/** One garment layer: its own sculpt on its own strip. */
export interface GarmentLayer {
  readonly name: string;
  readonly strip: StripId;
  /** Colour of edits that give none. */
  readonly color: V;
  readonly edits: SculptEdit[];
  /** Cell per LOD, metres. */
  readonly cell: readonly [number, number, number];
  /** The part the layer is merged into (a part may carry its own finish). */
  readonly part: string;
  /**
   * A far layer that sculpts several garments as one surface: those garments. Each vertex then
   * takes the colour of the one on top there, not the sculpt's own pick between shells a few
   * millimetres apart, which at a far cell flips vertex by vertex into a per-triangle checker.
   */
  readonly sources?: readonly GarmentLayer[];
  /** A sawn section plug: each vertex the colour of the nearest of these garments' shells, in
   *  shade (cloth-tone.ts `sectionColours`). */
  readonly cutThrough?: readonly SectionSource[];
  /** Where its paint may change its colour (≤ 0): trims, seams and grime from its causes
   *  (cloth-grime.ts); paint anywhere else is a stray stain (cloth-check.ts `strayPaint`, D580). */
  readonly wear?: Field;
}

export interface GarmentOptions {
  /** Weathering of the named layers (default: every layer), one pass over them together, on
   *  LOD0/1. Its noise is cells of 3-35 cm, which a far cell's vertices sample one value each, so
   *  on LOD2 it lands as pale and dark triangles: the far LOD settles its dust as an even tint on
   *  what faces up (`settled`, amount × strength) instead. */
  readonly wear?: {
    readonly layers?: readonly string[];
    readonly options: WeatheringOptions;
    /** Settle the dust as that even tint at every LOD (no weather pass): on a small garment the
     *  pass's patches read as camouflage blotches, not as a season's dust on the shoulders. */
    readonly even?: boolean;
  };
  /** Kept where ≤ 0: every layer is sawn off by it (the torso's arm cut; a dressed bust's
   *  default is its recipe's `saw`), its face painted the layer's colour in shadow. */
  readonly cut?: Field;
  /** The far LOD's own pass over a layer's mesh (LOD2 only), before the merge. */
  readonly far?: (mesh: Mesh, layer: GarmentLayer) => Mesh;
  /** The far LOD's colour blocks cut along the garments' own edges and its cloth faired
   *  (`edgedColours`, D616); default: blocks on the far cell's triangles, unfaired. */
  readonly farEdges?: boolean;
}

/** A mesh being grown: its vertex arrays, and a new vertex on the edge a → b of the source. */
function grower(m: Mesh) {
  const pos: number[] = Array.from(m.positions);
  const nor: number[] = Array.from(m.normals);
  const uv: number[] = Array.from(m.uvs);
  const col: number[] = Array.from(m.colors);
  const v3 = (a: ArrayLike<number>, i: number): V => [
    a[i * 3] ?? 0,
    a[i * 3 + 1] ?? 0,
    a[i * 3 + 2] ?? 0,
  ];
  const mix3 = (a: V, b: V, t: number): V => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
  const unit = (a: V): V => {
    const l = dmath.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  };
  const at = (a: number, b: number, t: number): { p: V; n: V; c: V } => ({
    p: mix3(v3(m.positions, a), v3(m.positions, b), t),
    n: unit(mix3(v3(m.normals, a), v3(m.normals, b), t)),
    c: mix3(v3(m.colors, a), v3(m.colors, b), t),
  });
  return {
    col,
    at,
    position: (i: number): V => v3(m.positions, i),
    normal: (i: number): V => v3(m.normals, i),
    /** Appends the vertex `t` along a → b (colour `c`, default the edge's own) and returns it. */
    add(a: number, b: number, t: number, c?: V): number {
      const v = at(a, b, t);
      pos.push(...v.p);
      nor.push(...v.n);
      col.push(...(c ?? v.c));
      uv.push(
        (m.uvs[a * 2] ?? 0) + ((m.uvs[b * 2] ?? 0) - (m.uvs[a * 2] ?? 0)) * t,
        (m.uvs[a * 2 + 1] ?? 0) + ((m.uvs[b * 2 + 1] ?? 0) - (m.uvs[a * 2 + 1] ?? 0)) * t,
      );
      return pos.length / 3 - 1;
    },
    mesh: (indices: number[]): Mesh => ({
      ...m,
      positions: new Float32Array(pos),
      normals: new Float32Array(nor),
      uvs: new Float32Array(uv),
      colors: new Float32Array(col),
      indices: new Uint32Array(indices),
    }),
  };
}

/**
 * `m` sliced along the curve `phi` = 0 on its surface, wherever `within` holds at the crossing
 * (it is also given a point just back on the edge's negative side, 4 % of the edge):
 * every triangle edge whose ends lie on opposite sides gets a vertex where `phi` changes sign
 * (bisected, never nearer a corner than 8 % of the edge: no sliver), and its triangles are cut
 * in two or three through it. Whether an edge is cut depends on the edge alone, so both
 * triangles on it agree and the surface stays closed. Nothing is recoloured: a slice only gives
 * a far mesh the edges a drawn feature needs, however thin it is against the mesh's cell.
 */
export function slice(
  m: Mesh,
  phi: (p: V, n: V) => number,
  within: (p: V, n: V, inside: { readonly p: V; readonly n: V }) => boolean,
): Mesh {
  const g = grower(m);
  const nv = m.positions.length / 3;
  const side = Uint8Array.from({ length: nv }, (_, i) =>
    phi(g.position(i), g.normal(i)) < 0 ? 1 : 0,
  );
  const cuts = new Map<number, number>();
  const cut = (a: number, b: number): number => {
    if (side[a] === side[b]) return -1;
    const key = a < b ? a * nv + b : b * nv + a;
    const hit = cuts.get(key);
    if (hit !== undefined) return hit;
    // (From the same end for both triangles on the edge, even when their vertices are doubled.)
    const [u, w] = side[a] ? [a, b] : [b, a];
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 8; i++) {
      const t = (lo + hi) / 2;
      const q = g.at(u, w, t);
      if (phi(q.p, q.n) < 0) lo = t;
      else hi = t;
    }
    const t = Math.min(0.92, Math.max(0.08, (lo + hi) / 2));
    const q = g.at(u, w, t);
    const v = within(q.p, q.n, g.at(u, w, Math.max(0, t - 0.04))) ? g.add(u, w, t) : -1;
    cuts.set(key, v);
    return v;
  };
  const out: number[] = [];
  for (let f = 0; f < m.indices.length; f += 3) {
    const t = [m.indices[f] ?? 0, m.indices[f + 1] ?? 0, m.indices[f + 2] ?? 0];
    const e = [0, 1, 2].map((k) => cut(t[k] ?? 0, t[(k + 1) % 3] ?? 0));
    const n = e.filter((v) => v >= 0).length;
    // (Rotated so the pattern starts at a cut edge: a, ab, b, bc, c.)
    const r =
      n === 2
        ? e.findIndex((v, k) => v >= 0 && (e[(k + 1) % 3] ?? -1) >= 0)
        : Math.max(
            0,
            e.findIndex((v) => v >= 0),
          );
    const [a = 0, b = 0, c = 0] = [t[r], t[(r + 1) % 3], t[(r + 2) % 3]];
    const [ab = -1, bc = -1] = [e[r], e[(r + 1) % 3]];
    if (n === 0) out.push(a, b, c);
    else if (n === 1) out.push(a, ab, c, ab, b, c);
    else out.push(ab, b, bc, a, ab, bc, a, bc, c);
  }
  return out.length === m.indices.length ? m : g.mesh(out);
}

/** `m` with every triangle `colour` names (by its centre and the normal there) in that one flat
 *  colour, on corners of its own: its neighbours keep theirs, so the shape's edge is the mesh's
 *  edge. */
export function tinted(m: Mesh, colour: (centre: V, normal: V) => V | undefined): Mesh {
  const g = grower(m);
  const out: number[] = [];
  const mean = (a: V, b: V, c: V): V => [
    (a[0] + b[0] + c[0]) / 3,
    (a[1] + b[1] + c[1]) / 3,
    (a[2] + b[2] + c[2]) / 3,
  ];
  for (let f = 0; f < m.indices.length; f += 3) {
    const [a = 0, b = 0, c = 0] = [m.indices[f], m.indices[f + 1], m.indices[f + 2]];
    const n = mean(g.normal(a), g.normal(b), g.normal(c));
    const l = dmath.hypot(n[0], n[1], n[2]) || 1;
    const ink = colour(mean(g.position(a), g.position(b), g.position(c)), [
      n[0] / l,
      n[1] / l,
      n[2] / l,
    ]);
    out.push(...(ink ? [a, b, c].map((v) => g.add(v, v, 0, ink)) : [a, b, c]));
  }
  return g.mesh(out);
}

/** A far head with its ink (face-forms.ts `farInk`): sliced along each drawn outline, then
 *  every triangle inside a shape in that shape's flat colour (D615). */
export function inked(m: Mesh, ink: FarInk): Mesh {
  return tinted(
    ink.cuts.reduce((mesh, c) => slice(mesh, c.phi, c.within), m),
    ink.colour,
  );
}

/** How far along its normal a far vertex looks for each garment (its cell's error plus a vest). */
const PROBE = 0.022;
const PROBE_STEPS = 22;

/**
 * `m` recoloured by `sources`: every vertex the colour of the source garment that reaches
 * furthest out along the vertex normal (the one on top). A garment's shell is hollow, so its
 * field at the vertex alone says nothing about which lies on top: below two shells the inner one
 * is nearer. The colour blocks then follow the garments' edges instead of the far cell's grid.
 */
export function outermostColours(m: Mesh, sources: readonly GarmentLayer[]): Mesh {
  const fields = sources.map((l) =>
    sculptField(
      l.edits.filter((e) => !('op' in e && e.op === 'paint')),
      { color: l.color, mirror: 'y' },
    ),
  );
  const colors = new Float32Array(m.colors);
  for (let i = 0; i < m.positions.length / 3; i++) {
    const p: V = [
      m.positions[i * 3] ?? 0,
      m.positions[i * 3 + 1] ?? 0,
      m.positions[i * 3 + 2] ?? 0,
    ];
    const n: V = [m.normals[i * 3] ?? 0, m.normals[i * 3 + 1] ?? 0, m.normals[i * 3 + 2] ?? 0];
    let colour: V | null = null;
    // Outward first: the garment deepest inside at the first step that finds one is on top.
    for (let s = PROBE_STEPS; s >= 0 && !colour; s--) {
      const t = -PROBE + (2 * PROBE * s) / PROBE_STEPS;
      const q: V = [p[0] + n[0] * t, p[1] + n[1] * t, p[2] + n[2] * t];
      let low = 0;
      for (const f of fields) {
        const d = f.field(q);
        if (d < low) {
          low = d;
          colour = f.colorAt(q);
        }
      }
    }
    if (colour) colors.set(colour, i * 3);
  }
  return faceBlocks({ ...m, colors });
}

/**
 * `outermostColours` with clean edges (`GarmentOptions.farEdges`): every triangle the colour of the source garment that reaches
 * furthest out along the normal at its centre (the one on top). A garment's shell is hollow, so
 * its field at a point alone says nothing about which lies on top: below two shells the inner
 * one is nearer. The mesh is first sliced along each garment's own edge wherever no other
 * garment lies over it (`slice`), so the colour blocks end on the garments' edges: left to the
 * far cell's grid, a neckline was a star of 3 cm teeth and a band of tunic narrower than the
 * cell a row of spikes (D616).
 */
export function edgedColours(m: Mesh, sources: readonly GarmentLayer[]): Mesh {
  const fields = sources.map((l) =>
    sculptField(
      l.edits.filter((e) => !('op' in e && e.op === 'paint')),
      { color: l.color, mirror: 'y' },
    ),
  );
  const step = (2 * PROBE) / PROBE_STEPS;
  const along = (p: V, n: V, t: number): V => [p[0] + n[0] * t, p[1] + n[1] * t, p[2] + n[2] * t];
  /** Garment `i` along the normal at `p`: its least field value, and where its outer face is
   *  met coming in from outside (−∞: not there). */
  const reach = (i: number, p: V, n: V): { low: number; face: number } => {
    const f = fields[i]?.field ?? (() => 1);
    let low = Number.POSITIVE_INFINITY;
    let face = Number.NEGATIVE_INFINITY;
    let before = 1;
    for (let s = PROBE_STEPS; s >= 0; s--) {
      const t = -PROBE + step * s;
      const d = f(along(p, n, t));
      // (The face between two samples, by their values: garments 2 mm apart keep their order.)
      if (d < 0 && face === Number.NEGATIVE_INFINITY)
        face = s === PROBE_STEPS ? t : t + (step * -d) / (before - d);
      low = Math.min(low, d);
      before = d;
    }
    return { low, face };
  };
  /** The garment on top: the one whose outer face lies furthest out (−1: none). */
  const top = (p: V, n: V): number => {
    let on = -1;
    let best = Number.NEGATIVE_INFINITY;
    fields.forEach((_f, i) => {
      const face = reach(i, p, n).face;
      if (face > best) {
        best = face;
        on = i;
      }
    });
    return on;
  };
  /** Garment `i`'s own colour just inside its outer face. */
  const colourOf = (i: number, p: V, n: V): V | undefined => {
    const face = reach(i, p, n).face;
    return face === Number.NEGATIVE_INFINITY
      ? undefined
      : fields[i]?.colorAt(along(p, n, face - 0.0005));
  };
  const cut = fields.reduce(
    (mesh, _f, i) =>
      slice(
        mesh,
        (p, n) => reach(i, p, n).low,
        // (An edge under another garment shows nowhere: cut only where the garment is the one
        // on top just inside its edge.)
        (_p, _n, inside) => top(inside.p, inside.n) === i,
      ),
    m,
  );
  return faceBlocks(tinted(cut, (p, n) => colourOf(top(p, n), p, n)));
}

/**
 * One colour per triangle: the medoid of its three vertex colours (the one nearest the other
 * two), on unwelded corners. Where a garment's edge crosses a far cell's triangles, a mixed
 * triangle otherwise shades as a muddy blend of both garments; as blocks, each triangle is one
 * garment or the other. Positions, normals and UVs are kept, so the surface still shades smooth.
 */
export function faceBlocks(m: Mesh): Mesh {
  const t = m.indices.length;
  const positions = new Float32Array(t * 3);
  const normals = new Float32Array(t * 3);
  const uvs = new Float32Array(t * 2);
  const colors = new Float32Array(t * 3);
  const col = (i: number): V => [
    m.colors[i * 3] ?? 0,
    m.colors[i * 3 + 1] ?? 0,
    m.colors[i * 3 + 2] ?? 0,
  ];
  const d = (a: V, b: V): number =>
    Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  for (let f = 0; f < t; f += 3) {
    const ids = [m.indices[f] ?? 0, m.indices[f + 1] ?? 0, m.indices[f + 2] ?? 0];
    const cs = ids.map(col);
    const cost = cs.map((c) => cs.reduce((s, o) => s + d(c, o), 0));
    const pick = cs[cost.indexOf(Math.min(...cost))] ?? col(ids[0] ?? 0);
    ids.forEach((v, k) => {
      const o = f + k;
      for (let c = 0; c < 3; c++) {
        positions[o * 3 + c] = m.positions[v * 3 + c] ?? 0;
        normals[o * 3 + c] = m.normals[v * 3 + c] ?? 0;
        colors[o * 3 + c] = pick[c] ?? 0;
      }
      uvs[o * 2] = m.uvs[v * 2] ?? 0;
      uvs[o * 2 + 1] = m.uvs[v * 2 + 1] ?? 0;
    });
  }
  // (A fresh sculpt: no skin or morphs to carry over.)
  return { positions, normals, uvs, colors, indices: Uint32Array.from({ length: t }, (_, i) => i) };
}

/** Dust when a recipe gives no colour (the weather pass's own default). */
const FAR_DUST: V = [0.5, 0.44, 0.35];

/**
 * The far LOD's even dust: every vertex moved toward `color` by `k` times how much it faces up
 * (a smooth ramp on its normal), so the shoulders and the top of the chest settle a tone paler
 * without a single per-vertex blotch.
 */
export function settled(m: Mesh, color: V, k: number): Mesh {
  const colors = new Float32Array(m.colors);
  for (let i = 0; i < m.positions.length / 3; i++) {
    const up = Math.min(1, Math.max(0, ((m.normals[i * 3 + 2] ?? 0) - 0.2) / 0.6));
    for (let c = 0; c < 3; c++) {
      const v = colors[i * 3 + c] ?? 0;
      colors[i * 3 + c] = v + ((color[c] ?? 0) - v) * k * up;
    }
  }
  return { ...m, colors };
}

/** Smooth maximum (a fillet of radius ≈ k where two surfaces intersect). */
const smax = (a: number, b: number, k: number): number => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
};

const EVERYWHERE: [V, V] = [
  [-2, -2, -1],
  [2, 2, 3],
];

/** The layers as meshes by part name: each on its strip, faired (a cut edge a cell thick meshes
 *  as a saw-tooth, ironed into a clean line), worn, AO-baked against all of them. */
export function garmentParts(
  ctx: BuildContext,
  layers: readonly GarmentLayer[],
  o: GarmentOptions = {},
): Record<string, Mesh> {
  const lod = ctx.lod;
  const cut = o.cut;
  const meshes: Record<string, Mesh> = {};
  for (const l of layers) {
    const edits: SculptEdit[] = cut
      ? [
          {
            group: [...l.edits, { field: cut, bounds: EVERYWHERE, op: 'intersect', blend: 0.003 }],
          },
          {
            field: (p) => -cut(p) - 0.0015,
            bounds: EVERYWHERE,
            op: 'paint',
            blend: 0.001,
            color: [
              l.color[0] * SECTION_SHADE,
              l.color[1] * SECTION_SHADE,
              l.color[2] * SECTION_SHADE,
            ],
          },
        ]
      : l.edits;
    // (On its strip per triangle after fairing: the mesher's per-vertex axes grey a sleeve, D578.)
    const raw = onCloth(
      fair(
        sculpt({
          edits,
          resolution: ctx.pick(l.cell),
          color: l.color,
          mirror: 'y',
          strip: l.strip,
        }),
        // (LOD2 with `farEdges`, four passes: a neckline's cell-deep steps ironed too, D616.)
        { iterations: lod < 2 ? 8 : o.farEdges ? 4 : 0, keep: 'none' },
      ),
      l.strip,
    );
    const toned = l.sources
      ? (o.farEdges ? edgedColours : outermostColours)(raw, l.sources)
      : l.cutThrough
        ? sectionColours(raw, l.cutThrough)
        : raw;
    meshes[l.name] = lod === 2 && o.far ? o.far(toned, l) : toned;
  }
  let worn = meshes;
  if (o.wear) {
    const names = o.wear.layers;
    const picked = Object.fromEntries(
      Object.entries(meshes).filter(([name]) => !names || names.includes(name)),
    );
    const dust = o.wear.options.effects?.dust;
    if (Object.keys(picked).length > 0)
      worn = {
        ...meshes,
        ...(lod < 2 && !o.wear.even
          ? weather(ctx, picked, o.wear.options)
          : dust
            ? Object.fromEntries(
                Object.entries(picked).map(([name, m]) => [
                  name,
                  settled(
                    m,
                    dust.color ?? FAR_DUST,
                    (dust.amount ?? 0.5 * (o.wear?.options.age ?? 0.5)) * (dust.strength ?? 0.5),
                  ),
                ]),
              )
            : {}),
      };
  }
  const all = merge(Object.values(worn));
  const parts: Record<string, Mesh[]> = {};
  for (const l of layers) {
    const m = worn[l.name];
    if (m) parts[l.part] = [...(parts[l.part] ?? []), m];
  }
  return Object.fromEntries(
    Object.entries(parts).map(([name, list]) => {
      const m = merge(list);
      return [
        name,
        lod < 2
          ? bakeAo(m, { samples: ctx.pick([12, 8, 6]), radius: 0.06, strength: 0.5 }, all)
          : m,
      ];
    }),
  );
}

/** A bust's outfit as layers. */
export interface Dress extends GarmentOptions {
  /** The layers on the full stage-2 anatomy. */
  readonly layers: (skin: Surface, lod: number) => GarmentLayer[];
  /** The body the outfit hides (≤ 0 = hidden), from the full anatomy's field. */
  readonly hidden: (skin: Field) => Field;
  /** The torso's masses; with `keep` (≤ 0 = kept) only what can show. */
  readonly body: (keep?: Field) => SculptEdit[];
  /** What the built skin changes in the dressed recipe (a far LOD's own hair or face edits). */
  readonly built?: Partial<BustRecipe>;
  /** Part options by garment part (a finish). */
  readonly parts?: Readonly<Record<string, PartOptions>>;
}

/**
 * The dressed bust: `b` is the whole dressed sculpt (what the proportion and cloth checks measure
 * and the hair falls round); the skin is built from it without the outfit and without the body
 * the outfit hides, then the garments as their own parts under `face`. Returns the full stage-2
 * anatomy the garments lie on (for the recipe's own fittings).
 */
export function buildDressedBust(ctx: BuildContext, b: BustRecipe, d: Dress): Surface {
  const lod = ctx.lod;
  const skin = bustEdits(b, 2, lod).skin;
  const hidden = d.hidden(skin.field);
  // A saw cut goes through cloth and body alike. The garments are shells, so behind the cut
  // face a plug of the hidden body fills their section: a slab two and a half bust cells deep,
  // its inner wall rounded into the body (a sharp wall would smooth its normals across the
  // fold), in the section's shade. It is a garment layer, not skin: on the skin parts the sheen
  // finish lit the cut face up as a pale oval (the skin itself stops 4 mm short of the cut,
  // bust.ts `skullStage`).
  const cut = d.cut ?? b.saw;
  const dark = b.section ?? SECTION;
  const cell = ctx.pick(b.cells.bust);
  const slab = Math.max(0.012, cell * 2.5);
  const k = slab * 0.5;
  const layers = d.layers(skin, lod);
  // The garments' solids: a skin part left wholly inside them is not built.
  const covered = sculptField(
    layers.flatMap((l) => l.edits.filter((e) => !('op' in e && e.op === 'paint'))),
    { color: [0, 0, 0], mirror: 'y' },
  ).field;
  // The far head's mouth and brows, drawn on its mesh (D615), for a bust with far forms. (The lips 0.7 of the way from the
  // skin to their zone's colour: flat, the full colour was brighter than LOD0's shaded lips.)
  const lips = b.zones?.lips ?? b.spec.lips;
  const ink =
    b.skull && b.far
      ? farInk(skullLandmarks(skullOf(b.skull, b.spec)), b.spec.H, {
          lips: [0, 1, 2].map((c) => {
            const skinTone = b.spec.skin[c as 0 | 1 | 2];
            return skinTone + (lips[c as 0 | 1 | 2] - skinTone) * 0.7;
          }) as [number, number, number],
          dark: b.tone.cavity,
          ...(b.zones?.brows ? { brows: b.zones.brows } : {}),
        })
      : undefined;
  buildBust(
    ctx,
    { ...b, ...d.built, body: () => d.body((p) => -hidden(p)), outfit: () => [] },
    // (The skin under the outfit is cut away too: nobody sees it, D584.)
    { skin, hidden, covered, ...(ink ? { farHead: (m: Mesh): Mesh => inked(m, ink) } : {}) },
  );
  const first = layers[0];
  // (Coloured by the garments it cuts through, not a dark neutral, D579.)
  const cloth = layers.flatMap((l) => l.sources ?? [l]);
  if (cut && first)
    layers.push({
      name: 'section',
      ...(b.section ? {} : { cutThrough: cloth }),
      strip: first.strip,
      color: dark,
      cell: [cell, cell, cell],
      part: first.part,
      edits: [
        {
          field: (p) => {
            const c = cut(p);
            // (Cheap bounds away from the slab: the anatomy's field is the costly part.)
            if (c > 0.004) return c;
            if (c < -slab - k) return -(c + slab);
            const inner = smax(skin.field(p), -(c + slab), k);
            // (Its face a millimetre and a half inside the cloth's: never proud of the cut.)
            return smax(smax(inner, hidden(p), 0.004), c + 0.0015, 0.003);
          },
          bounds: [
            [-0.4, -0.4, 0],
            [0.4, 0.4, b.l.mz],
          ],
          color: dark,
        },
      ],
    });
  const rig = faceRigOf(b);
  const options: GarmentOptions = { ...d, ...(cut ? { cut } : {}) };
  for (const [name, m] of Object.entries(garmentParts(ctx, layers, options)))
    ctx.part(name, faceMorphs(m, rig), { parent: 'face', ...d.parts?.[name] });
  return skin;
}
