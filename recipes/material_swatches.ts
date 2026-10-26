// Material swatches: every trim-sheet strip and cell on a labelled panel — the visual test of the
// procedural material generator. Front plinth: the 8 strips, each a 2 m wide panel as tall as the
// strip's design height (`DEFAULT_SHEET` scaleMetres), so one panel face = one strip rect at true
// scale, tinted by a representative vertex colour. Rear, raised plinth: the 6 decal cells and the
// 11 foliage cells (cutout leaf cards standing on their anchor), 1 m each. Labels are block
// letters (3×5 font, merged pixel runs) on the plinth faces, LOD0 only.
// Export with `--sheet` (or `toGlb(a, { sheet: paintTrimSheet() })`) to see the textures; the
// contact sheet is vertex colour only.

import {
  box,
  type CellId,
  cellRect,
  DECAL_CELLS,
  DEFAULT_SHEET,
  defineAsset,
  FOLIAGE_CELLS,
  hex,
  type Mesh,
  MeshBuilder,
  merge,
  STRIPS,
  type StripId,
  type Vec3,
} from '@developerz-ai/ts23d';

const STONE = hex('#9c968c');
const INK = hex('#1c1c1c');
const TINT: Readonly<Record<StripId, Vec3>> = {
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

const FRONT = { x: 0, depth: 1.2, height: 0.2, gap: 0.4 };
const REAR = { x: -1.6, depth: 1.2, height: 1.4, gap: 0.15 };

export const material_swatches = defineAsset({
  name: 'material_swatches',
  kind: 'prop',
  description:
    'Every trim-sheet strip and cell on labelled panels: the material generator test card.',
  budget: { triangles: [16000, 1200, 800] },
  build(ctx) {
    const stripSpan = STRIPS.length * 2 + (STRIPS.length - 1) * FRONT.gap;
    const cells: readonly CellId[] = [...DECAL_CELLS, ...FOLIAGE_CELLS];
    const cellSpan = cells.length + (cells.length - 1) * REAR.gap;
    const span = Math.max(stripSpan, cellSpan) + 0.4;
    ctx.part(
      'plinth_front',
      box({ size: [FRONT.depth, span, FRONT.height], at: [FRONT.x, 0, 0], color: STONE }),
    );
    ctx.part(
      'plinth_rear',
      box({ size: [REAR.depth, span, REAR.height], at: [REAR.x, 0, 0], color: STONE }),
    );
    const frontFace = FRONT.x + FRONT.depth / 2;
    const rearFace = REAR.x + REAR.depth / 2;

    STRIPS.forEach((id, i) => {
      const y = -stripSpan / 2 + 1 + i * (2 + FRONT.gap);
      const h = DEFAULT_SHEET.strips[id]?.scaleMetres ?? 1;
      const panel = box({
        size: [0.06, 2, h],
        at: [FRONT.x, y, FRONT.height],
        color: TINT[id],
        strip: id,
      });
      ctx.part(`strip_${id}`, panel, id === 'glass' ? { surface: 'glass' } : {});
      if (ctx.lod === 0) ctx.part(`label_${id}`, label(id, frontFace, y, 0.04, 0.024));
    });

    cells.forEach((id, i) => {
      const y = -cellSpan / 2 + 0.5 + i * (1 + REAR.gap);
      const foliage = id.startsWith('foliage_');
      if (foliage) {
        // A leaf card standing on its anchor edge, white so the painted colour reads true.
        ctx.part(`cell_${id}`, cellQuad(id, REAR.x, y, REAR.height, 1, [1, 1, 1]), {
          surface: 'cutout',
        });
      } else {
        const back = box({ size: [0.06, 1, 1], at: [REAR.x, y, REAR.height], color: TINT.plain });
        ctx.part(
          `cell_${id}`,
          merge([back, cellQuad(id, REAR.x + 0.032, y, REAR.height, 1, TINT.plain)]),
        );
      }
      if (ctx.lod === 0)
        ctx.part(
          `label_${id}`,
          label(id.replace('foliage_', ''), rearFace, y, REAR.height - 0.12, 0.016),
        );
    });
  },
});
