// Decodes the embedded Hershey stroke fonts (font-hershey-*.ts) into glyphs for `text`: pen
// strokes as polylines in font units (x from the advance box's left edge, y up from the baseline,
// cap height 21), the proportional advance and the ink's left/right extent. Decoded once per
// glyph and memoised, so laying out a line allocates nothing per point.

import { invalid } from './check.ts';
import { GOTHIC } from './font-hershey-gothic.ts';
import { SANS } from './font-hershey-sans.ts';
import { SCRIPT } from './font-hershey-script.ts';
import { SERIF } from './font-hershey-serif.ts';

export type VectorFont = 'sans' | 'serif' | 'script' | 'gothic';

export const VECTOR_FONTS: readonly VectorFont[] = ['sans', 'serif', 'script', 'gothic'];

/** Font units per cap height (Hershey: cap line y = −12, baseline y = 9). */
export const CAP_UNITS = 21;

const TABLES: Readonly<Record<VectorFont, readonly string[]>> = {
  sans: SANS,
  serif: SERIF,
  script: SCRIPT,
  gothic: GOTHIC,
};

export interface Glyph {
  /** Pen strokes; each is x0, y0, x1, y1, … in font units. */
  readonly strokes: readonly (readonly number[])[];
  /** Advance width in font units (Hershey's right − left bearing). */
  readonly advance: number;
  /** Ink extent along x (stroke centrelines); both 0 for a blank glyph. */
  readonly inkMin: number;
  readonly inkMax: number;
}

const BASE = 'R'.charCodeAt(0);
/** Word space in font units. Hershey's own (16) plus the side bearings opens a cap-height gap
 *  between words; 9 gives ≈ 0.7 cap with bearings, close to a book face's word space. */
const WORD_SPACE = 9;
const memo = new Map<string, Glyph>();

export const isVectorFont = (f: string): f is VectorFont => f in TABLES;

function decode(src: string): Glyph {
  const left = src.charCodeAt(0) - BASE;
  const right = src.charCodeAt(1) - BASE;
  const strokes: number[][] = [];
  let cur: number[] = [];
  let inkMin = Number.POSITIVE_INFINITY;
  let inkMax = Number.NEGATIVE_INFINITY;
  for (let i = 2; i + 1 < src.length; i += 2) {
    if (src[i] === ' ' && src[i + 1] === 'R') {
      if (cur.length >= 4) strokes.push(cur);
      cur = [];
      continue;
    }
    const x = src.charCodeAt(i) - BASE - left;
    const y = 9 - (src.charCodeAt(i + 1) - BASE);
    cur.push(x, y);
    inkMin = Math.min(inkMin, x);
    inkMax = Math.max(inkMax, x);
  }
  if (cur.length >= 4) strokes.push(cur);
  if (strokes.length === 0)
    return { strokes, advance: src === 'JZ' ? WORD_SPACE : right - left, inkMin: 0, inkMax: 0 };
  return { strokes, advance: right - left, inkMin, inkMax };
}

/** The glyph for `ch` in `font`; throws T3D_RECIPE_INVALID naming the supported range. */
export function glyph(font: VectorFont, ch: string): Glyph {
  const code = ch.codePointAt(0) ?? 0;
  const src = code >= 32 && code <= 126 ? TABLES[font][code - 32] : undefined;
  if (src === undefined)
    invalid(
      `text: font '${font}' has no glyph for ${JSON.stringify(ch)} (U+${code.toString(16).toUpperCase().padStart(4, '0')})`,
      `vector fonts cover printable ASCII (space to ~, upper and lower case); for Cyrillic use font '5x7' or 'block'`,
    );
  const key = `${font}:${ch}`;
  let g = memo.get(key);
  if (!g) {
    g = decode(src);
    memo.set(key, g);
  }
  return g;
}
