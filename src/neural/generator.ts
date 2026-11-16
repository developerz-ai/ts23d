// localGenerator: organic shapes the recipe approach handles poorly (people, animals, sculpted
// rocks) from an open-weight image/text-to-3D model on the USER's GPU, behind a t3d-neural/1
// server. A thin wrapper over the `mesh` task: the request runs through httpAdapter + runJob (so the
// output is validated: a GLB under `targetTriangles`), then importGlb turns glTF Y-up into ts23d
// Z-up and fits it into `fit`, base on the ground. Never a core dependency.
//
// Determinism: generate() calls the model every time. Builds take outputs from the committed
// recipe cache instead (`t3d neural run`, recipe-cache.ts; ADR 014), so CI never needs a GPU.

import type { Mesh, NeuralInput, Vec3 } from '../core/index.ts';
import { runJob } from './adapter.ts';
import { httpAdapter } from './http-adapter.ts';
import { importGlb } from './import-glb.ts';
import { sha256Hex } from './sha256.ts';
import type { WireFetch } from './wire.ts';

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

const PNG = [0x89, 0x50, 0x4e, 0x47];

/** Talks to a t3d-neural/1 server at `endpoint` (its root URL). */
export function localGenerator(o: {
  readonly model: string;
  readonly endpoint: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly jobTimeoutMs?: number;
  readonly fetch?: WireFetch;
}): MeshGenerator {
  const adapter = httpAdapter({
    url: o.endpoint,
    tasks: ['mesh'],
    ...(o.headers ? { headers: o.headers } : {}),
    ...(o.jobTimeoutMs !== undefined ? { jobTimeoutMs: o.jobTimeoutMs } : {}),
    ...(o.fetch ? { fetch: o.fetch } : {}),
  });
  return {
    model: o.model,
    async generate(r) {
      const image: NeuralInput | undefined = r.image && {
        sha256: sha256Hex(r.image),
        mime: PNG.every((b, i) => r.image?.[i] === b) ? 'image/png' : 'image/jpeg',
      };
      const run = await runJob(adapter, {
        task: 'mesh',
        model: o.model,
        request: {
          seed: r.seed,
          maxTriangles: r.targetTriangles,
          ...(r.prompt !== undefined ? { prompt: r.prompt } : {}),
          ...(image ? { image } : {}),
        },
        ...(image && r.image ? { inputs: new Map([[image.sha256, r.image]]) } : {}),
      });
      const glb = run.result.outputs[0]?.bytes ?? new Uint8Array();
      return importGlb(
        {
          path: `neural:${o.model}`,
          sha256: sha256Hex(glb),
          bytes: glb,
          license: 'own',
          author: `${o.model} (${run.model.licence})`,
          url: o.endpoint,
        },
        { fit: r.fit, clean: false },
      ).mesh;
    },
  };
}
