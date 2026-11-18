// The `stroke` step of a Blender program: a brush dragged along a 3D path over an existing mesh,
// written as data (examples/blender/tasks/steps/stroke.py runs it). Here: its type, its field table
// and the rules that tie its fields together (which brush needs `strength`, `stamp` or two points).

import {
  type Check,
  type Field,
  int,
  invalidStep,
  list,
  num,
  oneOf,
  opt,
  pos,
  req,
  shape,
  vec3,
  weightMask,
} from './blender-step-checks.ts';
import type { BlenderWeightMask } from './blender-steps.ts';

export const BLENDER_BRUSHES = [
  'draw',
  'inflate',
  'clay',
  'flatten',
  'crease',
  'pinch',
  'smooth',
  'grab',
  'vdm',
] as const;
export type BlenderBrush = (typeof BLENDER_BRUSHES)[number];

/** A vector displacement stamp: `@developerz.ai/ts23d`'s `VdmStamp` layout, as plain numbers. */
export interface BlenderStrokeStamp {
  /** Texels per side. */
  readonly size: number;
  /** size² × 3 numbers, row-major: (right, up, normal) per texel, in footprint widths. */
  readonly grid: readonly number[];
}

/**
 * Brush an existing mesh along `path` (asset frame, on the surface), headless. The falloff follows
 * the surface (graph distance from each dab), so a stroke never reaches across a gap. Before `uv`
 * only: on the source before `retopo` (the bake then carries it), or on the shell after it.
 */
export interface BlenderStrokeStep {
  readonly op: 'stroke';
  /** draw · inflate (own normals) · clay (fill up to a plane) · flatten · crease (cut + pinch) ·
   *  pinch · smooth · grab (moves `path[0]` by `path[1] - path[0]`) · vdm (`stamp` at each dab). */
  readonly brush: BlenderBrush;
  readonly path: readonly (readonly [number, number, number])[];
  /** Metres along the surface: one value, or one per path point. */
  readonly radius: number | readonly number[];
  /** Metres the brush moves the surface at most. Negative digs in (draw, inflate, clay) or cuts
   *  with the stamp (vdm); `crease` cuts in for a positive value. Every brush but `grab` needs it. */
  readonly strength?: number;
  /** Distance between dabs, as a share of the radius (0.2). */
  readonly spacing?: number;
  readonly mask?: BlenderWeightMask;
  /** Also stroke the path mirrored across the plane normal to this asset axis. */
  readonly symmetry?: 'x' | 'y' | 'z';
  /** The `vdm` brush's stamp. */
  readonly stamp?: BlenderStrokeStamp;
}

const radius: Check = (v, at) =>
  Array.isArray(v) ? list(pos, 1, 4096)(v, at) : (pos(v, at) as number);

const stamp = shape({
  size: req(int(3, 129)),
  grid: req(list(num(-16, 16), 27, 129 * 129 * 3)),
});

export const STROKE_FIELDS: Readonly<Record<string, Field>> = {
  brush: req(oneOf(...BLENDER_BRUSHES)),
  path: req(list(vec3, 1, 4096)),
  radius: req(radius),
  strength: opt(num(-16, 16)),
  spacing: opt(num(0.02, 2), 0.2),
  mask: opt(weightMask),
  symmetry: opt(oneOf('x', 'y', 'z')),
  stamp: opt(stamp),
};

/** The rules between a normalised stroke's fields. */
export function checkStroke(s: Readonly<Record<string, unknown>>, at: string): void {
  const brush = s['brush'];
  const path = s['path'] as readonly unknown[];
  const r = s['radius'];
  if (Array.isArray(r) && r.length !== path.length)
    invalidStep(at, `has ${r.length} radii for ${path.length} path points`, 'give one per point');
  if (brush === 'grab') {
    if (path.length !== 2)
      invalidStep(
        at,
        `grab has ${path.length} path points`,
        'pass [from, to]: it moves by to - from',
      );
    if (s['strength'] !== undefined)
      invalidStep(at, 'grab takes no strength', 'drop it: the path says how far');
  } else {
    if (s['strength'] === undefined) invalidStep(at, `${brush} needs 'strength'`, 'add metres');
    if (s['strength'] === 0) invalidStep(at, 'strength is 0', 'pass the metres to move');
  }
  const grid = s['stamp'] as { size: number; grid: readonly number[] } | undefined;
  if (brush === 'vdm' && grid === undefined)
    invalidStep(at, "vdm needs 'stamp'", 'pass { size, grid } (a VdmStamp as plain numbers)');
  if (brush !== 'vdm' && grid !== undefined)
    invalidStep(at, `${brush} takes no stamp`, "drop it, or use brush 'vdm'");
  if (grid !== undefined && grid.grid.length !== grid.size * grid.size * 3)
    invalidStep(
      at,
      `stamp has ${grid.grid.length} numbers`,
      'store size² × 3: (right, up, normal)',
    );
}
