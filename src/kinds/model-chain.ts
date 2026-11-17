// modelChain: the cached asks behind a model-first body, in order (ADR 014):
//   image   — the concept (small, committed)
//   mesh    — image-to-3D on that image, kept local (`keep: 'local'`: 70–100 MB raw meshes are
//             never committed; a build only ever knows its sha256)
//   blender — PROXY pass: clean → shell at ~6 000 triangles → export. A tiny committed GLB whose
//             geometry is all TS needs to register the model and fit the skeleton (model-rig.ts)
//   rig     — optional: a learned rigger on the proxy; its joints replace the geometric fit's
//   blender — FINAL pass: `transform(fit)` first, so every later step is in the asset frame at
//             real size, then the recipe's steps built FROM the fit (focus on the head and paws,
//             symmetrize, unweb, bind …), with the fitted skeleton as its `skeleton` input
// Each request names the previous output by sha256; bytes travel in `ask.inputs` only when they
// are on this machine, so `t3d neural run` can send them (one round per ask: five with a rigger). The fit is
// recomputed from the committed proxy at every build, by the same code that produced the
// program. A plain `steps` array skips the proxy: one pass, registered in TS on the output (for
// rigged models, `clips: 'model'`). Any miss returns null: the CPU creature.

import {
  type Bone,
  type BuildContext,
  type NeuralOutput,
  type NeuralRequests,
  Ts23dError,
} from '../core/index.ts';
import {
  type BlenderStep,
  blenderProgram,
  type ImportedModel,
  type ImportModelOptions,
  importModel,
  jsonInput,
  sha256Hex,
  skeletonJson,
} from '../neural/index.ts';
import type { CreatureSpec } from './creature-spec.ts';
import type { RigChains } from './model-joints.ts';
import { type ModelRig, modelRig } from './model-rig.ts';

/** The proxy pass: geometry only, no UVs, no maps. */
export const PROXY_TRIANGLES = 6000;
export const proxySteps = (triangles = PROXY_TRIANGLES): readonly BlenderStep[] => [
  { op: 'clean' },
  { op: 'retopo', triangles },
  { op: 'export' },
];

export interface ModelChainOptions {
  readonly concept: NeuralRequests['image'];
  /** The image-to-3D request, minus its image (the concept's sha256 is filled in). */
  readonly surface: Omit<NeuralRequests['mesh'], 'image'>;
  /**
   * The Blender program after `transform(fit)`: a function of the fit (two passes; needs `spec`),
   * e.g. `(rig) => [{ op: 'clean' }, { op: 'unweb' }, { op: 'retopo', … focus from rig.bones },
   * { op: 'uv' }, { op: 'bake' }, { op: 'bind' }, { op: 'lods', … }, { op: 'export' }]`.
   * A plain array runs as one pass on the raw mesh (no fit: nothing in it may depend on the
   * model's yaw, pose or size).
   */
  readonly steps: readonly BlenderStep[] | ((rig: ModelRig) => readonly BlenderStep[]);
  /** The planned animal: required with a `steps` function. */
  readonly spec?: CreatureSpec;
  readonly prefix?: string;
  /** Force a left/right symmetric skeleton fitted on the mirrored better half (profile concepts);
   *  the steps should then `symmetrize` with `rig.side`. */
  readonly symmetric?: boolean | '+' | '-';
  /** Declare the reposed (straight, symmetric) rest; the steps must `repose` to `rig.target`. */
  readonly repose?: boolean;
  /** About the yaw (degrees) that turns the model's front to +X, when the concept fixes it. */
  readonly front?: number;
  /** A learned rigger (the `rig` task's model, e.g. 'unirig') run on the proxy: its joints,
   *  mapped by topology (model-joints.ts), replace the geometric fit's. Default off. */
  readonly rig?: string | false;
  /** The chains the rigger's joints replace (model-joints.ts). Default all. */
  readonly take?: readonly RigChains[];
  /** Register from the rigger's joints, not the surface (modelRig `register`). Needs `rig`. */
  readonly register?: 'surface' | 'joints';
  /** End the head bone at the model's nose (modelRig `nose`). Default off. */
  readonly nose?: boolean;
  /** Creature clips to leave out by name. */
  readonly drop?: readonly string[];
  /** Triangles of the proxy pass. Default 6000. */
  readonly proxyTriangles?: number;
  /** Refuse a Blender LOD 0 above this (budget.triangles[0]). */
  readonly maxTriangles: number;
  /** Model pins per stage (only that model's outputs count). */
  readonly models?: { readonly image?: string; readonly mesh?: string; readonly blender?: string };
  /** Licence and author of the surface (the mesh model's), for the import gate and credits. */
  readonly license: string;
  readonly author: string;
  readonly url?: string;
  /** Seed of the Blender request. Default: the surface request's. */
  readonly seed?: number;
  readonly import?: ImportModelOptions;
}

