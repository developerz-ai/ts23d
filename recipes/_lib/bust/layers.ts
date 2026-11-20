// Garment layers of a dressed bust. A garment is a closed solid of its own (cloth-garment.ts),
// one layer per material: this meshes each layer on its strip at its LOD's cell, irons the cut
// edges, saws the layers off with the torso's arm cut, weathers the ones that carry the road,
// bakes AO across all of them and merges them into the parts the asset names. `buildDressedBust`
// wraps the shared bust builder round it: the skin is built without the body the outfit hides,
// the garments ride the same `face` node (they breathe with the chest), and the recipe's hard
// extras get the FULL anatomy to sit on, not the cut one.

import {
  type BuildContext,
  bakeAo,
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
import { type BustRecipe, buildBust, bustEdits, SECTION } from './bust.ts';
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

/** The layers as meshes by part name: each on its strip, faired (LOD0/1: a cut edge a cell thick
 *  meshes as a saw-tooth, ironed into a clean line), worn, AO-baked against all of them. */
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
            color: [l.color[0] * 0.55, l.color[1] * 0.55, l.color[2] * 0.55],
          },
        ]
      : l.edits;
    const raw = fair(
      sculpt({ edits, resolution: ctx.pick(l.cell), color: l.color, mirror: 'y', strip: l.strip }),
      { iterations: lod < 2 ? 8 : 0, keep: 'none' },
    );
    const toned = l.sources ? outermostColours(raw, l.sources) : raw;
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
  buildBust(
    ctx,
    { ...b, ...d.built, body: () => d.body((p) => -hidden(p)), outfit: () => [] },
    { skin },
  );
  const layers = d.layers(skin, lod);
  const first = layers[0];
  if (cut && first)
    layers.push({
      name: 'section',
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
