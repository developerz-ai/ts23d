// The generator's public data contract (re-exported by generator.ts): what a sheet recipe says
// and what the painter returns.

import type { CellId, StripId } from '../trim-sheet.ts';

export interface PaintedSheet {
  readonly size: number;
  /** RGBA8, sRGB. Near-greyscale: hue comes from vertex colour multiplied over it. */
  readonly albedo: Uint8Array;
  /** RGBA8, tangent-space (glTF / OpenGL, +Y toward decreasing V). */
  readonly normal: Uint8Array;
  /** R = occlusion, G = roughness, B = metalness. */
  readonly orm: Uint8Array;
}

export type StripKind =
  | 'bond'
  | 'planks'
  | 'plates'
  | 'noise'
  | 'flat'
  | 'slate'
  | 'concrete'
  | 'glass';

export interface StripRecipe {
  readonly kind: StripKind;
  /**
   * World metres the strip's V span represents (its U span is always `stripRect().metres`).
   * Pick the typical face height the strip is stretched over; texels are anisotropic if needed.
   */
  readonly scaleMetres: number;
  readonly roughness: number;
  readonly metalness?: number;
  /** Brick/plank courses, rivet pitch, etc. — read per kind (see each painter's header). */
  readonly params?: Readonly<Record<string, number>>;
}

/** A cell stamped from PNG bytes (8-bit grey/RGB/RGBA, non-interlaced), e.g. a kubeez.com decal. */
export interface CellImage {
  readonly image: Uint8Array;
}

export interface SheetRecipe {
  readonly seed: number;
  readonly size?: 512 | 1024 | 2048;
  /** Missing strips fall back to `DEFAULT_SHEET`'s recipe for that strip. */
  readonly strips: Readonly<Partial<Record<StripId, StripRecipe>>>;
  /** Cells painted from code, or stamped from a supplied image (e.g. a kubeez.com decal). */
  readonly cells?: Readonly<Partial<Record<CellId, StripRecipe | CellImage>>>;
}
