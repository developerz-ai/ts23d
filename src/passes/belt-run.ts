// One pitch of a track belt's travel: every body of the belt mesh (belt-bodies.ts) is bound to the
// centre line and paired with its TWIN, the congruent body one pitch on. `pose(f)` then carries
// each body rigidly from its own place (f = 0) onto its twin's (f = 1): the centre follows the
// loop, the turn about the axle direction grows linearly, so at f = 1 the belt covers its rest
// shape point for point and a looping clip can jump back to f = 0 unseen. A body with no twin
// (a belt that does not repeat every pitch) is reported and left where it is: `pose` writes its
// rest positions and normals at every f.

import { type BeltBody, type BeltMesh, beltBodies, VertexGrid } from './belt-bodies.ts';
import { BeltLoop } from './belt-loop.ts';
import { type BeltSeam, beltSeam, type SeamLimits } from './belt-seam.ts';

type V3 = readonly [number, number, number];

export interface BeltRun {
  readonly vertices: number;
  /** Vertices with no twin one pitch on; 0 = the belt repeats and the loop closes. */
  readonly unmatched: number;
  /** Furthest a vertex is eased to meet its twin (a link reshaped by `onGround`), metres. */
  readonly residual: number;
  /** Largest turn of a body over one pitch, radians (links going round a sprocket). */
  readonly turn: number;
  /** Length of the centre line, metres. */
  readonly length: number;
  /** Per vertex, the rest vertex it lands on after one pitch; −1 for a vertex with no twin. */
  readonly twins: Int32Array;
  /** How far the mesh's colours and UVs are from repeating every pitch (belt-seam.ts); a vertex
   *  eased onto its twin (see `residual`) is not compared. */
  look(colors: ArrayLike<number>, uvs: ArrayLike<number>, limits: SeamLimits): BeltSeam;
  /** Positions and normals after `f` pitches of travel, 0..1, written into the given arrays. */
  pose(f: number, positions: { [i: number]: number }, normals: { [i: number]: number }): void;
}

/** A twin's vertices sit within this share of the pitch of where the body's land (and 5 cm): a
 *  link pressed flat on the ground run (`onGround`) still pairs, and eases into that shape. */
const REACH = 0.25;
const REACH_MAX = 0.05;
/** A bending vertex follows the resampled line: its twin may be this far off (metres). */
const BEND = 1e-3;
const TRIES = 8;

const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const ZERO: V3 = [0, 0, 0];
const median = (of: readonly { readonly off: V3 }[], k: 0 | 1 | 2): number =>
  of.map((w) => w.off[k]).sort((p, q) => p - q)[Math.floor(of.length / 2)] ?? 0;

interface Bound {
  readonly body: BeltBody;
  /** Arc length of the line point nearest the centre, and the centre's offset from it: as a
   *  vector (a rigid body turns it) and as (along, out, across) of the line there (a bending one). */
  readonly s: number;
  readonly arm: V3;
  readonly off: V3;
  /** Turn about the belt normal and centre correction that put it on its twin at f = 1. */
  turn: number;
  shift: V3;
  /** False until a twin is found: such a body does not travel. */
  paired: boolean;
}

/**
 * Binds `mesh` (in the tread part's space) to the belt `path`. `pitch` is signed: positive runs
 * the links the way the path winds, negative against it.
 */
