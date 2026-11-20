// Material swatches: every trim-sheet strip and cell on a labelled panel — the visual test of the
// procedural material generator. Stepped plinths, rows of ≤ 34 m in sheet order: every one of the 42 strips is a panel exactly one repeat wide (`stripRect(id).metres`:
// 4 m classic/library/bark, 16 m ground, 32 m rock) and as tall as its design height
// (`DEFAULT_SHEET` scaleMetres), so one panel face = one strip rect at true scale; classic strips
// tinted by a representative colour, the rest NATURAL. In front of each panel a ball in the same
// strip shows how it shades on curvature (LOD0). Back row: the decal and foliage cells, 1 m each.
// Labels: flush 5 × 7 letters sized to the panel (LOD0), one greeked quad each (LOD1). A 1.8 m
// figure stands at the front row for scale; plinths darken toward the ground.
// Export with `--sheet` (or `toGlb(a, { sheet: paintTrimSheet() })`) to see the textures; the
// contact sheet is vertex colour only.

import {
  box,
  type CellId,
  CLASSIC_STRIPS,
  cellRect,
  DECAL_CELLS,
  DEFAULT_SHEET,
  defineAsset,
  dmath,
  FOLIAGE_CELLS,
  hex,
  type Lod,
  lathe,
  MATERIAL_STRIPS,
  type Mesh,
  MeshBuilder,
  measureText,
  merge,
  NATURAL,
  NATURE_STRIPS,
  type StripId,
  stripRect,
  text as textMesh,
  type Vec2,
  type Vec3,
} from '@developerz.ai/ts23d';

const STONE = hex('#9c968c');
const INK = hex('#1c1c1c');
const TINT: Readonly<Partial<Record<StripId, Vec3>>> = {
  plain: hex('#e8e4dc'),
  brick: hex('#9a4a32'),
  stone: hex('#c8bba0'),
  slate: hex('#4a5058'),
  iron: hex('#3f4a3a'),
  wood: hex('#8a6440'),
  glass: hex('#9fc0d0'),
  concrete: hex('#a7a39b'),
};

/**
 * The label cap height for a panel w wide on a plinth face `face` tall: 8 % of the panel width (a
 * 4 m panel gets 0.32 m letters, readable across the whole 30 m stand in the hero), at most 60 % of
 * the face and 0.5 m. Long names still shrink to fit 90 % of the panel (`maxWidth`).
 */
export const capOf = (w: number, face: number): number => Math.min(0.6 * face, 0.08 * w, 0.5);

/**
 * Label on a +X-facing plinth face at x = `faceX`, centred on `y`, vertically centred on a face
 * `face` tall. LOD0 sets it in flush 5 × 7 pixel letters; LOD1 greeks it to one dark quad as wide
 * as the word (the row still reads as labelled); LOD2 drops it.
 */
function label(
  text: string,
  faceX: number,
  y: number,
  face: number,
  w: number,
  lod: Lod,
  span = w * 0.9,
): Mesh[] {
  if (lod === 2) return [];
  const str = text.replace(/_/g, ' ').toUpperCase();
  const height = capOf(w, face);
  const z = (face - height) / 2;
  if (lod === 1) {
    const width = Math.min(measureText(str, { height, font: '5x7' }), span);
    return [
      box({
        size: [0.002, width, height],
        at: [faceX + 0.001, y, z],
        color: INK,
        omit: ['back', 'left', 'right', 'top', 'bottom'],
      }),
    ];
  }
  return [
    textMesh(str, {
      origin: [faceX, y, z],
      height,
      color: INK,
      font: '5x7',
      align: 'centre',
      maxWidth: span,
    }),
  ];
}

/** Ground-contact occlusion: darken a mesh's vertices toward its base (one cause, no texture). */
function occlude(m: Mesh, z0: number, reach: number, k = 0.55): Mesh {
  const colors = new Float32Array(m.colors);
  for (let v = 0; v < colors.length / 3; v++) {
    const t = Math.min(1, Math.max(0, ((m.positions[v * 3 + 2] ?? 0) - z0) / reach));
    const f = k + (1 - k) * t;
    for (let c = 0; c < 3; c++) colors[v * 3 + c] = (colors[v * 3 + c] ?? 0) * f;
  }
  return { ...m, colors };
}

/** Profile of a sphere of radius r sitting on z = 0, `n` steps pole to pole. */
const ball = (r: number, n: number): Vec2[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = (Math.PI * i) / n;
    return [r * dmath.sin(a), r - r * dmath.cos(a)] as Vec2;
  });

/** A 1.8 m standing figure for scale (feet at the origin, facing +X), plain grey. */
function figure(): Mesh {
  const g = hex('#8c8f93');
  return merge([
    box({ size: [0.14, 0.13, 0.86], at: [0, -0.09, 0], color: g }),
    box({ size: [0.14, 0.13, 0.86], at: [0, 0.09, 0], color: g }),
    box({ size: [0.24, 0.42, 0.62], at: [0, 0, 0.86], color: g }),
    box({ size: [0.1, 0.09, 0.62], at: [0, -0.25, 0.84], color: g }),
    box({ size: [0.1, 0.09, 0.62], at: [0, 0.25, 0.84], color: g }),
    box({ size: [0.08, 0.08, 0.1], at: [0, 0, 1.47], color: g }),
    lathe({ profile: ball(0.135, 6), segments: 10, color: g, at: [0, 0, 1.53] }),
  ]);
}

