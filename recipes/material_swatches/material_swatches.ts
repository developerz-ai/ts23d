// Material swatches: every trim-sheet strip and cell on a labelled panel — the visual test of the
// procedural material generator. Stepped plinths, rows of ≤ 34 m in sheet order: every one of the 42 strips is a panel exactly one repeat wide (`stripRect(id).metres`:
// 4 m classic/library/bark, 16 m ground, 32 m rock) and as tall as its design height
// (`DEFAULT_SHEET` scaleMetres), so one panel face = one strip rect at true scale; classic strips
// tinted by a representative colour, the rest NATURAL. Back row: the decal and foliage cells, 1 m
// each. Labels are block letters (3×5 font, merged pixel runs) on the plinth faces, LOD0 only.
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
  FOLIAGE_CELLS,
  hex,
  MATERIAL_STRIPS,
  type Mesh,
  MeshBuilder,
  merge,
  NATURAL,
  NATURE_STRIPS,
  type StripId,
  stripRect,
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

// 3×5 glyphs, one 3-bit row per entry, top row first (bit 4 = left column).
const FONT: Readonly<Record<string, readonly number[]>> = {
  a: [2, 5, 7, 5, 5],
  b: [6, 5, 6, 5, 6],
  c: [3, 4, 4, 4, 3],
  d: [6, 5, 5, 5, 6],
  e: [7, 4, 6, 4, 7],
  f: [7, 4, 6, 4, 4],
  g: [3, 4, 5, 5, 3],
  h: [5, 5, 7, 5, 5],
  i: [7, 2, 2, 2, 7],
  j: [1, 1, 1, 5, 2],
  k: [5, 5, 6, 5, 5],
  l: [4, 4, 4, 4, 7],
  m: [5, 7, 7, 5, 5],
  n: [6, 5, 5, 5, 5],
  o: [2, 5, 5, 5, 2],
  p: [6, 5, 6, 4, 4],
  q: [2, 5, 5, 6, 3],
  r: [6, 5, 6, 5, 5],
  s: [3, 4, 2, 1, 6],
  t: [7, 2, 2, 2, 2],
  u: [5, 5, 5, 5, 7],
  v: [5, 5, 5, 5, 2],
  w: [5, 5, 7, 7, 5],
  x: [5, 5, 2, 5, 5],
  y: [5, 5, 2, 2, 2],
  z: [7, 1, 2, 4, 7],
};

/**
 * Block-letter label on a +X-facing plane at x = `faceX`, centred on `y`, baseline at `z`,
 * reading along +Y (a viewer at +X). Horizontal pixel runs merge into one box each.
 */
function label(text: string, faceX: number, y: number, z: number, px: number): Mesh {
  const parts: Mesh[] = [];
  const chars = [...text.replace(/_/g, ' ')];
  const width = chars.length * 4 * px - px;
  chars.forEach((ch, i) => {
    const rows = FONT[ch];
    if (!rows) return;
    const left = y - width / 2 + i * 4 * px;
    rows.forEach((bits, r) => {
      let c = 0;
      while (c < 3) {
        if (!((bits >> (2 - c)) & 1)) {
          c++;
          continue;
        }
        let run = 0;
        while (c + run < 3 && (bits >> (2 - c - run)) & 1) run++;
        parts.push(
          box({
            size: [0.004, run * px, px],
            at: [faceX + 0.002, left + (c + run / 2) * px, z + (4 - r) * px],
            color: INK,
            omit: ['back'],
          }),
        );
        c += run;
      }
    });
  });
  return merge(parts);
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
const row = (k: number) => ({ x: -k * 2.2, top: 0.2 + k * 0.7 });
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
      ctx.part(`plinth_${k}`, box({ size: [1.2, span, r.top], at: [r.x, 0, 0], color: STONE }));
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
        ctx.part(`strip_${id}`, panel, id === 'glass' ? { surface: 'glass' } : {});
        if (ctx.lod === 0) ctx.part(`label_${id}`, label(id, r.x + 0.6, c, r.top - 0.16, 0.024));
        y += w + GAP;
      }
    });
    const back = row(ROWS.length);
    ctx.part(
      'plinth_cells',
      box({ size: [REAR.depth, cellSpan + 0.4, back.top], at: [back.x, 0, 0], color: STONE }),
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
      if (ctx.lod === 0)
        ctx.part(
          `label_${id}`,
          label(id.replace('foliage_', ''), rearFace, y, back.top - 0.12, 0.016),
        );
    });
  },
});
