// Options and results of the GLB writer (glb.ts): what goes into the file and what comes back.

import type { OptimizeOptions } from '../passes/index.ts';
import type { LodCoverage } from './lod-coverage.ts';
import type { GlowRule } from './materials.ts';
import type { GlbMeta } from './metadata.ts';
import type { ExportReport } from './optimize-parts.ts';
import type { SheetBinding } from './textures.ts';

export interface GlbOptions {
  /** Keep every part as its own node (debugging, per-part picking). Default merges to pivots. */
  readonly keepParts?: boolean;
  /**
   * Bake each part's `motion` into a looping `run` clip. Off by default: glTF has no autoplay
   * flag and most viewers play the first clip, while engines usually drive the named pivots
   * from game code. Turn it on for previews, cutscenes and ambient props.
   */
  readonly animations?: boolean;
  /**
   * Bind the painted trim sheet to every material: a `PaintedSheet` embeds the three PNGs (one
   * self-contained file); `{ external: true, prefix? }` references shared `trim_sheet_*.png` by
   * URI. Omitted: no textures, byte-identical to the untextured output.
   */
  readonly sheet?: SheetBinding;
  /**
   * Weld + vertex-cache + vertex-fetch optimisation per primitive (passes/optimize). On by
   * default; `false` writes the meshes exactly as compiled (debugging the IR).
   */
  readonly optimize?: boolean | OptimizeOptions;
  /** Parts that emit light (lamp lenses, lit windows): one emissive material per rule. */
  readonly glow?: readonly GlowRule[];
  /** Provenance: asset.copyright + an XMP packet (title, creators, licence, sources). */
  readonly meta?: GlbMeta;
  /**
   * Single-file LODs only: [LOD0→LOD1, LOD1→LOD2, cull] screen-height fractions written as
   * `MSFT_screencoverage`. Default: the asset's `lodCoverage`, else derived (lod-coverage.ts).
   */
  readonly lodCoverage?: LodCoverage;
}

/** The GLB bytes plus what the optimiser did (vertex counts, ACMR before/after, per part). */
export interface GlbResult {
  readonly glb: Uint8Array;
  readonly report: ExportReport;
}

/** One GLB holding several LODs, plus one optimiser report per LOD (same order as the input). */
export interface LodGlbResult {
  readonly glb: Uint8Array;
  readonly reports: readonly ExportReport[];
  /** The `MSFT_screencoverage` written (empty for a single LOD). */
  readonly coverage: readonly number[];
}
