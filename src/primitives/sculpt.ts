// Sculpting as an ordered list of SDF edits (the Dreams model): each edit adds, subtracts,
// intersects or paints a simple shape, blended into everything before it by a smooth-min of
// radius `blend` metres. Colour rides the same blend weights, so skin, lips, eye whites and tusks
// come out as vertex colour on ONE mesh. `mirror: 'y'` makes every edit symmetric left/right
// (Y in our Z-up, +X-front frame); an edit can opt out. Meshed by `sdf` (smooth gradient normals),
// bounds found from the edits. `resolution` = cell edge in metres: ctx.pick([0.004, 0.012, 0.03]).
// `sculptField` exposes the field + colour so a recipe can displace it before meshing.

import type { Mesh, Vec3 } from '../core/index.ts';
import type { StripId } from '../material/index.ts';
import { invalid } from './check.ts';
import { editBounds, type SculptEdit } from './sculpt-edit.ts';
import { compile, fold } from './sculpt-tree.ts';
import { sdf } from './sdf.ts';
import type { Field } from './sdf-ops.ts';

export type { SculptEdit, SculptGroup, SculptShape, SculptShapeEdit } from './sculpt-edit.ts';

export interface SculptField {
  readonly field: Field;
  /** Blended edit colour at a point (call at surface points). */
  readonly colorAt: (p: Vec3) => Vec3;
  /** Edits' bounds grown by their blend radii. */
  readonly bounds: readonly [Vec3, Vec3];
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
}

export function sculptField(
  edits: readonly SculptEdit[],
  o: { readonly color: Vec3; readonly mirror?: 'y' },
): SculptField {
  if (edits.length === 0)
    invalid('sculpt has no edits', "start with an { shape: 'sphere', op: 'add', ... } edit");
  const nodes = compile(edits, o.color, o.mirror === 'y');
  const rgb = new Float64Array(3);
  const adds = edits.filter((e) => (e.op ?? 'add') === 'add');
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
  };
}

export function sculpt(o: SculptOptions): Mesh {
  const s = sculptField(o.edits, { color: o.color, ...(o.mirror ? { mirror: o.mirror } : {}) });
  return sdf({
    field: s.field,
    bounds: s.bounds,
    resolution: o.resolution,
    color: (p) => s.colorAt(p),
    ...(o.mesher ? { mesher: o.mesher } : {}),
    ...(o.mirror === 'y' ? { symmetry: 'y' as const } : {}),
    ...(o.strip ? { strip: o.strip } : {}),
  });
}
