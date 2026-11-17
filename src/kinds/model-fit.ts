// modelFit: register a model's mesh (any yaw, any size, feet anywhere) onto a creature plan. The
// target is the plan's own flesh as tapered capsules (trunk masses, neck, head, tail, both sides'
// legs): no code body is sculpted. Twelve yaw starts, each scaled by height and centred, then a
// trimmed two-sided ICP solved upright (yaw, uniform scale, translation: generators keep gravity):
// model points pair with their projection on the flesh AND flesh samples pair with their nearest
// model point, so the scale cannot collapse (a one-sided similarity ICP shrank the wolf to 20 %
// inside its own chest). The lowest vertex lands on z = 0. Returns the similarity, the row-major
// 4×4 for the Blender `transform` step and the residual QA reads. Memoised per positions array.

import { type Mesh, Ts23dError, type Vec3 } from '../core/index.ts';
import {
  applySimilarity,
  composeSimilarity,
  type Similarity,
  yawSimilarity,
} from '../primitives/index.ts';
import type { Bones } from './creature-bones.ts';
import { capsuleProjector, fleshSamples, planCapsules } from './model-flesh.ts';

/** Largest median distance model ↔ plan flesh, as a share of the plan's height. Measured on the
 *  Pixal3D wolf: 0.036 registered (from any starting yaw); 0.056 turned half round, 0.125 at 30°. */
export const FIT_LIMIT = 0.045;

/** Most a leaning model is pitched or rolled to stand level, degrees. */
const LEVEL = 12;

export interface ModelFit {
  readonly similarity: Similarity;
  /** 16 numbers, row-major, column vectors: the Blender `transform` step's `matrix`. */
  readonly matrix: readonly number[];
  /** Median distance from the fitted surface to the plan's flesh, metres, and ÷ plan height. */
  readonly residual: number;
  readonly relative: number;
  /** Yaw applied, degrees, and the uniform scale. */
  readonly yaw: number;
  readonly scale: number;
}

function box(points: readonly Vec3[]): { lo: Vec3; hi: Vec3 } {
  const lo: [number, number, number] = [Infinity, Infinity, Infinity];
  const hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const p of points)
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k] ?? 0, p[k] ?? 0);
      hi[k] = Math.max(hi[k] ?? 0, p[k] ?? 0);
    }
  return { lo, hi };
}

const median = (v: number[]): number => [...v].sort((a, b) => a - b)[v.length >> 1] ?? Infinity;

const matrixOf = (m: Similarity): number[] => [
  ...[0, 1, 2].flatMap((i) => [
    m.s * (m.r[i * 3] ?? 0),
    m.s * (m.r[i * 3 + 1] ?? 0),
    m.s * (m.r[i * 3 + 2] ?? 0),
    m.t[i] ?? 0,
  ]),
  ...[0, 0, 0, 1],
];

type Pair = readonly [Vec3, Vec3];

/** Least-squares upright similarity (yaw about Z, uniform scale, translation) of source → target. */
function solveUpright(pairs: readonly Pair[], scale?: number): Similarity {
  const mean = (k: 0 | 1, a: 0 | 1 | 2): number =>
    pairs.reduce((s, p) => s + p[k][a], 0) / pairs.length;
  const ca: Vec3 = [mean(0, 0), mean(0, 1), mean(0, 2)];
  const cq: Vec3 = [mean(1, 0), mean(1, 1), mean(1, 2)];
  let [dot, crs, zz, aa] = [0, 0, 0, 0];
  for (const [a, q] of pairs) {
    const [ax, ay, az] = [a[0] - ca[0], a[1] - ca[1], a[2] - ca[2]];
    const [qx, qy, qz] = [q[0] - cq[0], q[1] - cq[1], q[2] - cq[2]];
    dot += ax * qx + ay * qy;
    crs += ax * qy - ay * qx;
    zz += az * qz;
    aa += ax * ax + ay * ay + az * az;
  }
  const yaw = Math.atan2(crs, dot);
  const s = scale ?? (aa > 0 ? (Math.hypot(dot, crs) + zz) / aa : 1);
  const m: Similarity = { ...yawSimilarity((yaw * 180) / Math.PI), s };
  const r = applySimilarity(m, ca);
  return { ...m, t: [cq[0] - r[0], cq[1] - r[1], cq[2] - r[2]] };
}