export function beltRun(
  path: readonly (readonly number[])[],
  pitch: number,
  mesh: BeltMesh,
): BeltRun {
  const loop = new BeltLoop(path);
  const b = loop.normal;
  const pos = mesh.positions;
  const nrm = mesh.normals;
  const count = Math.floor(pos.length / 3);
  const at = (a: ArrayLike<number>, v: number): V3 => [
    a[v * 3] ?? 0,
    a[v * 3 + 1] ?? 0,
    a[v * 3 + 2] ?? 0,
  ];
  const f6 = new Float64Array(6);
  /** The point with offset `off` from the line at arc length `s`. */
  const ride = (s: number, off: V3): V3 => {
    loop.frame(s, f6);
    const t: V3 = [f6[3] ?? 0, f6[4] ?? 0, f6[5] ?? 0];
    const n = cross(b, t);
    const along = (k: 0 | 1 | 2): number =>
      (f6[k] ?? 0) + off[0] * t[k] + off[1] * n[k] + off[2] * b[k];
    return [along(0), along(1), along(2)];
  };
  // In-plane axes to measure turns in: e1 × e2 = b.
  loop.frame(0, f6);
  const e2 = cross(b, [f6[3] ?? 0, f6[4] ?? 0, f6[5] ?? 0]);
  const e1 = cross(e2, b);
  const angle = (r: V3): number => Math.atan2(dot(r, e2), dot(r, e1));
  const heading = (s: number): number => {
    loop.frame(s, f6);
    return angle([f6[3] ?? 0, f6[4] ?? 0, f6[5] ?? 0]);
  };
  const turned = (r: V3, a: number): V3 => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    const x = cross(b, r);
    const along = dot(b, r) * (1 - c);
    return [
      r[0] * c + x[0] * s + b[0] * along,
      r[1] * c + x[1] * s + b[1] * along,
      r[2] * c + x[2] * s + b[2] * along,
    ];
  };
  const sub = (a: V3, c: V3): V3 => [a[0] - c[0], a[1] - c[1], a[2] - c[2]];
  const add = (a: V3, c: V3): V3 => [a[0] + c[0], a[1] + c[1], a[2] + c[2]];

  const point = (s: number): V3 => {
    loop.frame(s, f6);
    return [f6[0] ?? 0, f6[1] ?? 0, f6[2] ?? 0];
  };
  const bound = beltBodies(mesh, b, Math.abs(pitch)).map((body): Bound => {
    const s = loop.nearest(body.centre);
    loop.frame(s, f6);
    const t: V3 = [f6[3] ?? 0, f6[4] ?? 0, f6[5] ?? 0];
    const arm = sub(body.centre, [f6[0] ?? 0, f6[1] ?? 0, f6[2] ?? 0]);
    const off: V3 = [dot(arm, t), dot(arm, cross(b, t)), dot(arm, b)];
    return { body, s, arm, off, turn: 0, shift: [0, 0, 0], paired: false };
  });
  const reach = Math.min(REACH * Math.abs(pitch), REACH_MAX);
  const grid = new VertexGrid(pos, Math.max(reach, BEND));
  /** The rest vertex nearest `q` whose normal is `n` (−1 when none within `within`). */
  const twinAt = (q: V3, n: V3, within: number): number => {
    let best = -1;
    let least = Infinity;
    grid.near(q[0], q[1], q[2], within, (v, d2) => {
      if (d2 < least && dot(at(nrm, v), n) > 0.999) [least, best] = [d2, v];
    });
    return best;
  };
  const flat = (r: V3): number => Math.sqrt(Math.max(0, dot(r, r) - dot(r, b) ** 2));
  // Rigid centres by cell of half a pitch: a body's twin is looked up among its neighbours there,
  // not among every body of the belt.
  const rigid = bound.filter((x) => x.body.rigid);
  const half = Math.abs(pitch) / 2;
  // A hair wider than half a pitch: the exact `< half` test below decides, not the grid's rounding.
  const wide = half * 1.001;
  const centres = new VertexGrid(Float64Array.from(rigid.flatMap((x) => x.body.centre)), wide);
  const fix = new Float64Array(count * 3);
  const twinOf = new Int32Array(count).fill(-1);
  let unmatched = 0;
  let turn = 0;
  let residual = 0;
  for (const x of bound) {
    const { body } = x;
    const guess = wrap(heading(x.s + pitch) - heading(x.s));
    if (!body.rigid) {
      // A bending body is ONE vertex (belt-bodies.ts): its twin is the whole body's.
      const v = body.verts[0] ?? 0;
      const landed = ride(x.s + pitch, x.off);
      const twin = twinAt(landed, turned(at(nrm, v), guess), BEND);
      if (twin < 0) unmatched++;
      else {
        twinOf[v] = twin;
        x.paired = true;
        x.turn = guess;
        x.shift = sub(at(pos, twin), landed);
        turn = Math.max(turn, Math.abs(guess));
      }
      continue;
    }
    // The turn onto the twin, read off a normal that lies in the belt plane (normals keep their
    // direction when a pass moves vertices, positions do not).
    let probe = body.verts[0] ?? 0;
    for (const v of body.verts) if (flat(at(nrm, v)) > flat(at(nrm, probe))) probe = v;
    const facing = at(nrm, probe);
    const hub = point(x.s + pitch);
    const lands = add(hub, turned(x.arm, guess));
    const close: number[] = [];
    centres.near(lands[0], lands[1], lands[2], wide, (i) => close.push(i));
    // In mesh order before the stable sort by distance: the order ties were always broken in.
    const near = close
      .sort((p, q) => p - q)
      .flatMap((i) => {
        const y = rigid[i];
        return y ? [{ y, d: Math.hypot(...sub(y.body.centre, lands)) }] : [];
      })
      .filter((c) => c.y !== x && c.d < half)
      .sort((p, q) => p.d - q.d)
      .slice(0, TRIES);
    const paired = near.some(({ y }) => {
      const turns =
        flat(facing) < 0.5
          ? [guess]
          : [
              ...new Set(
                y.body.verts
                  .map((u) => at(nrm, u))
                  .filter((n) => Math.abs(dot(n, b) - dot(facing, b)) < 0.01)
                  .map((n) => Math.round(wrap(angle(n) - angle(facing)) * 1e4) / 1e4),
              ),
            ].sort((p, q) => Math.abs(wrap(p - guess)) - Math.abs(wrap(q - guess)));
      return turns.slice(0, TRIES).some((a) => {
        const pair = (centre: V3) =>
          body.verts.map((v) => {
            const target = add(centre, turned(sub(at(pos, v), body.centre), a));
            const twin = twinAt(target, turned(at(nrm, v), a), reach);
            return { v, twin, off: twin < 0 ? ZERO : sub(at(pos, twin), target) };
          });
        // A few moved vertices (a corner pressed flat) pull the two centres apart: line the
        // bodies up on the median offset, the one their unmoved vertices agree on.
        const rough = pair(y.body.centre);
        if (rough.some((w) => w.twin < 0)) return false;
        const centre = add(y.body.centre, [median(rough, 0), median(rough, 1), median(rough, 2)]);
        const twins = pair(centre);
        const shift = sub(centre, add(hub, turned(x.arm, a)));
        // A true twin lies one pitch on: a neighbour further off means the pitch is wrong.
        if (Math.hypot(...shift) > reach || twins.some((w) => w.twin < 0)) return false;
        x.turn = a;
        x.shift = shift;
        for (const w of twins) {
          fix.set(w.off, w.v * 3);
          twinOf[w.v] = w.twin;
          residual = Math.max(residual, Math.hypot(...w.off));
        }
        return true;
      });
    });
    x.paired = paired;
    if (!paired) unmatched += body.verts.length;
    turn = Math.max(turn, Math.abs(x.turn));
  }

  return {
    vertices: count,
    unmatched,
    residual,
    turn,
    length: loop.length,
    twins: twinOf,
    look(colors, uvs, limits): BeltSeam {
      // A vertex eased onto its twin (a corner `onGround` pressed flat) lands on whichever rest
      // vertex is nearest, not always its own counterpart: its shape already differs, skip it.
      const exact = twinOf.map((t, v) =>
        Math.hypot(fix[v * 3] ?? 0, fix[v * 3 + 1] ?? 0, fix[v * 3 + 2] ?? 0) > BEND ? -1 : t,
      );
      return beltSeam({ positions: pos, normals: nrm, colors, uvs }, exact, grid, BEND, limits);
    },
    pose(f, positions, normals): void {
      for (const x of bound) {
        if (!x.paired) {
          for (const v of x.body.verts)
            for (let k = 0; k < 3; k++) {
              positions[v * 3 + k] = pos[v * 3 + k] ?? 0;
              normals[v * 3 + k] = nrm[v * 3 + k] ?? 0;
            }
          continue;
        }
        const a = f * x.turn;
        const c = x.body.rigid
          ? add(point(x.s + f * pitch), turned(x.arm, a))
          : ride(x.s + f * pitch, x.off);
        for (const v of x.body.verts) {
          const r = turned(sub(at(pos, v), x.body.centre), a);
          const n = turned(at(nrm, v), a);
          for (let k = 0; k < 3; k++) {
            positions[v * 3 + k] =
              (c[k] ?? 0) + (r[k] ?? 0) + f * ((x.shift[k] ?? 0) + (fix[v * 3 + k] ?? 0));
            normals[v * 3 + k] = n[k] ?? 0;
          }
        }
      }
    },
  };
}
