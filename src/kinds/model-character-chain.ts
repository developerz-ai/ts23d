// riggedChain: the cached asks behind a rigged-model character, in order (ADR 014):
//   image   — the concept (small, committed)
//   mesh    — image-to-3D on that image (an a-pose asked in `surface`), kept local
//   rig     — a hosted rig + library clips on that mesh (`height`, `clips`), kept local
//   blender — the recipe's steps on the RIGGED mesh (retopo, uv, bake, `bind from: 'source'`,
//             lods, export): the committed game GLB, the only thing a build reads
// then importModel at the rig's height. Each request names the previous output by sha256; local
// outputs (`keep: 'local'`) may be absent on this machine (a fresh clone knows only their hash),
// and bytes travel in `ask.inputs` only when they are here, so `t3d neural run` can send them. Any
// miss returns null: the caller builds its CPU fallback. The image → mesh → blender half is
// modelChain's single pass with one more ask in the middle; the two should share that code once
// model-chain.ts settles (it was being changed while this was written).

import type { BuildContext, NeuralOutput, NeuralRequests } from '../core/index.ts';
import {
  type BlenderStep,
  blenderProgram,
  type ImportedModel,
  type ImportModelOptions,
  importModel,
  jsonInput,
  sha256Hex,
} from '../neural/index.ts';

export interface RiggedChainOptions {
  readonly concept: NeuralRequests['image'];
  /** The image-to-3D request, minus its image (the concept's sha256 is filled in). */
  readonly surface: Omit<NeuralRequests['mesh'], 'image'>;
  /** The rig request, minus its mesh: `height` (metres) and `clips` (the service's names). */
  readonly rig: Omit<NeuralRequests['rig'], 'mesh'>;
  /** The Blender program on the rigged mesh. A rigged source cannot take a `transform`:
   *  coordinates are where the rig stands the figure (feet on z = 0, `rig.height` tall). */
  readonly steps: readonly BlenderStep[];
  /** Refuse a Blender LOD 0 above this (budget.triangles[0]). */
  readonly maxTriangles: number;
  /** Model pins per stage (only that model's outputs count). */
  readonly models?: {
    readonly image?: string;
    readonly mesh?: string;
    readonly rig?: string;
    readonly blender?: string;
  };
  /** Seed of the Blender request. Default: the surface request's. */
  readonly seed?: number;
  /** Licence and author of the result, for the import gate and credits. */
  readonly license: string;
  readonly author: string;
  readonly url?: string;
  /** Default `{ place: 'origin', height: rig.height }`. */
  readonly import?: ImportModelOptions;
}

const GLB = 'model/gltf-binary';

const present = (o: NeuralOutput | undefined): o is NeuralOutput =>
  !!o && !o.absent && o.bytes.length > 0;

/** The output's content hash: the cache's, else of the bytes in hand; null when neither. */
function hashOf(o: NeuralOutput | undefined): string | null {
  if (!o) return null;
  if (o.sha256) return o.sha256;
  return present(o) ? sha256Hex(o.bytes) : null;
}

/** The imported game mesh (LODs, one texture set, armature, clips), or null on any cache miss. */
export function riggedChain(ctx: BuildContext, o: RiggedChainOptions): ImportedModel | null {
  const pin = (model: string | undefined) => (model === undefined ? {} : { model });
  const bytesOf = (sha256: string, out: NeuralOutput | undefined) =>
    present(out) ? { inputs: new Map([[sha256, out.bytes]]) } : {};
  const png = ctx.neural('image', o.concept, pin(o.models?.image))?.outputs[0];
  const image = hashOf(png);
  if (!image) return null;
  const raw = ctx.neural(
    'mesh',
    { ...o.surface, image: { sha256: image, mime: 'image/png' } },
    { ...pin(o.models?.mesh), keep: 'local', ...bytesOf(image, png) },
  )?.outputs[0];
  const mesh = hashOf(raw);
  if (!mesh) return null;
  const rigged = ctx.neural(
    'rig',
    { ...o.rig, mesh: { sha256: mesh, mime: GLB } },
    { ...pin(o.models?.rig), keep: 'local', ...bytesOf(mesh, raw) },
  )?.outputs[0];
  const rig = hashOf(rigged);
  if (!rig) return null;
  const program = blenderProgram(o.steps);
  const input = jsonInput(program);
  const inputs = new Map([[input.sha256, program]]);
  if (present(rigged)) inputs.set(rig, rigged.bytes);
  const glb = ctx.neural(
    'blender',
    {
      seed: o.seed ?? o.surface.seed,
      mesh: { sha256: rig, mime: GLB },
      program: input,
      maxTriangles: o.maxTriangles,
    },
    { ...pin(o.models?.blender), inputs },
  )?.outputs[0];
  if (!present(glb)) return null;
  return importModel(
    {
      bytes: glb.bytes,
      license: o.license,
      author: o.author,
      url: o.url ?? `neural cache (blender steps on rig ${rig.slice(0, 12)})`,
    },
    o.import ?? {
      place: 'origin',
      ...(o.rig.height === undefined ? {} : { height: o.rig.height }),
    },
  );
}
