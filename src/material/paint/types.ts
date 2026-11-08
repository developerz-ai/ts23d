// The generator's public data contract (re-exported by generator.ts): what a sheet recipe says
// and what the painter returns.

import type { Vec3 } from '../../core/index.ts';
import type { MaterialGraph } from '../tex/graph.ts';
import type { TextureSource } from '../texture-source.ts';
import type { CellId, StripId } from '../trim-sheet.ts';
import type { Canvas } from './canvas.ts';

export interface PaintedSheet {
  readonly size: number;
  /** RGBA8, sRGB. Classic strips are greyscale (vertex colour carries hue); materials carry colour. */
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
  | 'glass'
  | 'metal'
  | 'weave'
  | 'leather';

/**
 * The surface a painter writes, one float per texel per layer, in real metres. Row y grows with
 * world up (+V); strips wrap along x. Layers: `height` (metres, + is out), `tone` (linear
 * brightness multiplier), `rough` and `metal` (0–1), `mix` (0 = albedo, 1 = albedo2), `occl`.
 */
export type MaterialSurface = Canvas;

/** Helpers handed to a custom painter: seeded, tileable noise and smoothstep, all in metres. */
export interface PaintKit {
  readonly seed: number;
  /** Tileable fBm in [−1, 1] with feature size `sizeU` × `sizeV` metres; `salt` varies it. */
  noise(
    xm: number,
    ym: number,
    sizeU: number,
    sizeV: number,
    salt?: number,
    octaves?: number,
  ): number;
  /** Integer hash in [0, 1). */
  hash(a: number, b: number, salt?: number): number;
  smooth(e0: number, e1: number, v: number): number;
  /** Visit every texel: index into the layers and its centre in metres. */
  each(fn: (i: number, xm: number, ym: number) => void): void;
}

/** A project painter: runs after the base `kind`, layering its own pattern over it. */
export type MaterialPainter = (s: MaterialSurface, kit: PaintKit) => void;

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
  /** Intrinsic linear albedo; omitted = white (greyscale strip, vertex colour carries hue). */
  readonly albedo?: Vec3;
  /** Second linear albedo the painter blends to through `mix` (latewood, rust, bare wood…). */
  readonly albedo2?: Vec3;
  /** Extra layer painted after `kind` (see `defineMaterial`). */
  readonly paint?: MaterialPainter;
  /** Paint from a cached CC0 texture set instead of `kind` (see texture-source.ts). */
  readonly texture?: TextureSource;
  /** Paint from a texture graph (`tex.material`) instead of `kind`. */
  readonly graph?: MaterialGraph;
}

/** A cell stamped from PNG bytes (8-bit grey/RGB/RGBA, non-interlaced), e.g. a kubeez.com decal. */
export interface CellImage {
  readonly image: Uint8Array;
}

export interface SheetRecipe {
  readonly seed: number;
  /** Pixels per side. The layout is designed for 4096 (64 px strip rows); 2048 previews at half. */
  readonly size?: 512 | 1024 | 2048 | 4096;
  /** Missing strips fall back to `DEFAULT_SHEET`'s recipe for that strip. */
  readonly strips: Readonly<Partial<Record<StripId, StripRecipe>>>;
  /** Cells painted from code, or stamped from a supplied image (e.g. a kubeez.com decal). */
  readonly cells?: Readonly<Partial<Record<CellId, StripRecipe | CellImage>>>;
}
