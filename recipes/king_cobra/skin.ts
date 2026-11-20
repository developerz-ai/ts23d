// Cobra weights. Turns of the pile touch, so distance alone would tie one turn to the next and tear
// the skin in every clip that unwinds it. Each vertex finds the body section it lies on (`bodyArc`:
// the centreline sample whose oval section it is nearest, scaled by that section's size), takes the
// spine bone there, then blends only with that bone's neighbours (and the hood ribs, on the neck).

import {
  type BodyPlan,
  capsuleDistance,
  dmath,
  type Mesh,
  SKIN_INFLUENCES,
  type Vec3,
} from '@developerz.ai/ts23d';
import { frameAt, halfW, TOTAL } from './shape.ts';

const STEPS = 255;
/** Section heights over the half-width, as `shape.ts` builds them: back and belly. */
const [TOP, BELLY] = [0.92, 0.7];
const ARC_SAMPLES = Array.from({ length: 701 }, (_, i) => {
  const s = (i / 700) * TOTAL;
  // Scale plates stand a few millimetres proud: a thin tail must still own them.
  return { s, f: frameAt(s), w: Math.max(0.01, halfW(s) + 0.002) };
});

/** Arc position of the section a rest-pose point with outward normal `n` belongs to: the smallest
 *  offset from a centreline sample measured in that sample's own section radii (an oval, flatter
 *  under the belly), among samples the normal faces away from. Where two turns touch, a skin point
 *  sits on both surfaces; only its own axis lies behind it. */
export function bodyArc(p: Vec3, n: Vec3): number {
  let [best, at] = [Infinity, 0];
  for (const { s, f, w } of ARC_SAMPLES) {
    const o: Vec3 = [p[0] - f.p[0], p[1] - f.p[1], p[2] - f.p[2]];
    if (Math.abs(o[0]) > 0.12 || Math.abs(o[1]) > 0.12 || Math.abs(o[2]) > 0.12) continue;
    if (o[0] * n[0] + o[1] * n[1] + o[2] * n[2] < 0) continue;
    const along = (o[0] * f.t[0] + o[1] * f.t[1] + o[2] * f.t[2]) / w;
    const side = (o[0] * f.side[0] + o[1] * f.side[1] + o[2] * f.side[2]) / w;
    const up = o[0] * f.d[0] + o[1] * f.d[1] + o[2] * f.d[2];
    const lift = up / (w * (up >= 0 ? TOP : BELLY));
    const e = along * along + side * side + lift * lift;
    if (e < best) [best, at] = [e, s];
  }
  return at;
}

/** Largest-remainder 1/255 weights, heaviest first, summing to exactly 1. */
function quantised(pairs: readonly (readonly [number, number])[]): [number, number][] {
  const top = [...pairs].sort((a, b) => b[1] - a[1]).slice(0, SKIN_INFLUENCES);
  const sum = top.reduce((t, p) => t + p[1], 0);
  const raw = top.map((p) => (p[1] / sum) * STEPS);
  const q = raw.map(Math.floor);
  let left = STEPS - q.reduce((t, v) => t + v, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left-- <= 0) break;
    q[i] = (q[i] ?? 0) + 1;
  }
  return top.map((p, i): [number, number] => [p[0], q[i] ?? 0]).filter((p) => p[1] > 0);
}

export interface BodySkin {
  readonly spine: readonly string[];
  readonly ribs: readonly string[];
  /** Spine links, from the head, whose skin may follow the hood ribs. */
  readonly hoodLinks: number;
  /** Neighbour links each side that may share a vertex. */
  readonly window: number;
  readonly blend: number;
  /** Spine link a rest-pose vertex (position, normal) belongs to; nearest bone capsule when absent. */
  readonly link?: (p: Vec3, n: Vec3) => number;
}

/** Vertices per piece at or below which a piece (one scale plate, one scute) is linked as a whole. */
const PIECE = 64;

/** Each vertex's link. A small separate piece takes the link of its centre and mean normal, so a
 *  plate whose edge normals point sideways is never split between two turns of the pile. */
