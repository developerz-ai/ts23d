// The neural task contract shared by /neural adapters and /kinds callers: task names, the typed
// request and result per task, inputs by sha256, outputs as bytes + mime. Outputs are cached
// inputs to a build, never a build step (ADR 014); models are the user's choice (ADR 015). Tool
// tasks (cloth, fracture, engine-check, ktx2, meshopt; `rig` with a template) run external tools
// (Blender, Godot, Basis Universal, meshoptimizer) behind the same contract; `groom` sends a scalp
// GLB + guide curves JSON + an ordered groom op list and gets hair cards back (Blender hair curves);
// `blender` sends a mesh + an ordered step program (`t3d-blender-steps/1`, /neural blender-steps.ts)
// and gets one GLB (lod0..2, own UVs, baked PNG maps, a skin when bound) + a JSON report back.

import { Ts23dError } from './errors.ts';

export const NEURAL_TASKS = [
  'image',
  'mesh',
  'texture',
  'rig',
  'motion',
  'hair',
  'score',
  'cloth',
  'fracture',
  'engine-check',
  'ktx2',
  'meshopt',
  'groom',
  'blender',
] as const;
export type NeuralTask = (typeof NEURAL_TASKS)[number];

export const isNeuralTask = (v: unknown): v is NeuralTask =>
  typeof v === 'string' && (NEURAL_TASKS as readonly string[]).includes(v);

/** A file handed to a model, named by content: the cache key covers the hash, not the path. */
export interface NeuralInput {
  /** Lowercase hex sha256 of the bytes. */
  readonly sha256: string;
  readonly mime: string;
}

/** One file a model returned. */
export interface NeuralOutput {
  /** Empty when `absent`. */
  readonly bytes: Uint8Array;
  readonly mime: string;
  /** Lowercase hex sha256 of the file; always set on outputs the recipe cache serves. */
  readonly sha256?: string;
  /** A local output (`keep: 'local'`) whose file is not on this machine: only its hash is known. */
  readonly absent?: true;
}

/** Fields every request carries; all enter the cache key. */
interface NeuralRequestBase {
  readonly seed: number;
  /** Model-specific knobs (steps, guidance…), plain values only. */
  readonly params?: Readonly<Record<string, number | string | boolean>>;
}

