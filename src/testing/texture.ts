// Trim-sheet assertions: a strip wraps without a seam (the jump across its U edge is no bigger
// than a normal step inside it), strips do not bleed into each other (each strip's top/bottom
// gutter replicates its own edge row, so mips never sample the neighbour), and the values are
// physically plausible (albedo 30–240 sRGB, roughness not mirror-like, metalness 0 or 1, normals
// facing out of the surface).
//   it('sheet wraps', () => assertTileable(sheet.albedo, { width: 4096, rows: [0, 64] }));

import { STRIP_H, STRIP_ROWS } from '../material/index.ts';
import type { Finding } from '../qa/index.ts';
import { failOn } from './compiled.ts';
import type { Image } from './image-png.ts';

/** A painted sheet's maps (RGBA8, `size`²) — what paintTrimSheet returns. */
export interface SheetMaps {
  readonly size: number;
  readonly albedo: Uint8Array;
  readonly normal?: Uint8Array;
  readonly orm?: Uint8Array;
}

export interface TileOptions {
  /** Pixel rows to check, [from, to). Default all. */
  readonly rows?: readonly [number, number];
  /** 'x' = wraps left↔right (strips), 'y' = top↔bottom, 'both' (cells, tiles). Default 'x'. */
  readonly axis?: 'x' | 'y' | 'both';
  /** Seam step allowed, as a multiple of the mean step inside. Default 3. */
  readonly ratio?: number;
}

/** Mean |Δ| across the wrap seam and between neighbouring columns (rows) inside. */
export function seamStep(
  img: Image,
  axis: 'x' | 'y',
  rows?: readonly [number, number],
): { seam: number; inner: number } {
  const [y0, y1] = rows ?? [0, img.height];
  const at = (x: number, y: number, k: number): number =>
    img.data[(y * img.width + x) * 4 + k] ?? 0;
  let seam = 0;
  let inner = 0;
  let ns = 0;
  let ni = 0;
  const lum = (x: number, y: number): number => (at(x, y, 0) + at(x, y, 1) + at(x, y, 2)) / 3;
  if (axis === 'x') {
    for (let y = y0; y < y1; y++) {
      seam += Math.abs(lum(img.width - 1, y) - lum(0, y));
      ns++;
      for (let x = 1; x < img.width; x += 7) {
        inner += Math.abs(lum(x, y) - lum(x - 1, y));
        ni++;
      }
    }
  } else {
    for (let x = 0; x < img.width; x++) {
      seam += Math.abs(lum(x, y1 - 1) - lum(x, y0));
      ns++;
      for (let y = y0 + 1; y < y1; y += 7) {
        inner += Math.abs(lum(x, y) - lum(x, y - 1));
        ni++;
      }
    }
  }
  return { seam: ns ? seam / ns : 0, inner: ni ? inner / ni : 0 };
}

/** The image (or a strip band of it) wraps without a visible seam. Returns the worst ratio. */
export function assertTileable(img: Image, o: TileOptions = {}): number {
  const axes: ('x' | 'y')[] = o.axis === 'both' ? ['x', 'y'] : [o.axis ?? 'x'];
  const lim = o.ratio ?? 3;
  let worst = 0;
  const found = axes.flatMap((axis): Finding[] => {
    const s = seamStep(img, axis, o.rows);
    const r = s.seam / Math.max(s.inner, 1);
    worst = Math.max(worst, r);
    return r <= lim
      ? []
      : [
          {
            gate: 'tileable',
            code: 'T3D_QA_TILEABLE',
            message: `wrapping ${axis === 'x' ? 'left↔right' : 'top↔bottom'}${o.rows ? ` (rows ${o.rows[0]}–${o.rows[1]})` : ''} jumps ${s.seam.toFixed(1)} vs ${s.inner.toFixed(1)} inside (×${r.toFixed(1)} > ×${lim})`,
            fix: 'paint with periodic noise/patterns whose period divides the strip (tex fields wrap when sized to the span), or cross-fade the edges',
          },
        ];
  });
  failOn(
    'texture',
    found.map((finding) => ({ finding })),
  );
  return worst;
}

export const rowsOf = (size: number): { h: number; pad: number } => {
  const h = Math.round(size * STRIP_H);
  return { h, pad: Math.max(2, Math.round(h / 8)) };
};

/** Each strip row's gutter (`pad` rows at its top and bottom) equals its own edge row. */
export function assertNoBleed(
  sheet: SheetMaps,
  o: { strips?: number; tolerance?: number } = {},
): void {
  const { h, pad } = rowsOf(sheet.size);
  const tol = o.tolerance ?? 2;
  const W = sheet.size * 4;
  const found: Finding[] = [];
  const maps = [
    ['albedo', sheet.albedo],
    ['normal', sheet.normal],
    ['orm', sheet.orm],
  ] as const;
  for (let s = 0; s < (o.strips ?? STRIP_ROWS) && found.length < 12; s++)
    for (const [name, px] of maps) {
      if (!px) continue;
      const y0 = s * h;
      const bands: [number, number, number][] = [
        [y0, y0 + pad, y0 + pad],
        [y0 + h - 1 - pad, y0 + h - 1, y0 + h - 1 - pad],
      ];
      for (const [from, to, edge] of bands)
        for (let y = from; y <= to; y++) {
          let d = 0;
          for (let i = 0; i < W; i++)
            d = Math.max(d, Math.abs((px[y * W + i] ?? 0) - (px[edge * W + i] ?? 0)));
          if (d <= tol) continue;
          found.push({
            gate: 'bleed',
            code: 'T3D_QA_BLEED',
            message: `${name} strip row ${s}: pixel row ${y} differs from its edge row ${edge} by ${d} — mips will mix in the neighbouring strip`,
            fix: 'compose strips with their edge texels replicated into the gutter (paintTrimSheet does; a hand-made sheet must too)',
          });
          break;
        }
    }
  failOn(
    'trim sheet bleed',
    found.map((finding) => ({ finding })),
  );
}
