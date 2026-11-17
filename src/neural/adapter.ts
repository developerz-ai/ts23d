// The neural adapter contract (ADR 015): any model plugs in as a `NeuralAdapter` that runs typed
// tasks (src/core/neural-task.ts). This file owns the job key — sha256 of canonical JSON
// {contract, task, model, weightsSha256, request} with floats rounded to 1e-6, so the same request
// always maps to the same cache entry — and `runJob`, the one way a job reaches a model: inputs are
// checked against their bytes, every output is validated before anyone uses it.

import {
  checkNeuralInput,
  checkNeuralResult,
  type NeuralInput,
  type NeuralOutput,
  type NeuralRequest,
  type NeuralResult,
  type NeuralTask,
  Ts23dError,
} from '../core/index.ts';
import { sha256Hex } from './sha256.ts';
import { validateOutputs } from './validate.ts';

/** Wire contract version; part of every job key and every record. */
export const NEURAL_CONTRACT = 't3d-neural/1';

/** The external tool behind a tool task (Blender, Godot, basisu, gltfpack): recorded per output. */
export interface NeuralToolInfo {
  readonly name: string;
  /** As the tool printed it, e.g. '5.2.4 LTS'. */
  readonly version: string;
  /** The tool's own licence (its outputs are the user's: model licence 'own'). */
  readonly licence: string;
  /** sha256 of the script the tool ran (Blender task scripts, the Godot check), when one did. */
  readonly scriptSha256?: string;
}

/** One model an adapter can run (`GET /v1/models` in t3d-neural/1). */
export interface NeuralModelInfo {
  readonly id: string;
  readonly task: NeuralTask;
  /** Licence of the model's outputs as declared by the server or the user: recorded, never gated. */
  readonly licence: string;
  /** sha256 of the weights, when the server knows it: part of the job key. */
  readonly weightsSha256?: string;
  readonly vramGb?: number;
  /** Where the licence terms are published (hosted services). */
  readonly terms?: string;
  /** Price per job as the service lists it (`t3d neural ls`; never recorded). */
  readonly cost?: number;
  /** Tool adapters: what ran. Its version and script hash also make up `weightsSha256`. */
  readonly tool?: NeuralToolInfo;
}

export interface NeuralJob<T extends NeuralTask = NeuralTask> {
  readonly task: T;
  readonly request: NeuralRequest<T>;
  /** Model id; unset = the adapter's first model for the task. */
  readonly model?: string;
  /** Bytes of every input the request names, keyed by their sha256. */
  readonly inputs?: ReadonlyMap<string, Uint8Array>;
}

export interface NeuralRun<T extends NeuralTask = NeuralTask> {
  readonly result: NeuralResult<T>;
  readonly model: NeuralModelInfo;
  /** What the server said it is (`x-t3d-server` / its version field), when it said. */
  readonly server?: string;
}

export interface NeuralAdapter {
  /** e.g. `http:http://127.0.0.1:8190`, `comfy:…`, `mock`. */
  readonly id: string;
  readonly tasks: readonly NeuralTask[];
  models(): Promise<readonly NeuralModelInfo[]>;
  run<T extends NeuralTask>(job: NeuralJob<T>): Promise<NeuralRun<T>>;
}

const round = (n: number): number => {
  if (!Number.isFinite(n))
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `a neural request holds ${n}`,
      fix: 'pass finite numbers only in neural requests and params',
    });
  const r = Math.round(n * 1e6) / 1e6;
  return r === 0 ? 0 : r;
};

/** JSON with sorted keys, floats rounded to 1e-6, `undefined` fields dropped. */
export function canonicalJson(v: unknown): string {
  if (typeof v === 'number') return JSON.stringify(round(v));
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
}

const hash = (v: unknown): string => sha256Hex(new TextEncoder().encode(canonicalJson(v)));

/** Names the request alone (no model): how an offline build finds a committed output. */
export const requestKey = <T extends NeuralTask>(task: T, request: NeuralRequest<T>): string =>
  hash({ contract: NEURAL_CONTRACT, task, request });

/** The cache key of one job on one model. */
export function jobKey<T extends NeuralTask>(
  task: T,
  request: NeuralRequest<T>,
  model: Pick<NeuralModelInfo, 'id' | 'weightsSha256'>,
): string {
  return hash({
    contract: NEURAL_CONTRACT,
    task,
    model: model.id,
    weightsSha256: model.weightsSha256 ?? null,
    request,
  });
}

