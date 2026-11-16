// The model half of the hybrid wolf: concept image → `mesh` model → the wolf's surface. Two
// cached requests (ADR 014): CONCEPT (concept.ts) gives a PNG; its sha256 names the image of
// SURFACE below. The returned GLB is registered onto the code wolf — a similarity fit from twelve
// yaw starts (the model faces wherever it likes), then a piecewise warp (16 regions, each its own
// trimmed ICP: the model's turned head and planted legs bend onto OUR skeleton) — and meshed into
// a brick SDF. Every coat part (body, head, jaw, fur cards) is then moved onto the model's
// smoothed surface by one warp field (≤ 2 cm, nothing where the model strays > 6 cm: code owns
// anatomy and silhouette there) and takes the model's texture by closest point (within 1–2 cm;
// beyond, our coat colours). A miss anywhere returns the code wolf: the CPU version.

import {
  applySimilarity,
  type BuildContext,
  fitPiecewise,
  fitToSurface,
  importGlb,
  type Mesh,
  meshBrick,
  meshOffset,
  type NeuralRequests,
  type Similarity,
  sha256Hex,
  triBvh,
  type Vec3,
  warpMesh,
  yawSimilarity,
} from '@developerz.ai/ts23d';
import { closestColour } from '@developerz.ai/ts23d/finish';
import { CONCEPT, CONCEPT_MODEL } from './concept.ts';

/** The mesh model (MIT): Pixal3D; TRELLIS.2 ('trellis2') answers the same request. */
export const SURFACE_MODEL = 'pixal3d';

/** The image-to-3D request, minus the image (the concept's sha256, filled in at build): Pixal3D's
 *  best quality (1536 cascade, 25 steps per sampler, 1 M-face target, 4096 texture; low_vram
 *  offload). The committed output is that GLB decimated to 60 k faces with a 1024 px albedo
 *  (Blender 5.3; ADR 011 lets imported meshes be decimated): record.json `overrides` says so. */
export const SURFACE: Omit<NeuralRequests['mesh'], 'image'> = {
  seed: 42,
  maxTriangles: 1_000_000,
  params: { resolution: 1536, steps: 25, triangles: 1_000_000, texture_size: 4096 },
};

/** How the model's surface lands on the code wolf (iterated on the path-traced hero). */
export const BLEND = {
  /** Brick cell: LOD0, then LOD1 and LOD2 (LOD2 takes the colour only). */
  cell: [0.005, 0.009] as const,
  /** Regions of the piecewise registration. */
  regions: 16,
  /** Longest move of the coat onto the model surface, metres. */
  amp: 0.012,
  /** Full move where the model surface is within this; none past twice it, metres. */
  reach: 0.03,
  /** Jacobi rounds smoothing the push over the coat mesh (no folds). */
  smooth: 24,
  /** Smoothing of the model surface before it moves ours (its facets are not shape), metres. */
  fine: 0.02,
  /** The paws stay the code's below this height (claws grow from them), metres; full warp from
   *  twice it. */
  paws: 0.08,
  /** Texture: full within [0], none past [1] metres of the model surface; gain. */
  texture: [0.01, 0.02] as const,
  colour: 0.9,
} as const;

interface ModelSurface {
  readonly mesh: Mesh;
  readonly key: string;
}

/** The model's mesh (glTF frame → Z up), or null on any cache miss. */
export function modelSurface(ctx: BuildContext): ModelSurface | null {
  const concept = ctx.neural('image', CONCEPT, { model: CONCEPT_MODEL });
  const png = concept?.outputs[0];
  if (!png) return null;
  const sha256 = sha256Hex(png.bytes);
  const request: NeuralRequests['mesh'] = { ...SURFACE, image: { sha256, mime: 'image/png' } };
  const surf = ctx.neural('mesh', request, {
    model: SURFACE_MODEL,
    inputs: new Map([[sha256, png.bytes]]),
  });
  const glb = surf?.outputs[0];
  if (!glb) return null;
  const key = sha256Hex(glb.bytes);
  const imported = importGlb(
    {
      path: `recipes/wolf_hybrid/neural (${SURFACE_MODEL} output ${key.slice(0, 12)})`,
      sha256: key,
      bytes: glb.bytes,
      license: 'MIT',
      author: SURFACE_MODEL,
      url: 'recipes/wolf_hybrid/neural/ (record.json: model, weights, request)',
    },
    { clean: false, place: 'centre' },
  );
  return { mesh: imported.mesh, key };
}

