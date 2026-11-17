// QA `model`, doubled features (T3D_MODEL_DOUBLED): a model body mirrored across a plane that is
// not its sagittal plane grows two muzzles; a far-side leg left on the mirror plane becomes a
// fifth leg. Independent of how the asset was made, the mesh is cut by planes and the closed
// outlines are counted (segments joined through the mesh edges they cross, vertices welded by
// position):
//   head — the plane across the head bone at 70 % of its length: ONE outline near the bone, no
//          more than GIRTH bone lengths round (two muzzles side by side fuse into one wide one)
//   legs — the horizontal plane at a tenth of the skeleton's height: one outline per foot bone
//          (outlines lying on the tail's bones aside; a sliver between the legs is a finding)
// Outlines shorter than SPECK of the skeleton's height are ignored.

import type { Armature, Mesh, Vec3 } from '../core/index.ts';
import { MID_SUFFIX } from './deform.ts';
import { feetOf } from './gait.ts';

/** Outline length ÷ skeleton height below which a cut is a speck, not a feature. */
export const SPECK = 0.04;
/** Where the muzzle is cut, as a share of the head bone (past the ears). */
export const HEAD_CUTS: readonly number[] = [0.7];
/** Largest muzzle outline ÷ head bone length. Wolf: 1.2 (single-pass and two-pass); the
 *  two-headed mirrored wolf: 3.2; a head bone lying in the neck (the first bear): 4.6. */
export const GIRTH = 2;
/** A head bone within 30° of vertical is an upright head… */
export const UPRIGHT = Math.cos(Math.PI / 6);
/** …whose outline may be this share of the skeleton's height round (a 0.57 m human head on a
 *  1.8 m body: 0.32; two heads side by side would pass 0.5). */
export const GIRTH_UPRIGHT = 0.36;

/** An outline whose centre is within this share of the skeleton's height of a tail bone is the
 *  tail's, not a leg's. */
const TAIL_NEAR = 0.08;

/** Distance from `p` to the segment a → b. */
function toSegment(p: Vec3, a: Vec3, b: Vec3): number {
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const l = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  const t =
    l > 0
      ? Math.max(
          0,
          Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1] + (p[2] - a[2]) * d[2]) / l),
        )
      : 0;
  return Math.hypot(p[0] - a[0] - d[0] * t, p[1] - a[1] - d[1] * t, p[2] - a[2] - d[2] * t);
}

const welded = new WeakMap<Float32Array, Int32Array>();

function weld(mesh: Mesh): Int32Array {
  const seen = welded.get(mesh.positions);
  if (seen) return seen;
  const P = mesh.positions;
  const ids = new Map<string, number>();
  const id = Int32Array.from({ length: P.length / 3 }, (_, v) => {
    const key = `${P[v * 3]},${P[v * 3 + 1]},${P[v * 3 + 2]}`;
    const at = ids.get(key) ?? ids.size;
    ids.set(key, at);
    return at;
  });
  welded.set(mesh.positions, id);
  return id;
}

/** One closed cut: its length (metres) and the mean of its cut points. */
export interface Outline {
  readonly length: number;
  readonly centre: Vec3;
}

/**
 * The separate outlines where the plane through `at` with normal `n` cuts the
 * mesh (see Outline), longest first; `keep` limits the cut to triangles it accepts (by their centre).
 */
export function outlines(
  mesh: Mesh,
  at: Vec3,
  n: Vec3,
  keep: (centre: Vec3) => boolean = () => true,
): Outline[] {
  const P = mesh.positions;
  const id = weld(mesh);
  const side = (v: number): number =>
    ((P[v * 3] ?? 0) - at[0]) * n[0] +
    ((P[v * 3 + 1] ?? 0) - at[1]) * n[1] +
    ((P[v * 3 + 2] ?? 0) - at[2]) * n[2];
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r) ?? r;
    parent.set(k, r);
    return r;
  };
  const length = new Map<string, number>();
  // Per outline: the sum of its cut points and their count (merging stays O(1)).
  const points = new Map<string, [number, number, number, number]>();
  const add = (k: string, q: readonly number[], n: number): void => {
    const s = points.get(k) ?? [0, 0, 0, 0];
    points.set(k, [s[0] + (q[0] ?? 0), s[1] + (q[1] ?? 0), s[2] + (q[2] ?? 0), s[3] + n]);
  };
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const v = [mesh.indices[t] ?? 0, mesh.indices[t + 1] ?? 0, mesh.indices[t + 2] ?? 0];
    const d = v.map(side);
    if (d.every((x) => x >= 0) || d.every((x) => x < 0)) continue;
    const centre: Vec3 = [0, 1, 2].map(
      (a) => v.reduce((s, i) => s + (P[i * 3 + a] ?? 0), 0) / 3,
    ) as [number, number, number];
    if (!keep(centre)) continue;
    const cuts: { key: string; p: Vec3 }[] = [];
    for (let e = 0; e < 3; e++) {
      const [a, b] = [v[e] ?? 0, v[(e + 1) % 3] ?? 0];
      const [da, db] = [d[e] ?? 0, d[(e + 1) % 3] ?? 0];
      if (da >= 0 === db >= 0) continue;
      const u = da / (da - db);
      const [ia, ib] = [id[a] ?? 0, id[b] ?? 0];
      cuts.push({
        key: ia < ib ? `${ia}:${ib}` : `${ib}:${ia}`,
        p: [0, 1, 2].map(
          (k) => (P[a * 3 + k] ?? 0) + ((P[b * 3 + k] ?? 0) - (P[a * 3 + k] ?? 0)) * u,
        ) as [number, number, number],
      });
    }
    const [x, y] = cuts;
    if (!x || !y) continue;
    for (const c of [x, y]) if (!parent.has(c.key)) parent.set(c.key, c.key);
    const [rx, ry] = [find(x.key), find(y.key)];
    const seg = Math.hypot(x.p[0] - y.p[0], x.p[1] - y.p[1], x.p[2] - y.p[2]);
    if (rx !== ry) {
      parent.set(ry, rx);
      length.set(rx, (length.get(rx) ?? 0) + (length.get(ry) ?? 0));
      const moved = points.get(ry);
      if (moved) add(rx, moved, moved[3]);
      length.delete(ry);
      points.delete(ry);
    }
    length.set(rx, (length.get(rx) ?? 0) + seg);
    add(rx, x.p, 1);
    add(rx, y.p, 1);
  }
  return [...length]
    .map(([k, l]) => {
      const s = points.get(k) ?? [0, 0, 0, 0];
      const n = Math.max(s[3], 1);
      return { length: l, centre: [s[0] / n, s[1] / n, s[2] / n] as Vec3 };
    })
    .sort((a, b) => b.length - a.length);
}