export interface NeuralRequests {
  readonly image: NeuralRequestBase & {
    readonly prompt: string;
    readonly negative?: string;
    readonly width: number;
    readonly height: number;
    /** Control maps (depth, normal, silhouette) the image must follow. */
    readonly control?: readonly NeuralInput[];
  };
  readonly mesh: NeuralRequestBase & {
    readonly image?: NeuralInput;
    /** More views of the same subject (front, side, back…), for multi-image models. */
    readonly images?: readonly NeuralInput[];
    readonly prompt?: string;
    /** Rest pose asked of a humanoid. */
    readonly pose?: 'a-pose' | 't-pose';
    readonly maxTriangles?: number;
  };
  readonly texture: NeuralRequestBase & {
    /** The LOD0 GLB to paint. */
    readonly mesh: NeuralInput;
    readonly prompt: string;
    readonly size: number;
    readonly control?: readonly NeuralInput[];
  };
  readonly rig: NeuralRequestBase & {
    readonly mesh: NeuralInput;
    readonly maxBones?: number;
    /** A rig template to generate on the mesh's armature (Rigify meta-rig), e.g. 'human'. */
    readonly template?: string;
    /** Height of the character, metres (hosted riggers scale their skeleton by it). */
    readonly height?: number;
    /** Animation clips to bake on the rig: adapter-specific action names. */
    readonly clips?: readonly string[];
  };
  readonly motion: NeuralRequestBase & {
    readonly prompt: string;
    /** Skeleton (JSON) the keys are for. */
    readonly skeleton: NeuralInput;
    readonly seconds: number;
    readonly fps: number;
    /** A reference clip (video-to-motion: mp4/webm) the keys follow instead of only the prompt. */
    readonly video?: NeuralInput;
  };
  readonly hair: NeuralRequestBase & {
    readonly mesh: NeuralInput;
    readonly prompt?: string;
    /** A reference photo of the hairstyle (image-to-hair). */
    readonly image?: NeuralInput;
  };
  readonly score: NeuralRequestBase & {
    readonly images: readonly NeuralInput[];
    readonly rubric?: string;
  };
  /** Drape a garment GLB on a body GLB under gravity; returns the draped garment GLB. */
  readonly cloth: NeuralRequestBase & {
    readonly garment: NeuralInput;
    /** Collision body the garment falls onto. */
    readonly body: NeuralInput;
    /** Simulated frames at 24 fps. */
    readonly frames: number;
    /** Vertices at or above this height (metres, Z up) stay pinned (shoulders, a pole). */
    readonly pinAboveZ?: number;
    /** Solver substeps per frame (quality). */
    readonly substeps?: number;
  };
  /** Voronoi cell fracture of a closed mesh into named pieces (optionally settled by rigid body). */
  readonly fracture: NeuralRequestBase & {
    readonly mesh: NeuralInput;
    readonly pieces: number;
    /** Rigid-body frames to let the pieces fall and settle on z = 0; 0 = pieces at rest. */
    readonly settleFrames?: number;
  };
  /** Import a GLB in a game engine headless and report what it kept (JSON, advisory). */
  readonly 'engine-check': NeuralRequestBase & {
    readonly mesh: NeuralInput;
    readonly engine: 'godot';
  };
  /** Encode a PNG as KTX2 (Basis Universal). */
  readonly ktx2: NeuralRequestBase & {
    readonly image: NeuralInput;
    readonly mode: 'uastc' | 'etc1s';
    readonly mipmaps?: boolean;
    /** Colour data (albedo) vs linear data (normal, ORM). */
    readonly srgb?: boolean;
  };
  /** meshoptimizer (gltfpack): EXT_meshopt_compression and/or simplification of a GLB. */
  readonly meshopt: NeuralRequestBase & {
    readonly mesh: NeuralInput;
    readonly compress: boolean;
    /** Keep this fraction of triangles (0..1]; 1 = no simplification. */
    readonly simplify?: number;
  };
  /** Hair curves → cards: children interpolated from the guides on the scalp, styled by `ops`,
   *  grouped into locks, each lock a card (UV.u across, UV.v root → tip). Returns a cards GLB. */
  readonly groom: NeuralRequestBase & {
    /** The root surface (head and hair cap) the children root on and clear, GLB (glTF frame). */
    readonly mesh: NeuralInput;
    /** What the strands and cards must clear (head, torso: long hair falls onto it), GLB. */
    readonly body?: NeuralInput;
    /** Guide curves + per-guide op masks (`t3d-groom/1` JSON, kinds/groom-guides.ts). */
    readonly guides: NeuralInput;
    /** Child strands per guide. */
    readonly children: number;
    /** Cards (locks) wanted; the tool groups children into this many. */
    readonly cards: number;
    /** Points along each card's centre line (segments + 1). */
    readonly points: number;
    /** Refuse a cards GLB above this. */
    readonly maxTriangles: number;
  };
  /** Run an ordered program of Blender mesh steps headless; returns a GLB (nodes lod0..2) + report. */
  readonly blender: NeuralRequestBase & {
    /** The mesh the program starts from (GLB, glTF frame). Absent: it must start with a build op. */
    readonly mesh?: NeuralInput;
    /** `t3d-blender-steps/1` JSON: the ordered ops (`blenderProgram` in /neural). */
    readonly program: NeuralInput;
    /** `t3d-skeleton/1` JSON (`skeletonJson` in /neural), when a step binds. */
    readonly skeleton?: NeuralInput;
    /** Refuse an output LOD0 above this. */
    readonly maxTriangles: number;
  };
}

