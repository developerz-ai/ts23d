// The asset contract: what defineAsset takes (AssetDefinition), what build() receives
// (BuildContext), budgets, real-world dimensions, measures, checks, and the compiled result.

import type { Mesh } from './mesh.ts';
import type { EmitterOptions, Lod, Part, PartOptions, SocketOptions, UseOptions } from './part.ts';
import type { Rng } from './rng.ts';

export interface BuildContext {
  readonly lod: Lod;
  readonly seed: number;
  readonly rng: Rng;
  /** The value for this LOD: `ctx.pick([24, 12, 6])` — segments, counts, sizes per detail level. */
  pick<T>(perLod: readonly [T, T, T]): T;
  /** Add a named part. Names are the contract with the engine: `axle_*`, `door_*`, `rotor_*`. */
  part(name: string, mesh: Mesh | null, options?: PartOptions): void;
  /** An empty pivot that other parts parent to. */
  group(name: string, options?: PartOptions): void;
  /** Declare a particle source (smoke, steam, dust, muzzle…) as a named node. */
  emitter(name: string, options: EmitterOptions): void;
  /** Declare an attachment point (seat, mount, camera, audio, light…) as a named node. */
  socket(name: string, options: SocketOptions): void;
  /** Instance another asset inside this one, compiled at this LOD — the composition primitive. */
  use(asset: Asset, options: UseOptions): void;
}

export interface Budget {
  /** Triangle ceiling per LOD; QA fails the build above it. */
  readonly triangles: readonly [number, number, number];
}

/** Real-world overall dimensions (metres) the QA `proportions` gate holds the model to. */
export interface RealDimensions {
  /** Along X (front-back). */
  readonly length: number;
  /** Along Y. */
  readonly width: number;
  /** Along Z. */
  readonly height: number;
  /** Allowed relative error per axis; default 0.05. */
  readonly tolerance?: number;
  /** Named spec-sheet dimensions checked against the model (QA `measures`). */
  readonly measures?: readonly Measure[];
}

/**
 * One real-world dimension from a source, checked against the model at LOD0: the world-space
 * extent of `parts` (union of their bounds) along `axis`, or the distance between two parts'
 * centres. E.g. driver diameter = extent of `axle_driver_0` on Z; gauge = centre distance of the
 * two rail parts on Y; turret width = extent of `turret_body` on Y.
 */
export interface Measure {
  readonly label: string;
  readonly value: number;
  readonly axis: 'x' | 'y' | 'z';
  /** Extent of these parts (prefix match: 'axle_driver_0' includes its wheels). */
  readonly parts?: readonly string[];
  /** Or: distance between the centres of exactly two parts along `axis`. */
  readonly between?: readonly [string, string];
  readonly tolerance?: number;
  /** Where this number comes from (one of `sources`, or a page reference). */
  readonly source?: string;
}

/** One problem a recipe's own check found. QA turns these into findings named `check`. */
export interface CheckFinding {
  readonly message: string;
  readonly fix: string;
  readonly part?: string;
}

/**
 * A recipe-declared assertion about its own geometry, run by the QA gate at every LOD:
 * "tracks clear the hull", "wheels never overlap", "left matches right". Plain functions —
 * build them with the helpers in /qa (`clear`, `touches`, `noOverlap`, `symmetric`) or write one.
 */
export type Check = (asset: CompiledAsset) => readonly CheckFinding[];

/**
 * Triangle budgets per class (LOD0 / LOD1 / LOD2): a starting point, measured on real recipes.
 * `budget: BUDGETS.vehicle` — raise one with a measured reason, never to hide a regression.
 */
export const BUDGETS = {
  prop: { triangles: [800, 300, 80] },
  detailedProp: { triangles: [5000, 1500, 300] },
  building: { triangles: [20000, 6000, 800] },
  vehicle: { triangles: [60000, 15000, 1000] },
  hero: { triangles: [150000, 40000, 2000] },
  tree: { triangles: [25000, 6000, 300] },
  scene: { triangles: [500000, 120000, 15000] },
} as const satisfies Record<string, Budget>;

/** A part set that emits light (lamp lenses, lit windows): an emissive material in the GLB. */
export interface Glow {
  /** Part names or globs: 'headlamp_*', 'window_*'. */
  readonly parts: readonly string[];
  /** Linear RGB 0..1 (`hex('#ffd9a0')`). Default warm white. */
  readonly color?: readonly [number, number, number];
  /** Brightness multiplier (KHR_materials_emissive_strength); 1 = plain glTF. Default 4. */
  readonly strength?: number;
}

/** Provenance written into every GLB: `asset.copyright` + an XMP packet. */
export interface AssetMeta {
  readonly description?: string;
  readonly sources?: readonly string[];
  /** SPDX id or licence URL, e.g. 'CC0-1.0', 'MIT'. */
  readonly license?: string;
  /** e.g. '© 2026 Jane Doe'. */
  readonly copyright?: string;
  readonly creators?: readonly string[];
}

export interface AssetDefinition {
  readonly name: string;
  readonly kind: string;
  readonly description?: string;
  /** Where the numbers came from: spec sheets, rosters, drawings, photos. Required for `real`. */
  readonly sources?: readonly string[];
  readonly real?: RealDimensions;
  readonly tags?: readonly string[];
  readonly budget: Budget;
  readonly seed?: number;
  /** The recipe's own physical intent, enforced by QA (see Check). */
  readonly checks?: readonly Check[];
  /** SPDX id or licence URL for the generated asset, e.g. 'CC0-1.0'. Written into the GLB. */
  readonly license?: string;
  readonly copyright?: string;
  readonly creators?: readonly string[];
  /** Emissive part sets; `t3d build` writes them as glowing materials. */
  readonly glow?: readonly Glow[];
  build(ctx: BuildContext): void;
}

export interface Asset extends AssetDefinition {
  readonly __ts23d: 'asset';
}

export interface CompiledAsset {
  readonly name: string;
  readonly kind: string;
  readonly lod: Lod;
  readonly budget: Budget;
  readonly real: RealDimensions | null;
  readonly checks: readonly Check[];
  readonly parts: readonly Part[];
  /** Provenance carried from the definition (absent when the recipe declares none). */
  readonly meta?: AssetMeta;
  readonly glow?: readonly Glow[];
}
