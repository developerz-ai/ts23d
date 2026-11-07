// Lettering layout for `text`: glyph lookup, advances, measureText, and the merge of each glyph's
// pixels into as few rectangles as possible (runs along a row, then identical runs stacked down
// the rows), so a stem is one box, not seven. All in pixel units; one pixel = cap height / 7.

import { invalid } from './check.ts';
import { GLYPHS, SUPPORTED_CHARS } from './font-5x7.ts';

export type TextFont = '5x7' | 'block';

export interface MeasureOptions {
  /** Cap height in metres (the 7 glyph rows). */
  readonly height: number;
  readonly font?: TextFont;
  /** Gap between glyphs in pixels (1 px = height / 7). Default 1. */
  readonly tracking?: number;
}

/** A filled rectangle: columns [c0, c1) from the line start, rows [r0, r1) from the cap line. */
export interface PixelRect {
  readonly c0: number;
  readonly c1: number;
  readonly r0: number;
  readonly r1: number;
}

const SPACE = 3;

/** Rows of one glyph in `font`; block = emboldened (each pixel doubled rightward, 6 wide). */
function rows(ch: string, font: TextFont): { rows: readonly number[]; width: number } {
  const g = GLYPHS[ch] ?? GLYPHS[ch.toUpperCase()];
  if (!g)
    invalid(
      `text: no glyph for ${JSON.stringify(ch)} (U+${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')})`,
      `use only these characters (lower case is set as upper case): ${SUPPORTED_CHARS}`,
    );
  if (ch === ' ') return { rows: g, width: SPACE };
  return font === 'block' ? { rows: g.map((r) => (r << 1) | r), width: 6 } : { rows: g, width: 5 };
}

/** Width in pixels of a line. */
function widthPx(str: string, font: TextFont, tracking: number): number {
  const chars = [...str];
  return (
    chars.reduce((w, ch) => w + rows(ch, font).width, 0) + Math.max(0, chars.length - 1) * tracking
  );
}

/** Width of `str` in metres when set at cap `height`. Throws on characters without a glyph. */
export function measureText(str: string, o: MeasureOptions): number {
  return (widthPx(str, o.font ?? '5x7', o.tracking ?? 1) * o.height) / 7;
}

/** The line as merged pixel rectangles, plus its width in pixels. */
export function layout(
  str: string,
  font: TextFont,
  tracking: number,
): { rects: PixelRect[]; width: number } {
  const rects: PixelRect[] = [];
  let pen = 0;
  for (const ch of str) {
    const g = rows(ch, font);
    let open = new Map<string, { c0: number; c1: number; r0: number }>();
    for (let r = 0; r <= 7; r++) {
      const bits = g.rows[r] ?? 0;
      const next = new Map<string, { c0: number; c1: number; r0: number }>();
      let c = 0;
      while (c < g.width) {
        if (!((bits >> (g.width - 1 - c)) & 1)) {
          c++;
          continue;
        }
        const start = c;
        while (c < g.width && (bits >> (g.width - 1 - c)) & 1) c++;
        const key = `${start},${c}`;
        next.set(key, open.get(key) ?? { c0: start, c1: c, r0: r });
      }
      for (const [key, run] of open)
        if (!next.has(key)) rects.push({ c0: pen + run.c0, c1: pen + run.c1, r0: run.r0, r1: r });
      open = next;
    }
    pen += g.width + tracking;
  }
  return { rects, width: Math.max(0, pen - tracking) };
}
