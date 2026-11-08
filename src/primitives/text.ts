// Lettering as geometry: name boards, wagon and locomotive lettering, hull markings, signs,
// plaques. Two families of TextFont: the built-in 5 × 7 pixel font ('5x7', 'block'; Latin,
// digits, punctuation, Cyrillic; text-pixel.ts) and smooth Hershey stroke fonts ('sans', 'serif',
// 'script', 'gothic'; printable ASCII; text-vector.ts) inked with a pen of `weight`, curves
// resolved by `segments` (the LOD knob), round or square `cap`s, optical kerning. Flush decals
// lift 2 mm off the surface (depth 0) or letters stand `depth` proud. Flat normals. `surface(u, v)`
// gives the face's offset under the letters, so lettering stays readable across stepped sheathing.
// Reads along `along`, upright along `up`, facing along × up; `origin` is the baseline point at the
// `align` anchor. This file validates options, builds the frame and dispatches.

import { type Mesh, normalize, type Vec3 } from '../core/index.ts';
import { type StripId, stripRect } from '../material/index.ts';
import { count, invalid } from './check.ts';
import { isVectorFont } from './glyph-hershey.ts';
import { measureText, type TextFont } from './text-layout.ts';
import { pixelText } from './text-pixel.ts';
import { vectorText } from './text-vector.ts';
import { DEFAULT_WEIGHT } from './text-vector-layout.ts';

export { VECTOR_FONTS, type VectorFont } from './glyph-hershey.ts';
export { type MeasureOptions, measureText, TEXT_FONTS, type TextFont } from './text-layout.ts';

export interface TextOptions {
  readonly origin: Vec3;
  /** Reading direction. Default +Y (a sign read from +X). */
  readonly along?: Vec3;
  /** Letter up. Default +Z. */
  readonly up?: Vec3;
  /** Cap height in metres. */
  readonly height: number;
  readonly color: Vec3;
  /** Default '5x7'. Vector faces: 'sans', 'serif', 'script', 'gothic' (printable ASCII). */
  readonly font?: TextFont;
  /** Raised thickness in metres; 0 = flush decal lifted 2 mm. Default 0. */
  readonly depth?: number;
  /** Extra gap between glyphs in pixels (height / 7). Default 1 for pixel fonts, 0 for vector
   *  fonts (their proportional advances already carry side bearings). */
  readonly tracking?: number;
  readonly align?: 'left' | 'centre' | 'right';
  /** Shrink the cap height so the line fits this width, metres. */
  readonly maxWidth?: number;
  /** Offset (m, along the facing normal) of the surface under a letter piece. `u` = metres along
   *  `along` from `origin` (negative left of a centre/right anchor), `v` = metres up from it. */
  readonly surface?: (u: number, v: number) => number;
  readonly strip?: StripId;
  /** Vector fonts: stroke width as a fraction of the cap height, (0, 0.4]. Default per face:
   *  sans 0.12, serif 0.07, script 0.06, gothic 0.055. */
  readonly weight?: number;
  /** Vector fonts, the LOD knob: curve subdivisions per source segment (1 = raw Hershey
   *  polyline, 1–8) and round-cap arc steps (segments + 1; round joins twice that). Default 2. Pick from ctx.lod, e.g.
   *  `segments: [3, 2, 1][ctx.lod]`. Ignored by pixel fonts. */
  readonly segments?: number;
  /** Vector fonts: 'round' pen ends and joins (default) or 'square' caps with bevelled joins. */
  readonly cap?: 'round' | 'square';
  /** Vector fonts: optical kerning measured from the glyphs. Default true; 'script' never kerns
   *  (its letters join). */
  readonly kerning?: boolean;
}

export function text(str: string, o: TextOptions): Mesh {
  if (!(Number.isFinite(o.height) && o.height > 0 && o.height < 1000))
    invalid(
      `text height is ${o.height}`,
      'give the cap height in metres, > 0 (e.g. 0.3 for wagon lettering)',
    );
  const depth = o.depth ?? 0;
  if (!(Number.isFinite(depth) && depth >= 0))
    invalid(`text depth is ${depth}`, 'use 0 (flush) or a raised thickness > 0 m');
  const font = o.font ?? '5x7';
  const vector = isVectorFont(font);
  if (!vector && font !== '5x7' && font !== 'block')
    invalid(
      `text font is ${JSON.stringify(font)}`,
      "use '5x7', 'block', 'sans', 'serif', 'script' or 'gothic'",
    );
  const tracking = o.tracking ?? (vector ? 0 : 1);
  const weight = o.weight ?? (vector ? DEFAULT_WEIGHT[font] : 0);
  if (vector && !(Number.isFinite(weight) && weight > 0 && weight <= 0.4))
    invalid(
      `text weight is ${weight}`,
      'give the stroke width as a fraction of the cap height, > 0 and ≤ 0.4 (0.12 = regular sans)',
    );
  const kerning = o.kerning ?? true;
  let height = o.height;
  if (o.maxWidth !== undefined) {
    if (!(o.maxWidth > 0))
      invalid(`text maxWidth is ${o.maxWidth}`, 'give the panel width in metres, > 0');
    const w = measureText(str, { height, font, tracking, weight, kerning });
    if (w > o.maxWidth) height *= o.maxWidth / w;
  }
  const along = normalize(o.along ?? [0, 1, 0]);
  const up0 = o.up ?? [0, 0, 1];
  const k = up0[0] * along[0] + up0[1] * along[1] + up0[2] * along[2];
  const upR: Vec3 = [up0[0] - along[0] * k, up0[1] - along[1] * k, up0[2] - along[2] * k];
  if (Math.hypot(upR[0], upR[1], upR[2]) < 1e-9)
    invalid('text: up is parallel to along', 'pass an `up` perpendicular to the reading direction');
  const up = normalize(upR);
  const n: Vec3 = [
    along[1] * up[2] - along[2] * up[1],
    along[2] * up[0] - along[0] * up[2],
    along[0] * up[1] - along[1] * up[0],
  ];
  const frame = { origin: o.origin, along, up, n, height, depth, color: o.color };
  if (!vector) {
    return pixelText(str, {
      ...frame,
      font: font === 'block' ? 'block' : '5x7',
      tracking,
      align: o.align,
      surface: o.surface,
      strip: o.strip,
    });
  }
  const cap = o.cap ?? 'round';
  if (cap !== 'round' && cap !== 'square')
    invalid(`text cap is ${JSON.stringify(cap)}`, "use 'round' or 'square'");
  return vectorText(str, {
    ...frame,
    rect: stripRect(o.strip ?? 'plain'),
    font,
    tracking,
    kerning,
    weight,
    segments: count('text segments', o.segments ?? 2, 1, 8),
    cap,
    align: o.align,
    surface: o.surface,
  });
}
