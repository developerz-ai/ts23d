// The physics vocabulary of the DSL: rigid-body kind, collider choice per part, density and wall
// thickness overrides. Types only; /physics fits shapes and integrates mass from them.

/** How the engine moves the asset: never (static), by simulation (dynamic), by game code (kinematic). */
export type BodyKind = 'static' | 'dynamic' | 'kinematic';

/**
 * Collision shape for one exported pivot:
 *   auto     — the tightest of box / sphere / capsule / cylinder, else a convex hull (default)
 *   box … cylinder — that implicit shape, fitted to the part (KHR_implicit_shapes)
 *   convex   — a vertex-capped convex hull of the part
 *   mesh     — the render mesh as a triangle mesh (static and kinematic bodies only in most engines)
 *   none     — no collider (antennas, foliage cards, light cones)
 */
export type ColliderKind =
  | 'auto'
  | 'box'
  | 'sphere'
  | 'capsule'
  | 'cylinder'
  | 'convex'
  | 'mesh'
  | 'none';

/** `defineAsset({ physics })`: body kind, mass override and material overrides. */
export interface AssetPhysics {
  /** Default: static for kind 'building' / 'terrain', dynamic otherwise. */
  readonly body?: BodyKind;
  /** Total mass in kg; replaces volume × density (the distribution, CoM and inertia, is kept). */
  readonly mass?: number;
  /** kg/m³ per trim-sheet strip id: `{ plain: 7850 }` when `plain` is painted armour steel. */
  readonly density?: Readonly<Record<string, number>>;
  /**
   * Wall thickness in metres for every closed shell (hollow hulls, tanks, boxcars): mass =
   * surface area × thickness × density, capped at the solid volume. Omitted: shells are solid.
   */
  readonly shell?: number;
}

/** Per-part physics options (ctx.part(name, mesh, { collider, density, shell })). */
export interface PartPhysics {
  readonly collider?: ColliderKind;
  /** kg/m³ for this part, whatever strip it uses. */
  readonly density?: number;
  /** Wall thickness in metres for this part's closed shells (overrides `physics.shell`). */
  readonly shell?: number;
}

/** A sourced real-world mass the QA `mass` check holds the computed mass to. */
export interface RealMass {
  /** Kilograms (combat weight, empty weight… say which in `sources`). */
  readonly mass?: number;
  /** Allowed relative error; default 0.15 (densities and wall thicknesses are estimates). */
  readonly massTolerance?: number;
}