function box(P: Float32Array): { lo: Vec3; size: Vec3; centre: Vec3 } {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3)
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a] ?? 0, P[i + a] ?? 0);
      hi[a] = Math.max(hi[a] ?? 0, P[i + a] ?? 0);
    }
  const v = (f: (a: number) => number): Vec3 => [f(0), f(1), f(2)];
  return {
    lo: v((a) => lo[a] ?? 0),
    size: v((a) => (hi[a] ?? 0) - (lo[a] ?? 0)),
    centre: v((a) => ((lo[a] ?? 0) + (hi[a] ?? 0)) / 2),
  };
}

const fits = new Map<string, Similarity>();

/** The model mesh fitted onto the code body: height-scaled start per yaw, then trimmed ICP. */
export function fitOnto(model: ModelSurface, body: Mesh, lod: number): Similarity {
  const key = `${model.key}:${lod}`;
  const seen = fits.get(key);
  if (seen) return seen;
  const target = box(body.positions);
  const bvh = triBvh(body);
  const q: [number, number, number] = [0, 0, 0];
  const project = (p: Vec3): { q: Vec3; e: number } => {
    const e = bvh.closest(p, q);
    return { q: [q[0], q[1], q[2]], e };
  };
  const P = model.mesh.positions;
  const step = Math.max(1, Math.floor(P.length / 3 / 1500));
  const points: Vec3[] = [];
  for (let v = 0; v < P.length / 3; v += step)
    points.push([P[v * 3] ?? 0, P[v * 3 + 1] ?? 0, P[v * 3 + 2] ?? 0]);
  // Twelve yaw starts (a ¾ photo gives a turned asset); scale from the height (yaw-invariant),
  // feet on the code's ground, centred over the body.
  const starts = Array.from({ length: 12 }, (_, i): Similarity => {
    const turned = yawSimilarity(i * 30);
    const b = box(Float32Array.from(points.flatMap((p) => applySimilarity(turned, p))));
    const s = target.size[2] / Math.max(b.size[2], 1e-6);
    const t: Vec3 = [
      target.centre[0] - b.centre[0] * s,
      target.centre[1] - b.centre[1] * s,
      target.lo[2] - b.lo[2] * s,
    ];
    return { ...turned, s, t };
  });
  const { fit } = fitToSurface(points, project, starts, { iterations: 15, trim: 0.25 });
  fits.set(key, fit);
  return fit;
}

/** World-space reshaping and colour from the registered model surface. */
export interface Hybrid {
  /** Move a point (world) onto the model's surface. */
  readonly warp: (p: Vec3) => Vec3;
  /** The model's colour at a world point and how much of it to take (0 = ours). */
  readonly colour: (p: Vec3) => { readonly c: Vec3; readonly w: number };
}

const hybrids = new Map<string, Hybrid>();

/** The hybrid for the code wolf's coat (`target`: body + head + jaw, world), or null on a miss. */
export function hybridOf(ctx: BuildContext, target: Mesh): Hybrid | null {
  const model = modelSurface(ctx);
  if (!model) return null;
  const key = `${model.key}:${ctx.lod}`;
  const seen = hybrids.get(key);
  if (seen) return seen;
  const fit = fitOnto(model, target, ctx.lod);
  const bvh = triBvh(target);
  const q: [number, number, number] = [0, 0, 0];
  const project = (p: Vec3): { q: Vec3; e: number } => {
    const e = bvh.closest(p, q);
    return { q: [q[0], q[1], q[2]], e };
  };
  const MP = model.mesh.positions;
  const fitted: Vec3[] = [];
  for (let i = 0; i < MP.length; i += 3)
    fitted.push(applySimilarity(fit, [MP[i] ?? 0, MP[i + 1] ?? 0, MP[i + 2] ?? 0]));
  const step = Math.max(1, Math.floor(fitted.length / 3000));
  const { warp: register } = fitPiecewise(
    fitted.filter((_, i) => i % step === 0),
    project,
    { clusters: BLEND.regions },
  );
  const positions = new Float32Array(MP.length);
  fitted.forEach((p, i) => {
    positions.set(register(p), i * 3);
  });
  const registered: Mesh = { ...model.mesh, positions };
  const cell = ctx.lod === 0 ? BLEND.cell[0] : BLEND.cell[1];
  const brick = meshBrick(registered, { cell, band: BLEND.reach * 2 + cell * 2 });
  const offset = meshOffset(brick, {
    amp: BLEND.amp,
    fine: Math.max(BLEND.fine, cell),
    reach: BLEND.reach,
  });
  const sample = closestColour(registered);
  const near = triBvh(registered);
  const [r0, r1] = BLEND.texture;
  const out: Hybrid = {
    // LOD2 takes the colour only: its few hundred triangles cannot carry the shape.
    warp: (p) => {
      if (ctx.lod === 2) return p;
      const d = offset(p);
      const t = Math.max(0, Math.min(1, p[2] / BLEND.paws - 1));
      const k = t * t * (3 - 2 * t);
      return [p[0] + d[0] * k, p[1] + d[1] * k, p[2] + d[2] * k];
    },
    colour: (p) => {
      const d = near.distance(p, r1);
      if (d >= r1) return { c: [0, 0, 0], w: 0 };
      const t = d <= r0 ? 1 : (r1 - d) / (r1 - r0);
      return { c: sample(p), w: BLEND.colour * t * t * (3 - 2 * t) };
    },
  };
  hybrids.set(key, out);
  return out;
}