/** A +X-facing quad mapping one cell rect: left→right = u0→u1 along +Y, bottom→top = v0→v1. */
function cellQuad(id: CellId, x: number, y: number, z: number, size: number, color: Vec3): Mesh {
  const r = cellRect(id);
  const b = new MeshBuilder();
  const n: Vec3 = [1, 0, 0];
  const h = size / 2;
  const v = (dy: number, dz: number, u: number, w: number): number =>
    b.vertex({ p: [x, y + dy, z + dz], n, uv: [u, w], color });
  b.quad(
    v(-h, 0, r.u0, r.v0),
    v(h, 0, r.u1, r.v0),
    v(h, size, r.u1, r.v1),
    v(-h, size, r.u0, r.v1),
  );
  return b.build();
}

const GAP = 0.4;
/** Row k of strip panels: x of the panel face line, plinth top. Rows step back and up. */
// The front row's plinth face is 0.54 m tall so its labels can be set as large as the rows behind
// (a 4 m panel's 0.32 m cap fits in 60 % of it).
export const row = (k: number) => ({ x: -k * 2.2, top: 0.54 + k * 0.7 });
const REAR = { depth: 1.2, gap: 0.15 };

const widthOf = (id: StripId): number => stripRect(id).metres;
/** Rows ≤ 34 m: strips in sheet order (classic, library, nature) packed greedily, so a 32 m rock
 *  repeat gets its own row and four 4 m panels share one; the stand stays roughly square. */
const ROWS: readonly (readonly StripId[])[] = (() => {
  const out: StripId[][] = [];
  let cur: StripId[] = [];
  let len = 0;
  for (const id of [...CLASSIC_STRIPS, ...MATERIAL_STRIPS, ...NATURE_STRIPS] as StripId[]) {
    const w = widthOf(id) + (cur.length ? GAP : 0);
    if (cur.length && len + w > 34) {
      out.push(cur);
      cur = [];
      len = 0;
    }
    len += widthOf(id) + (cur.length ? GAP : 0);
    cur.push(id);
  }
  if (cur.length) out.push(cur);
  return out;
})();

const rowSpan = (ids: readonly StripId[]): number =>
  ids.reduce((s, id) => s + widthOf(id), 0) + (ids.length - 1) * GAP;

export const material_swatches = defineAsset({
  name: 'material_swatches',
  kind: 'prop',
  tags: ['material', 'test-card'],
  description:
    'All 42 trim-sheet strips (one true-scale repeat each) and every cell on labelled panels: the material library test card.',
  // 42 strip panels + labels + cells at LOD0; boxes only beyond.
  budget: { triangles: [30000, 1500, 1000] },
  build(ctx) {
    const cells: readonly CellId[] = [...DECAL_CELLS, ...FOLIAGE_CELLS];
    const cellSpan = cells.length + (cells.length - 1) * REAR.gap;
    ROWS.forEach((ids, k) => {
      const r = row(k);
      const span = rowSpan(ids) + 0.4;
      ctx.part(
        `plinth_${k}`,
        occlude(box({ size: [1.2, span, r.top], at: [r.x, 0, 0], color: STONE }), 0, r.top + 0.4),
      );
      let y = -rowSpan(ids) / 2;
      for (const id of ids) {
        const w = widthOf(id);
        const h = DEFAULT_SHEET.strips[id]?.scaleMetres ?? 1;
        const c = y + w / 2;
        const panel = box({
          size: [0.06, w, h],
          at: [r.x, c, r.top],
          color: TINT[id] ?? NATURAL,
          strip: id,
        });
        const glass = id === 'glass' ? ({ surface: 'glass' } as const) : {};
        ctx.part(`strip_${id}`, panel, glass);
        if (ctx.lod === 0)
          // A ball in the strip, on the plinth in front of the panel's left end: the strip on
          // curvature, under the same light (roughness, metal and normal read on its highlight).
          ctx.part(
            `ball_${id}`,
            lathe({
              profile: ball(0.18, 10),
              segments: 20,
              color: TINT[id] ?? NATURAL,
              strip: id,
              at: [r.x + 0.36, y + 0.3, r.top],
            }),
            { ...glass, connect: { as: 'rest', to: `plinth_${k}` } },
          );
        const words = label(id, r.x + 0.6, c, r.top, w, ctx.lod);
        if (words.length) ctx.part(`label_${id}`, merge(words));
        y += w + GAP;
      }
    });
    // Scale: a 1.8 m figure on the ground beside the front row's −Y end.
    ctx.part('figure', figure(), { at: [0.9, -rowSpan(ROWS[0] ?? []) / 2 - 0.8, 0] });
    const back = row(ROWS.length);
    ctx.part(
      'plinth_cells',
      occlude(
        box({ size: [REAR.depth, cellSpan + 0.4, back.top], at: [back.x, 0, 0], color: STONE }),
        0,
        back.top + 0.4,
      ),
    );
    const rearFace = back.x + REAR.depth / 2;

    cells.forEach((id, i) => {
      const y = -cellSpan / 2 + 0.5 + i * (1 + REAR.gap);
      const foliage = id.startsWith('foliage_');
      if (foliage) {
        // A leaf card standing on its anchor edge, white so the painted colour reads true.
        ctx.part(`cell_${id}`, cellQuad(id, back.x, y, back.top, 1, [1, 1, 1]), {
          surface: 'cutout',
        });
      } else {
        const plate = box({
          size: [0.06, 1, 1],
          at: [back.x, y, back.top],
          color: TINT.plain ?? NATURAL,
        });
        ctx.part(
          `cell_${id}`,
          merge([plate, cellQuad(id, back.x + 0.032, y, back.top, 1, TINT.plain ?? NATURAL)]),
        );
      }
      const words = label(id.replace('foliage_', ''), rearFace, y, back.top, 2.5, ctx.lod, 1);
      if (words.length) ctx.part(`label_${id}`, merge(words));
    });
  },
});
