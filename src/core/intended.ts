// What a recipe declares as meant: openings the `gaps` gate must not flag and creases the
// `connections` seam check must not flag. Part of the asset contract (definition.ts re-exports).

import type { Vec3 } from './vec.ts';

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
