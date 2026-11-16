// Opt-in garment drape through the neural cache (ADR 014): the garment's rest mesh and the body
// it falls on go to the `cloth` tool task (Blender's cloth solver, via blenderAdapter or the
// reference server's blender plug-in) as GLBs; a committed result comes back as the draped mesh.
// A miss is never an error: `drapeGarment` returns `{ fallback: true }` with the notice, and the
// bust keeps its stroke folds (cloth-folds.ts) — so without the cache the bust builds exactly as
// the CPU tier does. ts23d frame (Z up, +X front) ↔ glTF (Y up, +Z front, +X left) is a rotation:
// glTF (x, y, z) = ts23d (y, z, x). `t3d neural run` fills the miss from the request + inputs.

import {
  type Mesh,
  type NeuralNotice,
  type NeuralRecord,
  type NeuralRequest,
  providedNeural,
  readGlb,
  scenePrimitives,
  sha256Hex,
  Ts23dError,
  writeMeshGlb,
} from '@developerz.ai/ts23d';

export interface ClothSim {
  /** The garment's rest mesh (ts23d frame), placed around the body, not intersecting it. */
  readonly garment: Mesh;
  /** The body it drapes on (ts23d frame); collision only. */
  readonly body: Mesh;
  /** Frames at 24 fps (default 48). */
  readonly frames?: number;
  /** Pin vertices at or above this height, metres. */
  readonly pinAboveZ?: number;
  /** Solver substeps per frame (default 8). */
  readonly substeps?: number;
  readonly seed?: number;
}

export type Drape =
  | { readonly fallback: false; readonly mesh: Mesh; readonly record: NeuralRecord }
  | { readonly fallback: true; readonly notice: NeuralNotice };

/** Cyclic axis permutation (a rotation, so winding is kept): `toGltf` or back. */
function permute(a: Float32Array, toGltf: boolean): Float32Array {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i += 3) {
    const [x, y, z] = [a[i] ?? 0, a[i + 1] ?? 0, a[i + 2] ?? 0];
    out.set(toGltf ? [y, z, x] : [z, x, y], i);
  }
  return out;
}

const reframe = (m: Mesh, toGltf: boolean): Mesh => ({
  ...m,
  positions: permute(m.positions, toGltf),
  normals: permute(m.normals, toGltf),
});

/** GLB bytes of one mesh in the glTF frame (what the cloth task imports). */
export const glbOf = (name: string, m: Mesh): Uint8Array =>
  writeMeshGlb([{ name, mesh: reframe(m, true) }]);

/** The request and its input bytes for a drape (exported for `t3d neural run` and tests). */
export function clothJob(sim: ClothSim): {
  readonly request: NeuralRequest<'cloth'>;
  readonly inputs: ReadonlyMap<string, Uint8Array>;
} {
  const garment = glbOf('garment', sim.garment);
  const body = glbOf('body', sim.body);
  const ref = (b: Uint8Array) => ({ sha256: sha256Hex(b), mime: 'model/gltf-binary' });
  return {
    request: {
      seed: sim.seed ?? 0,
      garment: ref(garment),
      body: ref(body),
      frames: sim.frames ?? 48,
      substeps: sim.substeps ?? 8,
      ...(sim.pinAboveZ !== undefined ? { pinAboveZ: sim.pinAboveZ } : {}),
    },
    inputs: new Map([
      [ref(garment).sha256, garment],
      [ref(body).sha256, body],
    ]),
  };
}

/** The cached drape for `recipe`, or the fallback (keep the stroke folds). */
export function drapeGarment(recipe: string, sim: ClothSim): Drape {
  const { request, inputs } = clothJob(sim);
  const hit = providedNeural(recipe).get('cloth', request, { inputs });
  if (hit.fallback) return hit;
  const bytes = hit.result.outputs[0]?.bytes ?? new Uint8Array();
  // The cache validated the output (a GLB with triangles), so it has a primitive.
  const [prim] = scenePrimitives(readGlb(bytes));
  if (!prim)
    throw new Ts23dError('T3D_NEURAL_OUTPUT_INVALID', {
      cause: `${recipe}: the cached cloth drape holds no mesh`,
      fix: `delete that key under recipes/${recipe}/neural/ and run t3d neural run again`,
    });
  return { fallback: false, mesh: reframe(prim.mesh, false), record: hit.record };
}
