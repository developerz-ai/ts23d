// Registration of the model's wolf onto the code wolf, in three steps: (1) one similarity for the
// whole animal (surface.ts `fitOnto`: twelve yaw starts, trimmed ICP); (2) the head's own
// similarity from landmarks (head.ts) with the neck bending between — the model's ¾-photo pose
// turns and lowers its head, which one body fit cannot follow; (3) a piecewise warp of the body
// (16 regions, each its own trimmed ICP) that leaves the head where step 2 put it. The result is
// the model mesh in OUR pose: what the brick, the warp and the texture read.

import {
  applySimilarity,
  fitPiecewise,
  type Mesh,
  similarityToward,
  triBvh,
  type Vec3,
} from '@developerz.ai/ts23d';
import { codeMarks, headFit, modelAtlas, modelMarks, neckWeight } from './head.ts';
import { BLEND, fitOnto, type ModelSurface } from './surface.ts';

/** What the registration reads from the code wolf (world frame). */
export interface Coat {
  /** The solid coat the model lands on: body + head + jaw. */
  readonly target: Mesh;
  /** The head part alone (nose tip, ear tips). */
  readonly head: Mesh;
  /** Eyeball centres and radius; null on LOD2 (no eyeballs: painted eyes). */
  readonly eyes: { readonly l: Vec3; readonly r: Vec3; readonly radius: number } | null;
  /** Bone heads: the neck's base (neck_0) and the atlas (head). */
  readonly neckBase: Vec3;
  readonly atlas: Vec3;
}

const memo = new Map<string, Mesh>();

/** The model mesh registered onto the code wolf's pose (memoised per model and LOD). */
export function registerModel(model: ModelSurface, coat: Coat, lod: number): Mesh {
  const key = `${model.key}:${lod}`;
  const seen = memo.get(key);
  if (seen) return seen;
  const fit = fitOnto(model, coat.target, lod);
  const MP = model.mesh.positions;
  const fitted = new Float32Array(MP.length);
  for (let i = 0; i < MP.length; i += 3)
    fitted.set(applySimilarity(fit, [MP[i] ?? 0, MP[i + 1] ?? 0, MP[i + 2] ?? 0]), i);
  // Head: landmarks on both wolves, then the neck bends about the model's atlas.
  const head = headFit(modelMarks(fitted, model.mesh.colors), codeMarks(coat.head, coat.eyes));
  const pivot = modelAtlas(head, coat.atlas);
  const weight = neckWeight(coat.neckBase, pivot);
  const n = fitted.length / 3;
  const bent: Vec3[] = [];
  const w = new Float64Array(n);
  for (let v = 0; v < n; v++) {
    const p: Vec3 = [fitted[v * 3] ?? 0, fitted[v * 3 + 1] ?? 0, fitted[v * 3 + 2] ?? 0];
    w[v] = weight(p);
    bent.push(applySimilarity(similarityToward(head, w[v] ?? 0, pivot), p));
  }
  // Body: the piecewise warp from the points the head did not take, faded out up the neck.
  const bvh = triBvh(coat.target);
  const q: [number, number, number] = [0, 0, 0];
  const project = (p: Vec3): { q: Vec3; e: number } => {
    const e = bvh.closest(p, q);
    return { q: [q[0], q[1], q[2]], e };
  };
  const step = Math.max(1, Math.floor(n / 3000));
  const body = bent.filter((_, v) => v % step === 0 && (w[v] ?? 0) < 0.3);
  const { warp } = fitPiecewise(body, project, { clusters: BLEND.regions });
  const positions = new Float32Array(MP.length);
  bent.forEach((p, v) => {
    const k = 1 - (w[v] ?? 0);
    const r = k > 0 ? warp(p) : p;
    positions.set(
      [p[0] + (r[0] - p[0]) * k, p[1] + (r[1] - p[1]) * k, p[2] + (r[2] - p[2]) * k],
      v * 3,
    );
  });
  const out: Mesh = { ...model.mesh, positions };
  memo.set(key, out);
  return out;
}
