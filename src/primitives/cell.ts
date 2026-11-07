// A quad mapped to ONE fixed trim-sheet cell: windows, doors, clocks, signs, leaf cards. Flat
// normal u × v; V grows along `v` (keep `v` world-up so the decal stands upright).
// `inset` > 0 recesses the panel by that depth behind the face plane and closes the gap with four
// reveal faces (jambs, head, sill) mapped at true scale onto `reveal`: real depth that catches
// light and shadow, the cheapest trick that makes a facade read as built. `inset` < 0 raises it
// proud of the plane instead (plaques, sign boards), sides facing out.
// The surrounding wall must leave the opening free (build it from tiled pieces around it).
//   triangles = (doubleSided ? 4 : 2) + (inset ≠ 0 ? 8 : 0)

import { type Mesh, MeshBuilder, normalize, type Vec3 } from '../core/index.ts';
import { type CellId, cellRect, type StripId, stripRect } from '../material/index.ts';
import { invalid, spanOf } from './check.ts';
import { HALF_TEXEL, stripU, stripV, stripVMetres } from './strip-uv.ts';

export interface CellOptions {
  /** Bottom-left corner as seen from the front. */
  readonly origin: Vec3;
  /** Width edge (cell U), metres. */
  readonly u: Vec3;
  /** Height edge (cell V, up), metres. */
  readonly v: Vec3;
  readonly color: Vec3;
  readonly cell: CellId;
  /** Recess depth in metres (> 0 behind the plane, < 0 proud of it). Default 0. */
  readonly inset?: number;
  /** Strip the reveal faces tile at true scale. Default 'plain'. */
  readonly reveal?: StripId;
  readonly revealColor?: Vec3;
  /** Both sides (leaf cards, hanging signs). Not with an inset. */
  readonly doubleSided?: boolean;
}

const add3 = (a: Vec3, b: Vec3, s: number): Vec3 => [
  a[0] + b[0] * s,
  a[1] + b[1] * s,
  a[2] + b[2] * s,
];

export function cell(o: CellOptions): Mesh {
  const { lu, lv, n } = spanOf('cell', o.origin, o.u, o.v);
  const d = o.inset ?? 0;
  if (!Number.isFinite(d))
    invalid(`cell inset is ${d}`, 'use a finite depth in metres (0.1 = a 10 cm recess)');
  if (d !== 0 && o.doubleSided)
    invalid(
      'cell: inset with doubleSided',
      'drop doubleSided for a recessed/raised panel, or set inset: 0',
    );
  const r = cellRect(o.cell);
  const e = HALF_TEXEL;
  const rim: Vec3[] = [
    o.origin,
    add3(o.origin, o.u, 1),
    add3(add3(o.origin, o.u, 1), o.v, 1),
    add3(o.origin, o.v, 1),
  ];
  const face = rim.map((p) => add3(p, n, -d));
  const uvs: [number, number][] = [
    [r.u0 + e, r.v0 + e],
    [r.u1 - e, r.v0 + e],
    [r.u1 - e, r.v1 - e],
    [r.u0 + e, r.v1 - e],
  ];
  const b = new MeshBuilder();
  for (const side of o.doubleSided ? [1, -1] : [1]) {
    const nn: Vec3 = [n[0] * side, n[1] * side, n[2] * side];
    const [i0 = 0, i1 = 0, i2 = 0, i3 = 0] = face.map((p, k) =>
      b.vertex({ p, n: nn, uv: uvs[k] ?? [0, 0], color: o.color }),
    );
    if (side > 0) b.quad(i0, i1, i2, i3);
    else b.quad(i0, i3, i2, i1);
  }
  if (d !== 0) reveals(b, o, rim, face, n, d, [lu, lv, lu, lv]);
  return b.build();
}

/** Four side quads rim[i] → rim[i+1] → face[i+1] → face[i]; that order is CCW for either sign. */
function reveals(
  b: MeshBuilder,
  o: CellOptions,
  rim: readonly Vec3[],
  face: readonly Vec3[],
  n: Vec3,
  d: number,
  lens: readonly number[],
): void {
  const strip = o.reveal ?? 'plain';
  const rect = stripRect(strip);
  const fv = Math.min(1, Math.abs(d) / stripVMetres(strip));
  const color = o.revealColor ?? o.color;
  for (let i = 0; i < 4; i++) {
    const a = rim[i] ?? n;
    const c = rim[(i + 1) % 4] ?? n;
    const ed: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    // n × edge points into the opening; a recess faces inward, a plaque's sides outward.
    const s = Math.sign(d);
    const nn = normalize([
      (n[1] * ed[2] - n[2] * ed[1]) * s,
      (n[2] * ed[0] - n[0] * ed[2]) * s,
      (n[0] * ed[1] - n[1] * ed[0]) * s,
    ]);
    const len = lens[i] ?? 0;
    const q = [a, c, face[(i + 1) % 4] ?? c, face[i] ?? a];
    const uv: [number, number][] = [
      [stripU(rect, 0), stripV(rect, 0)],
      [stripU(rect, len), stripV(rect, 0)],
      [stripU(rect, len), stripV(rect, fv)],
      [stripU(rect, 0), stripV(rect, fv)],
    ];
    const [j0 = 0, j1 = 0, j2 = 0, j3 = 0] = q.map((p, k) =>
      b.vertex({ p, n: nn, uv: uv[k] ?? [0, 0], color }),
    );
    b.quad(j0, j1, j2, j3);
  }
}