function linksOf(mesh: Mesh, link: (p: Vec3, n: Vec3) => number): Int32Array {
  const count = mesh.positions.length / 3;
  const up = Int32Array.from({ length: count }, (_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (up[r] !== r) r = up[r] ?? r;
    for (let k = i; up[k] !== r; ) [k, up[k]] = [up[k] ?? r, r];
    return r;
  };
  const I = mesh.indices;
  for (let t = 0; t < I.length; t += 3)
    for (let k = 1; k < 3; k++) up[find(I[t + k] ?? 0)] = find(I[t] ?? 0);
  const groups = new Map<number, number[]>();
  for (let v = 0; v < count; v++) {
    const r = find(v);
    const g = groups.get(r);
    if (g) g.push(v);
    else groups.set(r, [v]);
  }
  const P = mesh.positions;
  const N = mesh.normals;
  const out = new Int32Array(count);
  const at = (v: number, A: ArrayLike<number>): Vec3 => [
    A[v * 3] ?? 0,
    A[v * 3 + 1] ?? 0,
    A[v * 3 + 2] ?? 0,
  ];
  for (const g of groups.values()) {
    if (g.length > PIECE) {
      for (const v of g) out[v] = link(at(v, P), at(v, N));
      continue;
    }
    const mean = (A: ArrayLike<number>): Vec3 => {
      let [x, y, z] = [0, 0, 0];
      for (const v of g)
        [x, y, z] = [x + (A[v * 3] ?? 0), y + (A[v * 3 + 1] ?? 0), z + (A[v * 3 + 2] ?? 0)];
      return [x / g.length, y / g.length, z / g.length];
    };
    const l = link(mean(P), mean(N));
    for (const v of g) out[v] = l;
  }
  return out;
}

export function skinBody(mesh: Mesh, plan: BodyPlan, o: BodySkin): Mesh {
  const index = new Map(plan.bones.map((b, i) => [b.name, i]));
  const capsule = (name: string) => {
    const b = plan.bones[index.get(name) ?? 0];
    return { a: b?.head ?? ([0, 0, 0] as Vec3), b: b?.tail ?? ([0, 0, 0] as Vec3) };
  };
  const spine = o.spine.map(capsule);
  const ribs = o.ribs.map(capsule);
  const count = mesh.positions.length / 3;
  const joints = new Uint16Array(count * SKIN_INFLUENCES);
  const weights = new Float32Array(count * SKIN_INFLUENCES);
  const links = o.link ? linksOf(mesh, o.link) : undefined;
  for (let v = 0; v < count; v++) {
    const p: Vec3 = [
      mesh.positions[v * 3] ?? 0,
      mesh.positions[v * 3 + 1] ?? 0,
      mesh.positions[v * 3 + 2] ?? 0,
    ];
    let [near, best] = [links?.[v] ?? 0, Infinity];
    if (!links)
      spine.forEach((c, i) => {
        const d = capsuleDistance(p, c);
        if (d < best) [near, best] = [i, d];
      });
    const found: [number, number][] = [];
    const lo = Math.max(0, near - o.window);
    const hi = Math.min(spine.length - 1, near + o.window);
    for (let i = lo; i <= hi; i++)
      found.push([i, capsuleDistance(p, spine[i] ?? (spine[0] as never))]);
    const all: [number, number][] = found.map(([i, d]) => [index.get(o.spine[i] ?? '') ?? 0, d]);
    if (near < o.hoodLinks)
      ribs.forEach((c, i) => {
        all.push([index.get(o.ribs[i] ?? '') ?? 0, capsuleDistance(p, c)]);
      });
    const min = Math.min(...all.map((x) => x[1]));
    const pairs = all
      .map(([j, d]) => [j, dmath.exp(-(d - min) / o.blend)] as const)
      .filter((x) => x[1] > 0.0025);
    quantised(pairs).forEach(([j, w], s) => {
      joints[v * SKIN_INFLUENCES + s] = j;
      weights[v * SKIN_INFLUENCES + s] = w / STEPS;
    });
  }
  return { ...mesh, joints, weights };
}
