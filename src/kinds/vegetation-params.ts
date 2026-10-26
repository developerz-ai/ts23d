// Tree vocabulary: Weber & Penn 1995 ("Creation and Rendering of Realistic Trees", SIGGRAPH)
// parameters, trimmed to what a game tree needs. Plain data, so presets are objects a recipe
// spreads and overrides.

import type { Vec2, Vec3 } from '../core/index.ts';

/** Crown envelope: how level-1 branch length varies up the trunk (Weber–Penn `Shape`). */
export type CrownShape =
  | 'conical'
  | 'spherical'
  | 'hemispherical'
  | 'cylindrical'
  | 'tapered'
  | 'flame';

/** One recursion level. Level 0 is the trunk; levels 1–3 are branches, sub-branches, twigs. */
export interface BranchLevel {
  /** Children per parent (level 1: along the trunk). Ignored for level 0. */
  readonly branches: number;
  /** Level 0: fraction of tree height. Level ≥ 1: fraction of the parent's length. */
  readonly length: number;
  /** ± relative random length variation. */
  readonly lengthVar?: number;
  /** Degrees between child and parent axis at the attachment. */
  readonly downAngle: number;
  /** Added to downAngle from the first child (bottom) to the last (top) of the parent's zone. */
  readonly downAngleV?: number;
  /** Phyllotaxis step about the parent, degrees (golden angle 137.5° by default). */
  readonly rotate?: number;
  /** Total bend over the stem, degrees: + towards the sky, − towards the ground. Trunk: + bends
   * back against `lean` (towards −X). */
  readonly curve?: number;
  /** If set, the second half bends by this instead (S-curves, weeping tips). */
  readonly curveBack?: number;
  /** Seeded wobble per path segment, ± degrees. */
  readonly curveVar?: number;
  /** Where children start along this stem's parent, as a fraction (level 1 uses `baseSize`). */
  readonly start?: number;
  /** Path segments at LOD0 (LOD1 halves them). */
  readonly segments: number;
}

export type LeafShape = 'oval' | 'lobed' | 'tuft' | 'strand' | 'frond';

/** Card outlines: u along the card (0 = stem end), v across (±0.5). */
export const OUTLINES: Record<Exclude<LeafShape, 'frond'>, readonly Vec2[]> = {
  oval: [
    [0, 0],
    [0.25, -0.4],
    [0.65, -0.5],
    [1, 0],
    [0.65, 0.5],
    [0.25, 0.4],
  ],
  lobed: [
    [0, 0],
    [0.3, -0.45],
    [0.5, -0.3],
    [0.75, -0.5],
    [1, 0],
    [0.75, 0.5],
    [0.5, 0.3],
    [0.3, 0.45],
  ],
  tuft: [
    [0, 0],
    [0.35, -0.5],
    [0.45, -0.15],
    [0.75, -0.4],
    [1, 0],
    [0.75, 0.4],
    [0.45, 0.15],
    [0.35, 0.5],
  ],
  strand: [
    [0, 0],
    [0.1, -0.5],
    [1, 0],
    [0.1, 0.5],
  ],
};

export interface LeafParams {
  readonly shape: LeafShape;
  /** Card length at LOD0, metres. Cards stand for a cluster of leaves, not one leaf. */
  readonly size: number;
  /** Card width as a fraction of its length (fronds: leaflet length as a fraction of frond). */
  readonly width: number;
  /** Cards per terminal stem (fronds: leaflets per side). */
  readonly perStem: number;
  /** Where cards start along a terminal stem, 0–1 (default 0.3; tufts sit near the tip). */
  readonly from?: number;
  readonly color: Vec3;
  /** ± relative colour variation per card. */
  readonly colorVar: number;
  /** 0–1: lay cards level, like the horizontal needle pads of a pine. */
  readonly flat?: number;
  /** 0 = cards splay outward, 1 = they hang straight down (willow strands). */
  readonly hang?: number;
}

export interface TreeParams {
  readonly shape: CrownShape;
  /** Fraction of the trunk free of branches (clear bole). */
  readonly baseSize: number;
  /** [trunk, level 1, level 2?, level 3?]. */
  readonly levels: readonly BranchLevel[];
  /** Child radius = parent radius · (child length / parent length)^ratioPower. */
  readonly ratioPower: number;
  /** Trunk radius at the top as a fraction of its radius at breast height. */
  readonly taper: number;
  /** Trunk lean from vertical towards +X, degrees. The trunk stays in the XZ plane. */
  readonly lean?: number;
  readonly bark: Vec3;
  /** Bark colour at the top of the trunk (Scots pine's orange upper bark); default `bark`. */
  readonly barkTop?: Vec3;
  /** Dark bark marks scattered per vertex (birch lenticels): colour + fraction of vertices. */
  readonly barkMarks?: { readonly color: Vec3; readonly amount: number };
  readonly leaves: LeafParams;
  /** Buttress lobes in the root flare at the base (LOD0/1); 0 or absent = no `roots` part. */
  readonly roots?: number;
  /** Fruit hung under the crown (coconuts), merged into `branches`. LOD0 only. */
  readonly fruit?: { readonly count: number; readonly radius: number; readonly color: Vec3 };
  /** LOD2 stand-in: a lathe of the crown envelope, or a few coarse frond cards. */
  readonly impostor: 'blob' | 'cards';
  /** Typical mature size this preset was tuned on (used when the caller omits spread/dbh). */
  readonly typical: { readonly height: number; readonly spread: number; readonly dbh: number };
}

/** Weber–Penn ShapeRatio; `r` is 1 at the crown base and 0 at the trunk tip. */
export function shapeRatio(shape: CrownShape, r: number): number {
  const x = Math.min(1, Math.max(0, r));
  switch (shape) {
    case 'conical':
      return 0.2 + 0.8 * x;
    case 'spherical':
      return 0.2 + 0.8 * Math.sin(Math.PI * x);
    case 'hemispherical':
      return 0.2 + 0.8 * Math.sin((Math.PI / 2) * x);
    case 'cylindrical':
      return 1;
    case 'tapered':
      return 0.5 + 0.5 * x;
    case 'flame':
      return x <= 0.7 ? 0.15 + (0.85 * x) / 0.7 : 0.15 + (0.85 * (1 - x)) / 0.3;
  }
}