export interface Doubled {
  readonly what: string;
  readonly found: number;
  readonly expected: string;
}

/** Features the part shows more than once (or not at all), given its skeleton. */
export function doubledFeatures(mesh: Mesh, at: Vec3, sk: Armature): Doubled[] {
  const top = Math.max(...sk.bones.map((b) => Math.max(b.head[2], b.tail[2])));
  const speck = top * SPECK;
  const local = (p: Vec3): Vec3 => [p[0] - at[0], p[1] - at[1], p[2] - at[2]];
  const out: Doubled[] = [];
  const head = sk.bones.find((b) => /(^|_)head$/.test(b.name));
  if (head) {
    const axis: Vec3 = [
      head.tail[0] - head.head[0],
      head.tail[1] - head.head[1],
      head.tail[2] - head.head[2],
    ];
    const len = Math.hypot(axis[0], axis[1], axis[2]);
    for (const t of HEAD_CUTS) {
      const c = local([
        head.head[0] + axis[0] * t,
        head.head[1] + axis[1] * t,
        head.head[2] + axis[2] * t,
      ]);
      // Whole outlines whose middle lies near the bone (the plane also crosses legs or a tail).
      const cut = outlines(mesh, c, axis).filter(
        (o) => Math.hypot(o.centre[0] - c[0], o.centre[1] - c[1], o.centre[2] - c[2]) < len * 0.6,
      );
      const big = cut.filter((o) => o.length > Math.max(speck, (cut[0]?.length ?? 0) * 0.4));
      // A muzzle is measured against its bone; an upright head (a biped's: a short vertical bone
      // under a round skull) against the body's height.
      const upright = Math.abs(axis[2]) > len * UPRIGHT;
      const [girth, cap] = upright
        ? [(big[0]?.length ?? 0) / top, GIRTH_UPRIGHT]
        : [(big[0]?.length ?? 0) / len, GIRTH];
      if (big.length !== 1 || girth > cap) {
        out.push({
          what:
            big.length === 1
              ? `the head, ${Math.round(t * 100)} % along bone '${head.name}', is ${girth.toFixed(2)}× the ${upright ? "skeleton's height" : "bone's length"} round (≤ ${cap}: two heads side by side, or the bone is not in the head)`
              : `the head, ${Math.round(t * 100)} % along bone '${head.name}'`,
          found: big.length === 1 ? 2 : big.length,
          expected: '1',
        });
        break;
      }
    }
  }
  const feet = feetOf(sk).filter((b) => !b.name.endsWith(MID_SUFFIX)).length;
  if (feet > 0) {
    // Outlines that lie on the tail's own bones are the tail's (one where it hangs through the
    // cut, two where it rests on the ground and its tip curls up again): not legs.
    const tails = sk.bones.filter((b) => /(^|_)tail_\d+$/.test(b.name));
    const onTail = (c: Vec3): boolean =>
      tails.some((b) => toSegment(c, local(b.head), local(b.tail)) < top * TAIL_NEAR);
    const n = outlines(mesh, local([0, 0, top * 0.1]), [0, 0, 1]).filter(
      (o) => o.length > speck && !onTail(o.centre),
    ).length;
    if (n !== feet)
      out.push({
        what: `legs at z = ${(top * 0.1).toFixed(2)} m`,
        found: n,
        expected: `${feet} (outlines on the tail's bones aside)`,
      });
  }
  return out;
}
