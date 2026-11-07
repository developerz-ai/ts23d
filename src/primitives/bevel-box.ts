// A box with every edge chamfered once (`box({ bevel })`): the hard-surface "mid-poly" look. Six
// faces shrink by `bevel`, 12 chamfer quads take the 45° normal and 8 corner triangles the
// 3-axis diagonal, all flat per face (own vertices), so a face-weighted-normal pass turns the
// chamfers into rounded highlights without a bake. UVs: every vertex keeps its own face's mapping
// (the box's), so the thin chamfer reuses the nearest face's strip texels.
//   triangles = 44 − 2 per omitted face

import { type Mesh, MeshBuilder, normalize, type Vec3 } from '../core/index.ts';
import { type StripId, stripRect } from '../material/index.ts';

type Sign = 1 | -1;
type FaceName = 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right';

/** Face axes as in box.ts: index = axis * 2 + (sign > 0 ? 0 : 1). */
const FACES: readonly { name: FaceName; u: Vec3; v: Vec3 }[] = [
  { name: 'front', u: [0, 1, 0], v: [0, 0, 1] },
  { name: 'back', u: [0, -1, 0], v: [0, 0, 1] },
  { name: 'left', u: [-1, 0, 0], v: [0, 0, 1] },
  { name: 'right', u: [1, 0, 0], v: [0, 0, 1] },
  { name: 'top', u: [1, 0, 0], v: [0, 1, 0] },
  { name: 'bottom', u: [1, 0, 0], v: [0, -1, 0] },
];
const SIGNS: readonly Sign[] = [-1, 1];

export interface BevelBoxInput {
  readonly half: Vec3;
  readonly centre: Vec3;
  readonly bevel: number;
  readonly color: Vec3;
  readonly strip: StripId;
  readonly omit: readonly FaceName[];
}

export function bevelBox(o: BevelBoxInput): Mesh {
  const { half, centre, bevel: bv } = o;
  const rect = stripRect(o.strip);
  const b = new MeshBuilder();
  const dot3 = (a: Vec3, c: Vec3): number => a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
  const ext = (a: Vec3): number =>
    Math.abs(a[0]) * half[0] + Math.abs(a[1]) * half[1] + Math.abs(a[2]) * half[2];
  /** Corner s on the face of axis k: inset by the bevel on the two other axes. */
  const point = (s: readonly Sign[], k: number): Vec3 => [
    centre[0] + (s[0] ?? 1) * (half[0] - (k === 0 ? 0 : bv)),
    centre[1] + (s[1] ?? 1) * (half[1] - (k === 1 ? 0 : bv)),
    centre[2] + (s[2] ?? 1) * (half[2] - (k === 2 ? 0 : bv)),
  ];
  const put = (s: readonly Sign[], k: number, n: Vec3): number => {
    const f = FACES[k * 2 + ((s[k] ?? 1) > 0 ? 0 : 1)] ?? { u: n, v: n };
    const p = point(s, k);
    const rel: Vec3 = [p[0] - centre[0], p[1] - centre[1], p[2] - centre[2]];
    const eu = ext(f.u);
    const ev = ext(f.v);
    return b.vertex({
      p,
      n,
      uv: [
        rect.u0 + ((dot3(rel, f.u) + eu) / rect.metres) * (rect.u1 - rect.u0),
        rect.v0 + ((dot3(rel, f.v) + ev) / (2 * ev)) * (rect.v1 - rect.v0),
      ],
      color: o.color,
    });
  };
  /** Emit a polygon, flipping it if its winding disagrees with the outward normal. */
  const poly = (corners: readonly (readonly [readonly Sign[], number])[], n: Vec3): void => {
    const pts = corners.map(([s, k]) => point(s, k));
    const [a = n, c = n, d = n] = pts;
    const e1: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const e2: Vec3 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const g: Vec3 = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    const ids = corners.map(([s, k]) => put(s, k, n));
    if (dot3(g, n) < 0) ids.reverse();
    const [i0 = 0, i1 = 0, i2 = 0, i3] = ids;
    if (i3 === undefined) b.tri(i0, i1, i2);
    else b.quad(i0, i1, i2, i3);
  };
  const unit = (k: number, s: number): Vec3 => [k === 0 ? s : 0, k === 1 ? s : 0, k === 2 ? s : 0];
  const corner = (k: number, sk: Sign, l: number, sl: Sign, m: number, sm: Sign): Sign[] => {
    const s: Sign[] = [1, 1, 1];
    s[k] = sk;
    s[l] = sl;
    s[m] = sm;
    return s;
  };
  // Faces (axis k, sign sk): four corners in a ring over the other two axes.
  for (let k = 0; k < 3; k++) {
    const [l, m] = [(k + 1) % 3, (k + 2) % 3];
    for (const sk of SIGNS) {
      if (o.omit.includes((FACES[k * 2 + (sk > 0 ? 0 : 1)] ?? { name: 'top' }).name)) continue;
      const ring = (
        [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ] as const
      ).map(([a, c]) => [corner(k, sk, l, a, m, c), k] as const);
      poly(ring, unit(k, sk));
    }
  }
  // Chamfers along axis m between the faces of axes k and l.
  for (let m = 0; m < 3; m++) {
    const [k, l] = [(m + 1) % 3, (m + 2) % 3];
    for (const sk of SIGNS)
      for (const sl of SIGNS) {
        const lo = corner(k, sk, l, sl, m, -1);
        const hi = corner(k, sk, l, sl, m, 1);
        const n = normalize(
          [0, 1, 2].map((j) => (j === k ? sk : j === l ? sl : 0)) as unknown as Vec3,
        );
        poly(
          [
            [lo, k],
            [hi, k],
            [hi, l],
            [lo, l],
          ],
          n,
        );
      }
  }
  // Corners: one triangle across the three face corners.
  for (const sx of SIGNS)
    for (const sy of SIGNS)
      for (const sz of SIGNS) {
        const s: Sign[] = [sx, sy, sz];
        poly(
          [
            [s, 0],
            [s, 1],
            [s, 2],
          ],
          normalize([sx, sy, sz]),
        );
      }
  return b.build();
}
