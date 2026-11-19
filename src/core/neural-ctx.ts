// `ctx.neural(task, request)`: a recipe asks for a model output (a surface, a texture, motion,
// hair, a concept image) and gets the committed cached result, or `null` → its CPU path (ADR 014).
// Synchronous: compile never calls a model or the network. The cache lives in /neural (a higher
// tier), so it is injected here by name, like `provideImports`: the CLI (or a test) calls
// `provideNeuralSource([recipe, ...assets], source)` before compiling; with no source every ask is
// a miss. Requests are checked here (inputs named by sha256) so a typo fails on every machine,
// not only on the one with the cache.

import { Ts23dError } from './errors.ts';
import {
  checkNeuralInput,
  isNeuralTask,
  type NeuralInput,
  type NeuralRequest,
  type NeuralResult,
  type NeuralTask,
} from './neural-task.ts';

/** What travels with an ask: a model pin, and the bytes of the request's inputs for `t3d neural run`. */
export interface NeuralCtxAsk {
  /** Only this model's outputs count. */
  readonly model?: string;
  /** Bytes of every input the request names, keyed by their sha256. */
  readonly inputs?: ReadonlyMap<string, Uint8Array>;
  /**
   * Storage policy, not part of the cache key: `'local'` keeps the outputs on the machine that
   * made them (git-ignored, outside the cap; record.json still commits their sha256). Elsewhere
   * the hit's outputs are `absent`: for raw meshes too big to commit that only feed a next request.
   */
  readonly keep?: 'local';
  /**
   * The asset has no CPU path worth building (a model-first body): in a build, a miss of this ask
   * stops with T3D_NEURAL_MISSING, not `null`. `t3d neural run` still lists it as a request to
   * fill, and a compile with no cache provided at all still gets `null`.
   */
  readonly required?: boolean;
}

/** Where cached outputs come from (/neural's recipe cache implements it). */
export interface NeuralSource {
  get<T extends NeuralTask>(
    task: T,
    request: NeuralRequest<T>,
    ask?: NeuralCtxAsk,
  ): NeuralResult<T> | null;
}

/** `ctx.neural`: the cached output, or null (no cache, a miss, or no source provided). */
export type NeuralReader = <T extends NeuralTask>(
  task: T,
  request: NeuralRequest<T>,
  ask?: NeuralCtxAsk,
) => NeuralResult<T> | null;

const sources = new Map<string, NeuralSource>();

/** Serve `names` (a recipe and its asset names) from `source` until replaced or cleared. */
export function provideNeuralSource(names: readonly string[], source: NeuralSource): void {
  for (const n of names) sources.set(n, source);
}

/** Forget every provided source (tests; a long-lived process switching recipes). */
export function clearNeuralSources(): void {
  sources.clear();
}

const INPUT_FIELDS = [
  'image',
  'video',
  'mesh',
  'garment',
  'body',
  'skeleton',
  'guides',
  'program',
] as const;
const LIST_FIELDS = ['control', 'images'] as const;

/** Every NeuralInput a request names, checked as a sha256 (T3D_RECIPE_INVALID otherwise). */
function checkInputs(task: NeuralTask, request: object): void {
  const r = request as Readonly<Record<string, unknown>>;
  const one = (v: unknown): void => {
    if (v !== undefined) checkNeuralInput(task, v as NeuralInput);
  };
  for (const k of INPUT_FIELDS) one(r[k]);
  for (const k of LIST_FIELDS) for (const v of (r[k] as unknown[] | undefined) ?? []) one(v);
}

/** The `ctx.neural` of one asset's compile. */
export function neuralReader(asset: string): NeuralReader {
  return (task, request, ask) => {
    if (!isNeuralTask(task))
      throw new Ts23dError('T3D_RECIPE_INVALID', {
        cause: `ctx.neural('${String(task)}') in '${asset}' is not a neural task`,
        fix: "use one of the NEURAL_TASKS: 'mesh', 'texture', 'image', 'motion', 'hair', …",
      });
    if (!Number.isInteger(request.seed))
      throw new Ts23dError('T3D_RECIPE_INVALID', {
        cause: `ctx.neural('${task}') in '${asset}' has seed ${request.seed}`,
        fix: 'give every neural request an integer seed: the cache key covers it',
      });
    checkInputs(task, request);
    return sources.get(asset)?.get(task, request, ask) ?? null;
  };
}
