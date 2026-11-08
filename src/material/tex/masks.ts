// Texture DSL masks and blends: where wear, dirt, water and a second material go. Edge wear is
// convex curvature of the height chewed by noise (Substance's Edge Damages without a mesh bake),
// cavity is the concave side, height blend lets the taller of two surfaces win with a soft
// contrast (sand between cobbles, moss on stone), and `blend` is a plain masked lerp.
// Planned, not shipped: a slope mask (needs the mesh normal; terrain-side, not texture-side).

import type { Input, TexField } from './field.ts';
import { noise } from './generators.ts';

export interface EdgeWearOptions {
  /** Metres of edge the wear reaches in from a convex arris. */
  readonly width?: number;
  /** 0..1 share of the convex edge exposed. */
  readonly amount?: number;
  /** 0..1 how much noise chews the mask edge into chips. */
  readonly chip?: number;
  readonly seed?: number;
}

/** 0..1 mask on convex edges of a 0..1 height field (rubbed paint, polished stone arrises). */
export function edgeWear(height: TexField, o: EdgeWearOptions = {}): TexField {
  const width = o.width ?? 0.006;
  const amount = o.amount ?? 0.5;
  const chip = o.chip ?? 0.5;
  const n = noise({ size: width * 3, octaves: 3, seed: 401 + (o.seed ?? 0) });
  const convex = height.curvature(width).levels(0, 0.25);
  const t = 1 - amount;
  return convex.zip(n, (c, z) => c * (1 - chip + chip * 2 * z), 'chip').smoothstep(t, t + 0.15);
}

/** 0..1 mask in creases and pits of a 0..1 height field (dirt, moisture, AO). */
export const cavity = (height: TexField, metres = 0.01, depth = 0.15): TexField =>
  height.curvature(metres).levels(-depth, 0).invert();

/** 0..1 mask: where `top` (0..1 height) rises above `base` (0..1 height); `contrast` sharpens. */
export const heightBlend = (base: TexField, top: TexField, contrast = 0.1): TexField =>
  top.sub(base).levels(-contrast, contrast);

/** a where mask is 0, b where it is 1. */
export const blend = (a: Input, b: Input, mask: TexField): TexField => mask.lerp(a, b);
