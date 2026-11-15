// The neural task contract shared by /neural adapters and /kinds callers: task names, the typed
// request and result per task, inputs by sha256, outputs as bytes + mime. Outputs are cached
// inputs to a build, never a build step (ADR 014); models are the user's choice (ADR 015).

import { Ts23dError } from './errors.ts';

export const NEURAL_TASKS = ['image', 'mesh', 'texture', 'rig', 'motion', 'hair', 'score'] as const;
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
  readonly bytes: Uint8Array;
  readonly mime: string;
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
    readonly prompt?: string;
    readonly maxTriangles?: number;
  };
  readonly texture: NeuralRequestBase & {
    /** The LOD0 GLB to paint. */
    readonly mesh: NeuralInput;
    readonly prompt: string;
    readonly size: number;
    readonly control?: readonly NeuralInput[];
  };
  readonly rig: NeuralRequestBase & { readonly mesh: NeuralInput; readonly maxBones?: number };
  readonly motion: NeuralRequestBase & {
    readonly prompt: string;
    /** Skeleton (JSON) the keys are for. */
    readonly skeleton: NeuralInput;
    readonly seconds: number;
    readonly fps: number;
  };
  readonly hair: NeuralRequestBase & { readonly mesh: NeuralInput; readonly prompt?: string };
  readonly score: NeuralRequestBase & {
    readonly images: readonly NeuralInput[];
    readonly rubric?: string;
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
