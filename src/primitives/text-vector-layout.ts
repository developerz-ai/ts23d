// Line layout for the vector fonts: places each glyph's strokes at a pen position that advances
// by the glyph's proportional width + optical kerning (glyph-kern.ts; off for joined script) +
// tracking, then trims the line to its ink: x = 0 at the leftmost stroke edge (centreline − half
// the stroke width), width = to the rightmost edge. So measureText, align and maxWidth see the
// letters, not the side bearings. Units: font units, 21 per cap height.

import { CAP_UNITS, glyph, type VectorFont } from './glyph-hershey.ts';
import { kern } from './glyph-kern.ts';

export interface VectorLayoutOptions {
  readonly font: VectorFont;
  /** Extra gap between glyphs in pixels of the 5 × 7 grid (1 px = 3 font units). */
  readonly tracking: number;
  readonly kerning: boolean;
  /** Stroke width as a fraction of the cap height. */
  readonly weight: number;
}

/** Default stroke weight (fraction of cap height) per face: single-stroke sans is set heavier,
 *  the multi-stroke faces (serif, script, gothic) build their thick parts from parallel strokes. */
export const DEFAULT_WEIGHT: Readonly<Record<VectorFont, number>> = {
  sans: 0.12,
  serif: 0.07,
  script: 0.06,
  gothic: 0.055,
};

const PX_UNITS = CAP_UNITS / 7;

interface Placed {
  /** Pen x of each glyph, font units, before ink trimming. */
  readonly pens: number[];
  readonly lo: number;
  readonly hi: number;
}

function place(chars: readonly string[], o: VectorLayoutOptions): Placed {
  const pens: number[] = [];
  let pen = 0;
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  const doKern = o.kerning && o.font !== 'script';
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i] ?? ' ';
    const g = glyph(o.font, ch);
    if (i > 0) {
      const prev = chars[i - 1] ?? ' ';
      pen += o.tracking * PX_UNITS + (doKern ? kern(o.font, prev, ch) : 0);
    }
    pens.push(pen);
    if (g.strokes.length > 0) {
      lo = Math.min(lo, pen + g.inkMin);
      hi = Math.max(hi, pen + g.inkMax);
    }
    pen += g.advance;
  }
  if (lo > hi) return { pens, lo: 0, hi: chars.length > 0 ? pen : 0 };
  const half = (o.weight * CAP_UNITS) / 2;
  return { pens, lo: lo - half, hi: hi + half };
}

/** Ink width of a line in font units (0 for an empty string; the advances for blanks only). */
export function vectorWidth(str: string, o: VectorLayoutOptions): number {
  const p = place([...str], o);
  return p.hi - p.lo;
}

/** The line's strokes (x, y pairs, font units; ink starts at x = 0) and its ink width. */
export function vectorLayout(
  str: string,
  o: VectorLayoutOptions,
): { strokes: number[][]; width: number } {
  const chars = [...str];
  const p = place(chars, o);
  const strokes: number[][] = [];
  for (let i = 0; i < chars.length; i++) {
    const dx = (p.pens[i] ?? 0) - p.lo;
    for (const s of glyph(o.font, chars[i] ?? ' ').strokes) {
      const out = new Array<number>(s.length);
      for (let k = 0; k < s.length; k += 2) {
        out[k] = (s[k] ?? 0) + dx;
        out[k + 1] = s[k + 1] ?? 0;
      }
      strokes.push(out);
    }
  }
  return { strokes, width: p.hi - p.lo };
}
