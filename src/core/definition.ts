// The asset contract: what defineAsset takes (AssetDefinition), what build() receives
// (BuildContext), budgets, real-world dimensions, measures, checks, and the compiled result.

import type { Finishes, ResolvedFinish } from './finish.ts';
import type { Mesh } from './mesh.ts';
import type { ResolvedSurfaceOptics, SurfaceOptics } from './optics.ts';
import type { PaintSet, PaintSlots, PaintVariants } from './paint.ts';
import type {
  EmitterOptions,
  Joint,
  JointOptions,
  Lod,
  Part,
  PartOptions,
  SocketOptions,
  UseOptions,
} from './part.ts';
import type { AssetPhysics, RealMass } from './physics.ts';
import type { Rng } from './rng.ts';
import type { TuneSpec } from './tune.ts';
import type { Vec3 } from './vec.ts';
import type { WeatherCoverage } from './weather-coverage.ts';

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
  /** Declare where two parts connect (wrist, grip, peg); QA `joints` checks that they fit. */
  joint(name: string, options: JointOptions): void;
  /** Record measured weathering coverage (passes/weather calls it): manifest + QA `weather`. */
  weathered(coverage: readonly WeatherCoverage[]): void;
  /** A `tune.params` value: the optimiser's trial, else the committed tune.json, else the default. */
  tuned(name: string): number;
}

export interface Budget {
  /** Triangle ceiling per LOD; QA fails the build above it. */
  readonly triangles: readonly [number, number, number];
  /** Draw-call ceiling per LOD (integer ≥ 1); `t3d build` fails above it. Omitted: unchecked. */
  readonly draws?: number;
}

/** Real-world overall dimensions (metres) the QA `proportions` gate holds the model to. */
export interface RealDimensions extends RealMass {
  /** Along X (front-back). */
  readonly length: number;
  /** Along Y. */
  readonly width: number;
  /** Along Z. */
  readonly height: number;
  /** Allowed relative error per axis; default 0.05, at most 0.5. */
  readonly tolerance?: number;
  /** Required when `tolerance` is above the 0.05 default: why the box may be that loose. */
  readonly why?: string;
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
  /** Allowed relative error; default 0.02, at most 0.5. */
  readonly tolerance?: number;
  /** Required when `tolerance` is above the 0.02 default: why this number may be that loose. */
  readonly why?: string;
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

/**
 * An opening the `gaps` QA gate must not flag: a vent, a door seam, running clearance. Declared
 * with a reason, so a reviewer can tell a designed slot from a modelling miss.
 */
export interface IntendedGap {
  /** One or two part names/globs on the slot's rims; one selector = any slot it borders. */
  readonly parts: readonly [string] | readonly [string, string];
  readonly why: string;
}

/**
 * A crease the `connections` seam check must not flag (organic kinds): an eyelid fold, the
 * nasolabial fold, the mouth line — a sphere region in the asset's frame on matching parts.
 */
export interface IntendedCrease {
  readonly name: string;
  /** Part name or glob the crease is on ('head', 'head_*'). */
  readonly part: string;
  readonly at: Vec3;
  readonly radius: number;
  readonly why?: string;
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
  /**
   * View-distance hints for the single-file GLB (MSFT_lod `MSFT_screencoverage`): the screen-height
   * fraction below which LOD0 → LOD1, LOD1 → LOD2, and LOD2 is culled (0 = never). Strictly
   * descending, 1 > a > b > c >= 0. Omitted: derived from the triangle counts and size.
   */
  readonly lodCoverage?: readonly [number, number, number];
  /**
   * Paint slots with their default colours: `{ body: '#84402d' }`. Parts join one with
   * `{ paint: 'body' }`; the GLB gives each slot its own material (baseColorFactor = the colour,
   * COLOR_0 = the part's colour ÷ it, so grime and wear survive). One extra draw per slot per pivot.
   */
  readonly paint?: PaintSlots;
  /**
   * Switchable liveries (KHR_materials_variants): name → the slots it repaints,
   * `{ oxide_red: { body: '#74382a' } }`. No variant selected = `paint`.
   */
  readonly variants?: PaintVariants;
  /**
   * Named finishes for opaque parts (`{ finish: 'velvet' }`): sheen, anisotropy, iridescence,
   * clearcoat, specular → KHR_materials_* (extensionsUsed, never required). One material each.
   */
  readonly finishes?: Finishes;
  /** See-through surface overrides: `{ glass: { ior: 1.52, thickness: 0.004 } }`. */
  readonly optics?: SurfaceOptics;
  /** Openings that are meant to be there, so QA `gaps` skips them: vents, seams, clearance. */
  readonly gaps?: readonly IntendedGap[];
  /** Intended creases inside sculpted meshes, so QA `connections` skips them (organic kinds). */
  readonly creases?: readonly IntendedCrease[];
  /** Rigid body, mass and collider defaults (`t3d build --physics`, docs/architecture/gltf-capabilities.md). */
  readonly physics?: AssetPhysics;
  /**
   * Art intent the readability checks measure (`assertArt`, `t3d critique` metrics,
   * docs/idea/16-art-as-text.md): `focal` part name(s) that must hold the highest value contrast;
   * `shape` language of the silhouette; `grounded` (luminance rises base → top; default on for
   * `character`/`creature`); `restShare` minimum calm surface share (default 0.25).
   */
  readonly art?: {
    readonly focal?: string | readonly string[];
    readonly shape?: 'aggressive' | 'friendly' | 'stable';
    readonly grounded?: boolean;
    readonly restShare?: number;
  };
  /**
   * Knobs `t3d tune` may turn and what it minimises (docs/idea/20-tuning.md). Read them with
   * `ctx.tuned('name')`; pass the committed file as `saved` so every build sees the same numbers.
   */
  readonly tune?: TuneSpec;
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
  readonly lodCoverage?: readonly [number, number, number];
  /** Paint slots + variants in linear RGB (absent when the recipe declares no paint). */
  readonly paintSet?: PaintSet;
  /** Declared finishes, linear RGB (absent when none). */
  readonly finishes?: Readonly<Record<string, ResolvedFinish>>;
  /** See-through surface overrides merged over the presets (absent when none). */
  readonly optics?: ResolvedSurfaceOptics;
  /** Set when compiled with `{ variant }`: vertex colours already show that livery (previews). */
  readonly variant?: string;
  /** Declared openings carried from the definition (QA `gaps`). */
  readonly gaps?: readonly IntendedGap[];
  /** Declared intended creases carried from the definition (QA `connections`). */
  readonly creases?: readonly IntendedCrease[];
  /** Declared connections (`ctx.joint`), in the asset's frame; QA `joints` checks the fit. */
  readonly joints?: readonly Joint[];
  /** Physics intent carried from the definition (absent when the recipe declares none). */
  readonly physics?: AssetPhysics;
  /** Measured weathering per target and effect (`weather(ctx, …)`); absent when none. */
  readonly weather?: readonly WeatherCoverage[];
}