/** One trimmed two-sided round under `m`: the pairs it keeps and their mean distance. */
function round(
  m: Similarity,
  points: readonly Vec3[],
  flesh: readonly Vec3[],
  project: (p: Vec3) => { q: Vec3; e: number },
  keep: number,
): { pairs: Pair[]; residual: number } {
  const moved = points.map((p) => applySimilarity(m, p));
  const fwd = moved.map((p, i) => {
    const hit = project(p);
    return { pair: [points[i] ?? p, hit.q] as Pair, e: hit.e };
  });
  const back = flesh.map((f) => {
    let [best, at] = [Infinity, 0];
    moved.forEach((p, i) => {
      const d = (p[0] - f[0]) ** 2 + (p[1] - f[1]) ** 2 + (p[2] - f[2]) ** 2;
      if (d < best) [best, at] = [d, i];
    });
    return { pair: [points[at] ?? f, f] as Pair, e: Math.sqrt(best) };
  });
  const kept = [fwd, back].flatMap((side) =>
    [...side].sort((a, b) => a.e - b.e).slice(0, Math.max(3, Math.floor(side.length * keep))),
  );
  return {
    pairs: kept.map((k) => k.pair),
    residual: kept.reduce((s, k) => s + k.e, 0) / kept.length,
  };
}

/** Plan dorsal height ÷ the model's top over the same x, averaged along the plan's spine (1 when
 *  the model has no surface there). */
function dorsalScale(points: readonly Vec3[], m: Similarity, b: Bones): number {
  const moved = points.map((p) => applySimilarity(m, p));
  const low = Math.min(...moved.map((p) => p[2]));
  const ratios = b.spine.flatMap((sp) => {
    const top = Math.max(
      ...moved.filter((p) => Math.abs(p[0] - sp[0]) < b.height * 0.06).map((p) => p[2] - low),
    );
    return top > b.height * 0.3 ? [sp[2] / top] : [];
  });
  return ratios.length ? ratios.reduce((s, r) => s + r, 0) / ratios.length : 1;
}

/** An about-turned fit within this factor of the winner's residual is a tie the taper decides. */
const AMBIGUOUS = 1.25;

/** Section (width × height) of the front eighth of the body ÷ that of the rear eighth, under `m`. */
function frontTaper(points: readonly Vec3[], m: Similarity): number {
  const moved = points.map((p) => applySimilarity(m, p));
  const all = box(moved);
  const len = all.hi[0] - all.lo[0];
  const section = (keep: (x: number) => boolean): number => {
    const end = moved.filter((p) => keep(p[0]));
    if (end.length < 3) return 0;
    const e = box(end);
    return (e.hi[1] - e.lo[1]) * (e.hi[2] - e.lo[2]);
  };
  const rear = section((x) => x < all.lo[0] + len / 8);
  return section((x) => x > all.hi[0] - len / 8) / Math.max(rear, 1e-9);
}

const memo = new WeakMap<Float32Array, Map<Bones, Map<string, ModelFit>>>();

/** The similarity that lands `mesh` on the plan `b`; throws T3D_MODEL_FIT on an empty mesh. */
/** `front`: about where the model's front points in its own frame (degrees of yaw the fit should
 *  apply, ± 60°), when the concept says so; without it a near tie is settled by the taper. */
