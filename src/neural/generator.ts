// Optional seam for organic shapes the recipe approach handles poorly: people, animals, sculpted
// rocks. Runs an open-weight image/text-to-3D model on the USER's GPU (TRELLIS, Hunyuan3D, SF3D…)
// behind a local HTTP endpoint, then wraps the result as an ordinary part. Never a core dependency.
//
// Determinism: a generated mesh is cached by (model, prompt/image hash, seed) under
// .ts23d/neural/ and committed or published like any asset, so CI rebuilds without a GPU.

import { type Mesh, notImplemented, type Vec3 } from '../core/index.ts';

export interface GenerateRequest {
  readonly prompt?: string;
  /** PNG/JPEG bytes of a reference or concept image. */
  readonly image?: Uint8Array;
  readonly seed: number;
  /** Fit the result into this box (metres), Z up, base on the ground. */
  readonly fit: Vec3;
  readonly targetTriangles: number;
}

export interface MeshGenerator {
  /** e.g. 'trellis-2', 'hunyuan3d-2.1', 'sf3d'. Part of the cache key. */
  readonly model: string;
  generate(request: GenerateRequest): Promise<Mesh>;
}

/** Talks to a local server (e.g. a ComfyUI / gradio wrapper) at `endpoint`. Planned: M5. */
export function localGenerator(_o: { model: string; endpoint: string }): MeshGenerator {
  return notImplemented(
    'localGenerator (local GPU model adapter)',
    'docs/idea/08-neural-adapters.md',
  );
}

/** Import an existing GLB (a CC0 base mesh, a sculpt, a generator's output) as a part. Planned: M5. */
export function importGlb(_bytes: Uint8Array, _o: { fit: Vec3; recolor?: Vec3 }): Mesh {
  return notImplemented('importGlb', 'docs/idea/08-neural-adapters.md');
}