/** The output's content hash: the cache's, else of the bytes in hand; null when neither. */
function hashOf(o: NeuralOutput | undefined): string | null {
  if (!o) return null;
  if (o.sha256) return o.sha256;
  return o.absent || o.bytes.length === 0 ? null : sha256Hex(o.bytes);
}

const needsSpec = (): Ts23dError =>
  new Ts23dError('T3D_RECIPE_INVALID', {
    cause: 'modelChain: `steps` is a function of the fit but no `spec` was given',
    fix: 'pass spec: <the CreatureSpec>, or give `steps` as a plain array for a single pass',
  });

const present = (o: NeuralOutput | undefined): o is NeuralOutput =>
  !!o && !o.absent && o.bytes.length > 0;

/** What the chain hands modelBody: the import, and the rig it was built for (two passes). */
export interface ChainedModel {
  readonly model: ImportedModel;
  /** Present after two passes: the mesh is already registered and may carry this rig's skin. */
  readonly rig?: ModelRig;
}

/** The imported Blender-steps model, or null on any cache miss (build the code creature). */
export function modelChain(ctx: BuildContext, o: ModelChainOptions): ChainedModel | null {
  const pin = (model: string | undefined) => (model === undefined ? {} : { model });
  const png = ctx.neural('image', o.concept, pin(o.models?.image))?.outputs[0];
  const image = hashOf(png);
  if (!image) return null;
  const raw = ctx.neural(
    'mesh',
    { ...o.surface, image: { sha256: image, mime: 'image/png' } },
    {
      ...pin(o.models?.mesh),
      keep: 'local',
      ...(present(png) ? { inputs: new Map([[image, png.bytes]]) } : {}),
    },
  )?.outputs[0];
  const mesh = hashOf(raw);
  if (!mesh) return null;
  const seed = o.seed ?? o.surface.seed;
  const source = (bytes: Uint8Array, what: string) => ({
    bytes,
    license: o.license,
    author: o.author,
    url: o.url ?? `neural cache (blender ${what} on mesh ${mesh.slice(0, 12)})`,
  });
  /** One `blender` ask on the raw mesh; null on a miss or an absent output. */
  const blend = (
    steps: readonly BlenderStep[],
    maxTriangles: number,
    skeleton?: Uint8Array,
  ): Uint8Array | null => {
    const program = blenderProgram(steps);
    const input = jsonInput(program);
    const inputs = new Map([[input.sha256, program]]);
    if (present(raw)) inputs.set(mesh, raw.bytes);
    const bones = skeleton ? jsonInput(skeleton) : undefined;
    if (skeleton && bones) inputs.set(bones.sha256, skeleton);
    const glb = ctx.neural(
      'blender',
      {
        seed,
        mesh: { sha256: mesh, mime: 'model/gltf-binary' },
        program: input,
        ...(bones ? { skeleton: bones } : {}),
        maxTriangles,
      },
      { ...pin(o.models?.blender), inputs },
    )?.outputs[0];
    return present(glb) ? glb.bytes : null;
  };
  if (typeof o.steps !== 'function') {
    const glb = blend(o.steps, o.maxTriangles);
    return glb
      ? { model: importModel(source(glb, 'steps'), { place: 'origin', ...o.import }) }
      : null;
  }
  if (!o.spec) throw needsSpec();
  const triangles = o.proxyTriangles ?? PROXY_TRIANGLES;
  const proxy = blend(proxySteps(triangles), triangles);
  if (!proxy) return null;
  const shell = importModel(source(proxy, 'proxy'), { place: 'origin' }).lods[0];
  if (!shell) return null;
  // Optional: a learned rigger's joints for the proxy (its skinned GLB is small and committed).
  let joints: readonly Bone[] | undefined;
  if (o.rig) {
    const sha = sha256Hex(proxy);
    const rigged = ctx.neural(
      'rig',
      { seed, mesh: { sha256: sha, mime: 'model/gltf-binary' } },
      { model: o.rig, inputs: new Map([[sha, proxy]]) },
    )?.outputs[0];
    if (!present(rigged)) return null;
    joints = importModel(source(rigged.bytes, 'rig'), { place: 'origin' }).armature?.bones;
  }
  const rig = modelRig(shell, o.spec, {
    ...(joints ? { joints } : {}),
    ...(o.take ? { take: o.take } : {}),
    ...(o.nose ? { nose: true } : {}),
    ...(o.register ? { register: o.register } : {}),
    prefix: o.prefix ?? '',
    ...(o.symmetric ? { symmetric: o.symmetric } : {}),
    ...(o.repose ? { repose: true } : {}),
    ...(o.front === undefined ? {} : { front: o.front }),
    drop: o.drop ?? [],
  });
  // Blender binds to the real bones; the half-angle helpers are split off in TS (model-body.ts).
  const sent = skeletonJson({ bones: [...rig.fitted] });
  const glb = blend(
    [{ op: 'transform', matrix: [...rig.fit.matrix] }, ...o.steps(rig)],
    o.maxTriangles,
    sent,
  );
  return glb
    ? { model: importModel(source(glb, 'final'), { place: 'origin', ...o.import }), rig }
    : null;
}
