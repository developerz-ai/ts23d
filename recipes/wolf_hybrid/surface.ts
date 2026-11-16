// The model half of the hybrid wolf: concept image → `mesh` model → the wolf's surface. Two
// cached requests (ADR 014): CONCEPT (concept.ts) gives a PNG; its sha256 names the image of
// SURFACE below. `modelSurface` reads the cached GLB (a miss anywhere returns null: the code
// wolf, the CPU version), `fitOnto` is the whole-animal similarity (twelve yaw starts: the model
// faces wherever it likes), and BLEND holds every number of the blend (register.ts, blend.ts,
// masks.ts, wrap.ts read it), iterated on the path-traced hero.

import {
  applySimilarity,
  type BuildContext,
  fitToSurface,
  importGlb,
  type Mesh,
  type NeuralRequests,
  type Rgba,
  type Similarity,
  sha256Hex,
  triBvh,
  type Vec3,
  yawSimilarity,
} from '@developerz.ai/ts23d';
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
  /** Regions of the piecewise (body) registration. */
  regions: 16,
  /** Skin move where code keeps the shape (legs, tail, paws): longest, full within `reach`. */
  skin: { amp: 0.012, reach: 0.03 },
  /** Silhouette move (head, neck, torso: the model's ruff, chest and skull) to the model mesh's
   *  closest point: full within `reach`, none past twice it (metres). */
  shape: { reach: 0.08 },
  /** Share of the silhouette move per bone (sides folded): head and jaw take the model's
   *  surface; neck, withers, chest and shoulder most of it (the ruff); the loin less, the croup
   *  little (the code's tail grows from it); upper arm some, thigh a little. Forearm, shank, paws
   *  and tail (unlisted) stay the code's. */
  share: {
    head: 1,
    jaw: 1,
    ear: 0.3,
    neck_0: 0.7,
    neck_1: 0.7,
    spine_2: 0.7,
    scapula: 0.7,
    spine_1: 0.7,
    spine_0: 0.9,
    hind_0: 0.6,
  },
  /** The torso's down-facing skin keeps the code's surface: full share above normal z = −[0],
   *  none below −[1] (the photo never showed the belly; the model's is invented). */
  under: [0.3, 0.7] as const,
  /** Jacobi rounds smoothing that share over the mesh (no step where the skin weights change). */
  shareSmooth: 16,
  /** Jacobi rounds smoothing the push over each solid mesh (no folds): torso, head. */
  smooth: { body: 24, head: 12 },
  /** The torso adds the model's mass (ruff, chest) but keeps most of its sourced girth where the
   *  model is slimmer; the head takes the model's skull in and out, each vertex only near its
   *  own normal line (no fans onto the back of an ear). */
  torso: { cone: false, inward: 0, pin: false },
  /** Fillet radius of the torso's smooth union with the model surface (metres): no concave
   *  crease where the two cross. */
  soft: 0.02,
  face: { cone: true, inward: 1, pin: false },
  /** The jaw sits inside the head: its buried top stays put (it must open as a jaw, not
   *  collapse onto the model's chin); only its exposed underside takes the model's. */
  jaw: { cone: true, inward: 1, pin: true },
  /** Jacobi rounds softening the mask of coat buried in another part (no sawtooth). */
  buried: 16,
  /** Project + relax rounds of the silhouette shrinkwrap. */
  wrap: 4,
  /** Taubin rounds smoothing the model mesh the silhouette wraps onto (its folds are not shape). */
  taubin: 24,
  /** Relax rounds after the last projection (takes out folds; < 1 mm off the surface). */
  settle: 8,
  /** Most rounds relaxing faces the move turned past ~60° (pinches, fold-overs). */
  unfold: 24,
  /** A vertex whose faces spread past this many degrees about their mean (and ≥ 4° more than
   *  before the move) is a new crease: relaxed by `unfold`. */
  crease: 8,
  /** Smoothing of the model surface before it moves ours (its facets are not shape), metres. */
  fine: 0.012,
  /** The paws stay the code's below this height (claws grow from them), metres; full warp from
   *  twice it. */
  paws: 0.08,
  /** Texture: full within [0], none past [1] metres of the model surface; gain. */
  texture: [0.02, 0.05] as const,
  colour: 1,
} as const;

export interface ModelSurface {
  readonly mesh: Mesh;
  readonly key: string;
  /** The model's own albedo texture (its UVs on `mesh`), when the GLB carries one. */
  readonly albedo?: Rgba;
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
  return { mesh: imported.mesh, key, ...(imported.albedo ? { albedo: imported.albedo } : {}) };
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