/** Per-vertex scalars smoothed over the mesh's welded neighbours (`rounds` Jacobi passes). */
function smoothOver(mesh: Mesh, values: Float64Array, rounds: number): Float64Array {
  const P = mesh.positions;
  const weld = new Map<string, number>();
  const of = Int32Array.from({ length: P.length / 3 }, (_, v) => {
    const k = `${P[v * 3]},${P[v * 3 + 1]},${P[v * 3 + 2]}`;
    const id = weld.get(k) ?? weld.size;
    weld.set(k, id);
    return id;
  });
  const n = weld.size;
  const sum = new Float64Array(n);
  const cnt = new Float64Array(n);
  of.forEach((id, v) => {
    sum[id] = (sum[id] ?? 0) + (values[v] ?? 0);
    cnt[id] = (cnt[id] ?? 0) + 1;
  });
  let x = sum.map((s, i) => s / (cnt[i] || 1));
  const I = mesh.indices;
  for (let r = 0; r < rounds; r++) {
    const acc = Float64Array.from(x);
    const deg = new Float64Array(n).fill(1);
    for (let t = 0; t < I.length; t += 3)
      for (let e = 0; e < 3; e++) {
        const a = of[I[t + e] ?? 0] ?? 0;
        const b = of[I[t + ((e + 1) % 3)] ?? 0] ?? 0;
        acc[a] = (acc[a] ?? 0) + (x[b] ?? 0);
        deg[a] = (deg[a] ?? 0) + 1;
        acc[b] = (acc[b] ?? 0) + (x[a] ?? 0);
        deg[b] = (deg[b] ?? 0) + 1;
      }
    x = acc.map((s, i) => s / (deg[i] || 1));
  }
  return Float64Array.from(of, (id) => x[id] ?? 0);
}

/** A part reshaped and recoloured by the hybrid; `at` = its world offset (parts are placed by
 *  translation only here: pitches are baked into the kind's meshes). Solid parts move along
 *  their own normals only, the push smoothed over the mesh (a shear or a jagged push folds the
 *  skin: QA reads folds as seams); cards follow the whole warp, so they stay on the moved skin. */
export function hybridPart(mesh: Mesh, at: Vec3, h: Hybrid, solid: boolean): Mesh {
  const N = mesh.normals;
  const P = mesh.positions;
  const world = (p: Vec3): Vec3 => [p[0] + at[0], p[1] + at[1], p[2] + at[2]];
  const unit = (v: number): Vec3 => {
    const n: Vec3 = [N[v * 3] ?? 0, N[v * 3 + 1] ?? 0, N[v * 3 + 2] ?? 0];
    const l = Math.hypot(...n) || 1;
    return [n[0] / l, n[1] / l, n[2] / l];
  };
  const push = solid
    ? smoothOver(
        mesh,
        Float64Array.from({ length: P.length / 3 }, (_, v) => {
          const w = world([P[v * 3] ?? 0, P[v * 3 + 1] ?? 0, P[v * 3 + 2] ?? 0]);
          const q = h.warp(w);
          const n = unit(v);
          return (q[0] - w[0]) * n[0] + (q[1] - w[1]) * n[1] + (q[2] - w[2]) * n[2];
        }),
        BLEND.smooth,
      )
    : null;
  return warpMesh(
    mesh,
    (p, v) => {
      if (push) {
        const n = unit(v);
        const k = push[v] ?? 0;
        return [n[0] * k, n[1] * k, n[2] * k];
      }
      const w = world(p);
      const q = h.warp(w);
      return [q[0] - w[0], q[1] - w[1], q[2] - w[2]];
    },
    (p, c) => {
      const s = h.colour(h.warp(world(p)));
      return [
        c[0] + (s.c[0] - c[0]) * s.w,
        c[1] + (s.c[1] - c[1]) * s.w,
        c[2] + (s.c[2] - c[2]) * s.w,
      ];
    },
  );
}
