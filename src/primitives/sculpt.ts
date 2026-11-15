// Sculpting as an ordered list of SDF edits (the Dreams model): each edit adds, subtracts,
// intersects or paints a simple shape, blended into everything before it by a smooth-min of
// radius `blend` metres. Colour rides the same blend weights, so skin, lips, eye whites and tusks
// come out as vertex colour on ONE mesh. `mirror: 'y'` makes every edit symmetric left/right
// (Y in our Z-up, +X-front frame); an edit can opt out. Meshed by `sdf` (smooth gradient normals),
// bounds found from the edits. `resolution` = cell edge in metres: ctx.pick([0.004, 0.012, 0.03]).
// `kernel: 'cubic'` makes blends C2; strokes (sculpt-stroke.ts) push the surface along a path and
// raise the Lipschitz bound handed to the grid; `detail` boxes mesh finer where the face is.
// `sculptField` exposes the field + colour so a recipe can displace it before meshing.

import type { Mesh, Vec3 } from '../core/index.ts';
import type { StripId } from '../material/index.ts';
import { invalid } from './check.ts';
import { editBounds, isAdd, type SculptEdit } from './sculpt-edit.ts';
import { compile, fold, lipschitzExtra } from './sculpt-tree.ts';
import { sdf } from './sdf.ts';
import type { DetailRegion } from './sdf-detail.ts';
import type { BlendKernel, Field } from './sdf-ops.ts';

export type {
  SculptEdit,
  SculptFieldEdit,
  SculptGroup,
  SculptShape,
  SculptShapeEdit,
} from './sculpt-edit.ts';
export type { SculptStroke, StrokeBrush } from './sculpt-stroke.ts';

export interface SculptField {
  readonly field: Field;
  /** Blended edit colour at a point (call at surface points). */
  readonly colorAt: (p: Vec3) => Vec3;
  /** Edits' bounds grown by their blend radii. */
  readonly bounds: readonly [Vec3, Vec3];
  /** Upper bound on |∇field|: 1.25 (shapes) plus every stroke's declared cost. */
  readonly lipschitz: number;
}

export interface SculptOptions {
  readonly edits: readonly SculptEdit[];
  /** Cell edge in metres (the LOD knob). */
  readonly resolution: number;
  /** Colour of edits that give none. */
  readonly color: Vec3;
  readonly mirror?: 'y';
  readonly mesher?: 'nets' | 'cubes';
  readonly strip?: StripId;
  /** Default blend kernel of every edit (edits and groups override). Default 'quad'. */
  readonly kernel?: BlendKernel;
  /** Boxes meshed at resolution / factor, e.g. the face of a creature (sdf-detail.ts). */
  readonly detail?: readonly DetailRegion[];
}

export function sculptField(
  edits: readonly SculptEdit[],
  o: { readonly color: Vec3; readonly mirror?: 'y'; readonly kernel?: BlendKernel },
): SculptField {
  if (edits.length === 0)
    invalid('sculpt has no edits', "start with an { shape: 'sphere', op: 'add', ... } edit");
  const nodes = compile(edits, o.color, o.mirror === 'y', 'sculpt', o.kernel ?? 'quad');
  const rgb = new Float64Array(3);
  const adds = edits.filter(isAdd);
  const lo = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const hi = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const e of adds) {
    const [a, b] = editBounds(e, o.mirror === 'y');
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k] ?? 0, a[k] ?? 0);
      hi[k] = Math.max(hi[k] ?? 0, b[k] ?? 0);
    }
  }
  return {
    field: (p) => fold(nodes, p, null, o.color),
    colorAt: (p) => {
      fold(nodes, p, rgb, o.color);
      return [rgb[0] ?? 0, rgb[1] ?? 0, rgb[2] ?? 0];
    },
    bounds: [
      [lo[0] ?? 0, lo[1] ?? 0, lo[2] ?? 0],
      [hi[0] ?? 0, hi[1] ?? 0, hi[2] ?? 0],
    ],
    // sdf's default for near-exact fields; strokes add their declared cost on top.
    lipschitz: 1.25 + lipschitzExtra(nodes),
  };
}

export function sculpt(o: SculptOptions): Mesh {
  const s = sculptField(o.edits, {
    color: o.color,
    ...(o.mirror ? { mirror: o.mirror } : {}),
    ...(o.kernel ? { kernel: o.kernel } : {}),
  });
  return sdf({
    field: s.field,
    bounds: s.bounds,
    resolution: o.resolution,
    lipschitz: s.lipschitz,
    ...(o.detail ? { detail: o.detail } : {}),
    color: (p) => s.colorAt(p),
    ...(o.mesher ? { mesher: o.mesher } : {}),
    ...(o.mirror === 'y' ? { symmetry: 'y' as const } : {}),
    ...(o.strip ? { strip: o.strip } : {}),
  });
}