/** Every input a request names, in field order. */
export function inputsOf<T extends NeuralTask>(task: T, request: NeuralRequest<T>): NeuralInput[] {
  const r = fieldsOf(request);
  const out: NeuralInput[] = [];
  for (const k of [
    'image',
    'video',
    'mesh',
    'garment',
    'body',
    'skeleton',
    'control',
    'images',
    'guides',
    'program',
  ]) {
    const v = r[k];
    const list = Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : [];
    for (const i of list) out.push(checkNeuralInput(task, i as NeuralInput));
  }
  return out;
}

/** Pick `id` (or the first model for `task`) from what an adapter offers. */
export function pickModel(
  adapter: string,
  models: readonly NeuralModelInfo[],
  task: NeuralTask,
  id?: string,
): NeuralModelInfo {
  const fit = models.filter((m) => m.task === task);
  const m = id === undefined ? fit[0] : fit.find((x) => x.id === id);
  if (m) return m;
  throw new Ts23dError('T3D_NEURAL_FAILED', {
    cause: `${adapter} has no ${task} model${id === undefined ? '' : ` '${id}'`}`,
    fix: fit.length
      ? `use one of: ${fit.map((x) => x.id).join(', ')} (t3d neural ls)`
      : `configure a ${task} adapter in t3d.config.ts (neural: { ${task}: … })`,
  });
}

/** Checks inputs, runs the job, validates every output. Foreign throws become T3D_NEURAL_FAILED. */
export async function runJob<T extends NeuralTask>(
  adapter: NeuralAdapter,
  job: NeuralJob<T>,
): Promise<NeuralRun<T>> {
  for (const i of inputsOf(job.task, job.request)) {
    const bytes = job.inputs?.get(i.sha256);
    if (!bytes || sha256Hex(bytes) !== i.sha256)
      throw new Ts23dError('T3D_RECIPE_INVALID', {
        cause: `${job.task} input ${i.sha256.slice(0, 12)}… has ${bytes ? 'different' : 'no'} bytes`,
        fix: 'pass the bytes of every input in job.inputs, keyed by their sha256',
      });
  }
  if (!adapter.tasks.includes(job.task))
    throw new Ts23dError('T3D_NEURAL_FAILED', {
      cause: `${adapter.id} does not run '${job.task}' (it runs ${adapter.tasks.join(', ')})`,
      fix: `configure a ${job.task} adapter in t3d.config.ts`,
    });
  let run: NeuralRun<T>;
  try {
    run = await adapter.run(job);
  } catch (e) {
    if (e instanceof Ts23dError) throw e;
    throw new Ts23dError('T3D_NEURAL_FAILED', {
      cause: `${adapter.id} ${job.task}: ${e instanceof Error ? e.message : String(e)}`,
      fix: `check the ${adapter.id} adapter and its server log`,
    });
  }
  checkNeuralResult(job.task, run.result);
  validateOutputs(job.task, job.request, run.result);
  return run;
}

/** A task's model in `t3d.config.ts`: an adapter, optionally pinned to one of its models. */
export type NeuralBinding =
  | NeuralAdapter
  | { readonly adapter: NeuralAdapter; readonly model?: string };

/** What `t3d.config.ts` exports as `config` (named export; the CLI loads it). */
export interface T3dConfig {
  readonly neural?: Partial<Record<NeuralTask, NeuralBinding>>;
  /** Every cache miss is an error (same as `--require-neural`). */
  readonly requireNeural?: boolean;
}

/** Typed identity for `export const config = defineConfig({ neural: { mesh: http(url, 'm') } })`. */
export const defineConfig = (c: T3dConfig): T3dConfig => c;

/** A request's fields by name, for adapters that map them onto a wire format. */
export const fieldsOf = (r: NeuralRequest): Readonly<Record<string, unknown>> =>
  r as unknown as Readonly<Record<string, unknown>>;

/** Build a task result from outputs (+ the score, for `score`); checkNeuralResult validates it. */
export const taskResult = <T extends NeuralTask>(
  task: T,
  outputs: readonly NeuralOutput[],
  score?: number,
): NeuralResult<T> =>
  (task === 'score'
    ? { outputs, score: score ?? Number.NaN }
    : { outputs }) as unknown as NeuralResult<T>;