export type NeuralRequest<T extends NeuralTask = NeuralTask> = NeuralRequests[T];

export interface NeuralResults {
  readonly image: { readonly outputs: readonly NeuralOutput[] };
  readonly mesh: { readonly outputs: readonly NeuralOutput[] };
  readonly texture: { readonly outputs: readonly NeuralOutput[] };
  readonly rig: { readonly outputs: readonly NeuralOutput[] };
  readonly motion: { readonly outputs: readonly NeuralOutput[] };
  readonly hair: { readonly outputs: readonly NeuralOutput[] };
  /** A 0..10 score plus any annotated images. */
  readonly score: { readonly outputs: readonly NeuralOutput[]; readonly score: number };
  readonly cloth: { readonly outputs: readonly NeuralOutput[] };
  readonly fracture: { readonly outputs: readonly NeuralOutput[] };
  readonly 'engine-check': { readonly outputs: readonly NeuralOutput[] };
  readonly ktx2: { readonly outputs: readonly NeuralOutput[] };
  readonly meshopt: { readonly outputs: readonly NeuralOutput[] };
  readonly groom: { readonly outputs: readonly NeuralOutput[] };
  /** Output 0: the GLB; output 1: the `t3d-blender-report/1` JSON; then one PNG per view of
   *  every `review` step, in step order (named in the report's `review` list). */
  readonly blender: { readonly outputs: readonly NeuralOutput[] };
}

export type NeuralResult<T extends NeuralTask = NeuralTask> = NeuralResults[T];

/** Output mimes each task may return; anything else is refused before use. */
export const NEURAL_MIMES: Readonly<Record<NeuralTask, readonly string[]>> = {
  image: ['image/png'],
  mesh: ['model/gltf-binary'],
  texture: ['image/png'],
  rig: ['model/gltf-binary', 'application/json'],
  motion: ['model/gltf-binary', 'application/json'],
  hair: ['model/gltf-binary', 'application/json'],
  score: ['application/json', 'image/png'],
  cloth: ['model/gltf-binary'],
  fracture: ['model/gltf-binary', 'application/json'],
  'engine-check': ['application/json'],
  ktx2: ['image/ktx2'],
  meshopt: ['model/gltf-binary'],
  groom: ['model/gltf-binary', 'application/json'],
  blender: ['model/gltf-binary', 'application/json', 'image/png'],
};

const SHA256 = /^[0-9a-f]{64}$/;

/** An input is named by a lowercase hex sha256. */
export function checkNeuralInput(task: NeuralTask, input: NeuralInput): NeuralInput {
  if (!SHA256.test(input.sha256))
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `${task} input '${input.sha256}' is not a lowercase hex sha256`,
      fix: 'name inputs by the sha256 of their bytes (64 lowercase hex chars)',
    });
  return input;
}

/** Structural check of a result: at least one output, non-empty, allowed mime; score in 0..10. */
export function checkNeuralResult<T extends NeuralTask>(
  task: T,
  result: NeuralResult<T>,
): NeuralResult<T> {
  const bad = (cause: string, fix: string): never => {
    throw new Ts23dError('T3D_NEURAL_OUTPUT_INVALID', { cause: `${task}: ${cause}`, fix });
  };
  const allowed = NEURAL_MIMES[task];
  if (task !== 'score' && result.outputs.length === 0)
    bad('the model returned no outputs', 'check the adapter maps its outputs to this task');
  result.outputs.forEach((o, i) => {
    if (!allowed.includes(o.mime))
      bad(`output ${i} is '${o.mime}'`, `return one of ${allowed.join(', ')}`);
    if (o.bytes.length === 0) bad(`output ${i} is empty`, 'return the file bytes, not a path');
  });
  if ('score' in result) {
    const s = result.score;
    if (!(Number.isFinite(s) && s >= 0 && s <= 10))
      bad(`score ${s} is outside 0..10`, 'scale the model score to 0..10');
  }
  return result;
}
