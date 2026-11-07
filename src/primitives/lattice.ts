// A truss between two points: bridges, girders, crane jibs, signal gantries, pylons, towers.
// Planar (two chords) or, with `width`, a box truss (four chords, every face braced). Members are
// square tubes or angle iron with flat normals, written into one builder. `from → to` is the
// base chord (or the centreline with `centred`); `depth` rises along `up`. Patterns per bay:
//   warren  /\/\/\  diagonals only       pratt  |\|\|/|/|  verticals, diagonals down to centre
//   howe    |/|/|\|\|  the reverse       x      |X|X|X|    verticals + both diagonals
// Pratt/Howe put an X in the middle bay when `bays` is odd. LOD knobs: `bays`, `section`, and
// dropping `width` (box → planar), chosen by the recipe with ctx.pick.
//   triangles = chords·(S + C) + faces·web·S    S = 8 square | 12 angle, C = 4 | 8 (end caps)
//   chords = 2 | 4, faces = 1 | 4, web = warren k · pratt/howe 2k + 1 + (k odd) · x 3k + 1

import { type Mesh, MeshBuilder, normalize, type Vec3 } from '../core/index.ts';
import { type StripId, stripRect } from '../material/index.ts';
import { count, invalid, positive } from './check.ts';
import { emitMember, type SectionKind, section } from './member.ts';

export type TrussPattern = 'warren' | 'pratt' | 'howe' | 'x';

export interface LatticeOptions {
  readonly from: Vec3;
  readonly to: Vec3;
  /** Chord-to-chord height in metres (at `from`; `depthEnd` tapers it toward `to`). */
  readonly depth: number;
  readonly depthEnd?: number;
  /** Box truss: chord spacing across, metres (and `widthEnd`). Omit for a planar truss. */
  readonly width?: number;
  readonly widthEnd?: number;
  /** Which way depth rises. Default world Z (world X for a vertical truss). */
  readonly up?: Vec3;
  readonly centred?: boolean;
  readonly pattern?: TrussPattern;
  /** Panels along the length. Default ≈ length / depth. */
  readonly bays?: number;
  /** Chord member width, metres. */
  readonly chord: number;
  /** Web member width. Default 0.6 · chord. */
  readonly web?: number;
  readonly section?: SectionKind;
  readonly color: Vec3;
  readonly strip?: StripId;
}

type Line = (t: number) => Vec3;

export function lattice(o: LatticeOptions): Mesh {
  const d: Vec3 = [o.to[0] - o.from[0], o.to[1] - o.from[1], o.to[2] - o.from[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  if (!(len > 1e-6))
    invalid('lattice: from and to coincide', 'give the truss two distinct end points in metres');
  const depth = positive('lattice depth', o.depth, 'e.g. 2 for a 2 m deep girder');
  const chord = positive('lattice chord', o.chord, 'e.g. 0.2');
  if (chord >= depth)
    invalid(
      `lattice chord ${chord} m ≥ depth ${depth} m`,
      'make the chord member thinner than the depth',
    );
  const web = positive('lattice web', o.web ?? chord * 0.6, 'e.g. 0.6 · chord');
  const k = count('lattice bays', o.bays ?? Math.max(1, Math.round(len / depth)), 1, 2000);
  const w = normalize(d);
  const upHint: Vec3 = o.up ?? (Math.abs(w[2]) > 0.95 ? [1, 0, 0] : [0, 0, 1]);
  const dotU = upHint[0] * w[0] + upHint[1] * w[1] + upHint[2] * w[2];
  const upR: Vec3 = [upHint[0] - w[0] * dotU, upHint[1] - w[1] * dotU, upHint[2] - w[2] * dotU];
  if (Math.hypot(upR[0], upR[1], upR[2]) < 1e-6)
    invalid('lattice: up is parallel to from → to', 'pass an `up` perpendicular to the truss axis');
  const up = normalize(upR);
  const side: Vec3 = [
    w[1] * up[2] - w[2] * up[1],
    w[2] * up[0] - w[0] * up[2],
    w[0] * up[1] - w[1] * up[0],
  ];
  const dEnd = positive('lattice depthEnd', o.depthEnd ?? depth, 'e.g. 1');
  const wid = o.width === undefined ? 0 : positive('lattice width', o.width, 'e.g. 2');
  const wEnd =
    o.width === undefined ? 0 : positive('lattice widthEnd', o.widthEnd ?? wid, 'e.g. 1');
  const c0 = o.centred ? -0.5 : 0;
  /** A chord line at lateral sign a (−1/0/+1) and height c (0 = base, 1 = top). */
  const line =
    (a: number, c: number): Line =>
    (t) => {
      const along = len * t;
      const lat = (a * (wid + (wEnd - wid) * t)) / 2;
      const h = (c0 + c) * (depth + (dEnd - depth) * t);
      return [
        o.from[0] + w[0] * along + side[0] * lat + up[0] * h,
        o.from[1] + w[1] * along + side[1] * lat + up[1] * h,
        o.from[2] + w[2] * along + side[2] * lat + up[2] * h,
      ];
    };
  const neg = (v: Vec3): Vec3 => [-v[0], -v[1], -v[2]];
  // Each face: two chord lines, the face normal (members' section up).
  const faces: [Line, Line, Vec3][] =
    o.width === undefined
      ? [[line(0, 0), line(0, 1), side]]
      : [
          [line(-1, 0), line(-1, 1), neg(side)],
          [line(1, 0), line(1, 1), side],
          [line(-1, 1), line(1, 1), up],
          [line(-1, 0), line(1, 0), neg(up)],
        ];
  const chords: Line[] =
    o.width === undefined
      ? [line(0, 0), line(0, 1)]
      : [line(-1, 0), line(1, 0), line(-1, 1), line(1, 1)];
  const rect = stripRect(o.strip ?? 'iron');
  const sc = section(o.section ?? 'square', chord);
  const sw = section(o.section ?? 'square', web);
  const mb = new MeshBuilder();
  for (const c of chords) emitMember(mb, sc, c(0), c(1), up, true, o.color, rect);
  for (const [lo, hi, n] of faces)
    for (const [ta, la, tb, lb] of webMembers(o.pattern ?? 'warren', k))
      emitMember(mb, sw, (la ? hi : lo)(ta), (lb ? hi : lo)(tb), n, false, o.color, rect);
  return mb.build();
}

/** Web members of one face as [t0, onTop0, t1, onTop1], in a fixed order (determinism). */
export function webMembers(pattern: TrussPattern, k: number): [number, boolean, number, boolean][] {
  const out: [number, boolean, number, boolean][] = [];
  const t = (i: number): number => i / k;
  if (pattern !== 'warren') for (let i = 0; i <= k; i++) out.push([t(i), false, t(i), true]);
  for (let i = 0; i < k; i++) {
    const down: [number, boolean, number, boolean] = [t(i), true, t(i + 1), false]; // "\"
    const rise: [number, boolean, number, boolean] = [t(i), false, t(i + 1), true]; // "/"
    const middle = k % 2 === 1 && i === (k - 1) / 2;
    const left = i < k / 2;
    if (pattern === 'warren') out.push(i % 2 === 0 ? rise : down);
    else if (pattern === 'x' || middle) out.push(rise, down);
    else if (pattern === 'pratt') out.push(left ? down : rise);
    else out.push(left ? rise : down);
  }
  return out;
}