export function modelFit(
  mesh: Mesh,
  b: Bones,
  o: { readonly samples?: number; readonly front?: number } = {},
): ModelFit {
  const key = String(o.front);
  const seen = memo.get(mesh.positions)?.get(b)?.get(key);
  if (seen) return seen;
  const P = mesh.positions;
  const n = P.length / 3;
  if (n < 16)
    throw new Ts23dError('T3D_MODEL_FIT', {
      cause: `modelFit: the model mesh has ${n} vertices`,
      fix: 'pass the mesh the `mesh` model returned (importGlb / importModel), not an empty LOD',
    });
  const at = (v: number): Vec3 => [P[v * 3] ?? 0, P[v * 3 + 1] ?? 0, P[v * 3 + 2] ?? 0];
  const step = Math.max(1, Math.floor(n / (o.samples ?? 900)));
  const points: Vec3[] = [];
  for (let v = 0; v < n; v += step) points.push(at(v));
  const caps = planCapsules(b);
  const project = capsuleProjector(caps);
  const flesh = fleshSamples(caps, b.height / 14);
  const target = box(flesh);
  const yawOf = (m: Similarity): number => (Math.atan2(m.r[3] ?? 0, m.r[0] ?? 1) * 180) / Math.PI;
  const apart = (a: number, c: number): number => Math.abs(((a - c + 540) % 360) - 180);
  const found: { m: Similarity; residual: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const turned = yawSimilarity(i * 30);
    const mb = box(points.map((p) => applySimilarity(turned, p)));
    const s = (target.hi[2] - target.lo[2]) / Math.max(mb.hi[2] - mb.lo[2], 1e-9);
    const mid = (k: 0 | 1): number =>
      (target.lo[k] + target.hi[k]) / 2 - ((mb.lo[k] + mb.hi[k]) / 2) * s;
    let m: Similarity = { ...turned, s, t: [mid(0), mid(1), target.lo[2] - mb.lo[2] * s] };
    let last = Infinity;
    let own: { m: Similarity; residual: number } | null = null;
    for (let it = 0; it < 24; it++) {
      const r = round(m, points, flesh, project, 0.8);
      if (!own || r.residual < own.residual) own = { m, residual: r.residual };
      if (r.residual > last - 1e-6) break;
      last = r.residual;
      m = solveUpright(r.pairs);
    }
    if (own && (o.front === undefined || apart(yawOf(own.m), o.front) <= 60)) found.push(own);
  }
  found.sort((p, q) => p.residual - q.residual);
  let best = found[0] ?? null;
  // Head or tail first? A blocky body (a bear) fits nearly as well backwards. When the best
  // about-turned fit is within AMBIGUOUS of the winner, the front is the end that tapers: the
  // muzzle's section is smaller than the rump's.
  const turnedRound = best && found.find((f) => apart(yawOf(f.m), yawOf(best?.m ?? f.m)) > 120);
  if (best && turnedRound && turnedRound.residual < best.residual * AMBIGUOUS) {
    if (frontTaper(points, turnedRound.m) < frontTaper(points, best.m)) best = turnedRound;
  }
  let won = best?.m ?? yawSimilarity(0);
  // Legged bodies: the sourced shoulder height sets the scale (the dorsal line of the model on the
  // plan's), then yaw and place settle again at that scale.
  const k = b.legs.length > 0 && b.chain.length < 2 ? dorsalScale(points, won, b) : 1;
  if (k !== 1) {
    won = { ...won, s: won.s * k, t: [won.t[0] * k, won.t[1] * k, won.t[2] * k] };
    for (let it = 0; it < 8; it++)
      won = solveUpright(round(won, points, flesh, project, 0.8).pairs, won.s);
  }
  // Four-legged bodies stand on all sides: a model leaning a few degrees is pitched, then
  // rolled, until the lowest points of its two halves are level (never more than LEVEL°).
  if (b.legs.length > 1)
    for (const k of [0, 1] as const) {
      const all = box(points.map((p) => applySimilarity(won, p)));
      const mid = (all.lo[k] + all.hi[k]) / 2;
      const ends: [[number, number], [number, number]] = [
        [0, Infinity],
        [0, Infinity],
      ];
      for (let v = 0; v < n; v++) {
        const p = applySimilarity(won, at(v));
        const end = ends[p[k] > mid ? 1 : 0];
        if (p[2] < end[1]) [end[0], end[1]] = [p[k], p[2]];
      }
      const lean = Math.atan2(ends[1][1] - ends[0][1], ends[1][0] - ends[0][0]);
      if (!Number.isFinite(lean) || Math.abs(lean) > (LEVEL * Math.PI) / 180) continue;
      const [c, sn] = [Math.cos(lean), Math.sin(lean)];
      // Turn about Y (front and rear) or X (left and right) so the higher end comes down.
      const r = k === 0 ? [c, 0, sn, 0, 1, 0, -sn, 0, c] : [1, 0, 0, 0, c, sn, 0, -sn, c];
      won = composeSimilarity({ s: 1, r, t: [0, 0, 0] }, won);
    }
  let low = Infinity;
  for (let v = 0; v < n; v++) low = Math.min(low, applySimilarity(won, at(v))[2]);
  const similarity: Similarity = { ...won, t: [won.t[0], won.t[1], won.t[2] - low] };
  const residual = median(points.map((p) => project(applySimilarity(similarity, p)).e));
  const fit: ModelFit = {
    similarity,
    matrix: matrixOf(similarity),
    residual,
    relative: residual / b.height,
    yaw: (Math.atan2(similarity.r[3] ?? 0, similarity.r[0] ?? 1) * 180) / Math.PI,
    scale: similarity.s,
  };
  const per = memo.get(mesh.positions) ?? new Map<Bones, Map<string, ModelFit>>();
  per.set(b, (per.get(b) ?? new Map<string, ModelFit>()).set(key, fit));
  memo.set(mesh.positions, per);
  return fit;
}

/** The same fit moved sideways by `dy` metres (asset +y): the sagittal plane put on y = 0. */
export function shiftFit(fit: ModelFit, dy: number): ModelFit {
  const t = fit.similarity.t;
  const similarity: Similarity = { ...fit.similarity, t: [t[0], t[1] + dy, t[2]] };
  return { ...fit, similarity, matrix: matrixOf(similarity) };
}

/** The mesh moved by a fit: positions by the similarity, normals by its rotation. */
export function applyFit(mesh: Mesh, m: Similarity): Mesh {
  const positions = new Float32Array(mesh.positions.length);
  const normals = new Float32Array(mesh.normals.length);
  const turn: Similarity = { s: 1, r: m.r, t: [0, 0, 0] };
  const get = (a: Float32Array, i: number): Vec3 => [a[i] ?? 0, a[i + 1] ?? 0, a[i + 2] ?? 0];
  for (let i = 0; i < positions.length; i += 3) {
    positions.set(applySimilarity(m, get(mesh.positions, i)), i);
    normals.set(applySimilarity(turn, get(mesh.normals, i)), i);
  }
  return { ...mesh, positions, normals };
}
