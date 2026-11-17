// The per-recipe neural cache (ADR 014): model outputs are committed inputs under
// recipes/<name>/neural/<key>/{output-<i>.*, record.json}, at most 12 MB per recipe. Pure and
// synchronous on the read side, like the import cache: the CLI loads the directory (src/cli/
// neural-store.ts) and hands it over with `provideNeural`; a compile asks `providedNeural(recipe)
// .get(task, request)`. A miss returns `{ fallback: true }` plus a T3D_NEURAL_MISSING notice so the
// recipe takes its CPU path — an error only with `requireNeural`. `fill` runs an adapter (never in
// a build) and validates before anything is stored. `provideNeural` also serves `ctx.neural`.
// A `keep: 'local'` ask stores **local** outputs (`local-<i>.*`, git-ignored, outside the cap): a
// machine without the file still gets a hit, its outputs `absent` with only their sha256, so a
// chain (image → raw mesh → blender) reaches the committed downstream output.

import {
  checkNeuralResult,
  type NeuralOutput,
  type NeuralRequest,
  type NeuralResult,
  type NeuralTask,
  provideNeuralSource,
  Ts23dError,
} from '../core/index.ts';
import {
  jobKey,
  type NeuralAdapter,
  type NeuralJob,
  pickModel,
  requestKey,
  runJob,
  taskResult,
} from './adapter.ts';
import { makeRecord, type NeuralRecord } from './record.ts';
import { sha256Hex } from './sha256.ts';
import { validateOutputs } from './validate.ts';

/** ADR 014 §2: committed bytes per recipe (local outputs do not count). */
export const NEURAL_CAP_BYTES = 12 * 1024 * 1024;

export interface NeuralEntry {
  readonly record: NeuralRecord;
  readonly outputs: readonly NeuralOutput[];
}

export interface NeuralNotice {
  readonly code: 'T3D_NEURAL_MISSING';
  readonly message: string;
  readonly fix: string;
}

export type NeuralLookup<T extends NeuralTask> =
  | { readonly fallback: false; readonly result: NeuralResult<T>; readonly record: NeuralRecord }
  | { readonly fallback: true; readonly notice: NeuralNotice };

export interface NeuralAsk {
  /** Only this model's outputs count. */
  readonly model?: string;
  readonly inputs?: ReadonlyMap<string, Uint8Array>;
  /** Storage policy of a fill, never part of the key: outputs stay on this machine. */
  readonly keep?: 'local';
}

/** A job plus where its outputs are kept. */
export type NeuralCacheJob<T extends NeuralTask = NeuralTask> = NeuralJob<T> & {
  readonly keep?: 'local';
};

export interface RecipeNeuralCache {
  readonly recipe: string;
  /**
   * Cached result for this request, or the CPU fallback (throws with `requireNeural`). `ask.inputs`
   * (bytes of the request's inputs) travel with a miss so `t3d neural run` can send them.
   */
  get<T extends NeuralTask>(task: T, request: NeuralRequest<T>, ask?: NeuralAsk): NeuralLookup<T>;
  /** Run the job through `adapter` unless its key is cached; validated, capped, then stored. */
  fill<T extends NeuralTask>(
    adapter: NeuralAdapter,
    job: NeuralCacheJob<T>,
  ): Promise<{ readonly entry: NeuralEntry; readonly cached: boolean }>;
  entries(): readonly NeuralEntry[];
  /** Misses seen so far, one per request: the CLI prints them. */
  notices(): readonly NeuralNotice[];
  /** The jobs behind those misses, for `t3d neural run` to fill. */
  misses(): readonly NeuralCacheJob[];
  /** Committed bytes: what counts toward the cap (local outputs do not). */
  bytes(): number;
  /** Local outputs whose file is not on this machine: sha256 → the key that would remake it. */
  absentLocal(): ReadonlyMap<string, string>;
}

/** Committed bytes of an entry: the files' real lengths, never the record's own `bytes`. */
const size = (e: NeuralEntry): number =>
  e.record.outputs.reduce((s, o, i) => s + (o.local ? 0 : (e.outputs[i]?.bytes.length ?? 0)), 0);

const resultOf = <T extends NeuralTask>(e: NeuralEntry): NeuralResult<T> =>
  taskResult(e.record.task as T, e.outputs, e.record.score);

const NO_BYTES = new Uint8Array();

/**
 * Pair a record with its files, re-checking hashes and task validation: committed bytes are
 * untrusted. A local output without its file is `absent` (hash only); task validation then waits
 * for a machine that holds every file.
 */
export function entryOf(record: NeuralRecord, files: ReadonlyMap<string, Uint8Array>): NeuralEntry {
  const outputs = record.outputs.map((o): NeuralOutput => {
    const bytes = files.get(o.file);
    if (!bytes && o.local) return { bytes: NO_BYTES, mime: o.mime, sha256: o.sha256, absent: true };
    if (!bytes || sha256Hex(bytes) !== o.sha256)
      throw new Ts23dError('T3D_NEURAL_OUTPUT_INVALID', {
        cause: `neural/${record.key.slice(0, 12)}…/${o.file} is ${bytes ? 'changed' : 'missing'}`,
        fix: 'delete that key directory and run `t3d neural run <recipe>` again',
      });
    // The recorded length is checked too: the cap must not be dodged by a record that says 0.
    if (bytes.length !== o.bytes)
      throw new Ts23dError('T3D_NEURAL_OUTPUT_INVALID', {
        cause: `neural/${record.key.slice(0, 12)}…/${o.file} is ${bytes.length} bytes, record.json says ${o.bytes}`,
        fix: 'delete that key directory and run `t3d neural run <recipe>` again',
      });
    return { bytes, mime: o.mime, sha256: o.sha256 };
  });
  const entry = { record, outputs };
  if (!outputs.some((o) => o.absent))
    validateOutputs(record.task, record.request, checkNeuralResult(record.task, resultOf(entry)));
  return entry;
}

export function neuralCache(o: {
  readonly recipe: string;
  readonly entries?: Iterable<NeuralEntry>;
  /** A miss is an error (`--require-neural`), not a fallback. */
  readonly requireNeural?: boolean;
  /** Never run an adapter: `fill` serves hits and treats a miss like `get`. */
  readonly offline?: boolean;
  /** Bytes allowed across all committed outputs; default NEURAL_CAP_BYTES (ADR 014). */
  readonly capBytes?: number;
}): RecipeNeuralCache {
  const cap = o.capBytes ?? NEURAL_CAP_BYTES;
  const byKey = new Map<string, NeuralEntry>();
  for (const e of o.entries ?? []) byKey.set(e.record.key, e);
  const notices = new Map<string, { notice: NeuralNotice; job: NeuralCacheJob }>();
  const run = `t3d neural run recipes/${o.recipe}/${o.recipe}.ts`;
  const total = (): number => [...byKey.values()].reduce((s, e) => s + size(e), 0);

  const miss = (job: NeuralCacheJob, rk: string): NeuralNotice => {
    const { task, model } = job;
    const message = `${o.recipe}: no cached ${task} output for request ${rk.slice(0, 12)}…${model ? ` (model ${model})` : ''}; using the CPU path`;
    const fix = `run \`${run}\` on a machine with a ${task} adapter (t3d.config.ts), then commit recipes/${o.recipe}/neural/`;
    if (o.requireNeural) throw new Ts23dError('T3D_NEURAL_MISSING', { cause: message, fix });
    const notice: NeuralNotice = { code: 'T3D_NEURAL_MISSING', message, fix };
    notices.set(`${rk}:${model ?? ''}`, { notice, job });
    return notice;
  };

  const get = <T extends NeuralTask>(
    task: T,
    request: NeuralRequest<T>,
    ask: NeuralAsk = {},
  ): NeuralLookup<T> => {
    const { model } = ask;
    const rk = requestKey(task, request);
    const hit = [...byKey.values()]
      .filter((e) => e.record.requestKey === rk && e.record.task === task)
      .filter((e) => model === undefined || e.record.model.id === model)
      .sort((a, b) => (a.record.key < b.record.key ? -1 : 1))[0];
    if (hit) return { fallback: false, result: resultOf<T>(hit), record: hit.record };
    const job: NeuralCacheJob = {
      task,
      request,
      ...(model !== undefined ? { model } : {}),
      ...(ask.inputs ? { inputs: ask.inputs } : {}),
      ...(ask.keep ? { keep: ask.keep } : {}),
    };
    return { fallback: true, notice: miss(job, rk) };
  };

  return {
    recipe: o.recipe,
    get,
    async fill(adapter, { keep, ...job }) {
      if (o.offline) {
        const r = get(job.task, job.request, job);
        if (r.fallback)
          throw new Ts23dError('T3D_NEURAL_MISSING', {
            cause: r.notice.message,
            fix: r.notice.fix,
          });
        const entry = byKey.get(r.record.key);
        if (entry) return { entry, cached: true };
      }
      const model = pickModel(adapter.id, await adapter.models(), job.task, job.model);
      const key = jobKey(job.task, job.request, model);
      const have = byKey.get(key);
      if (have) return { entry: have, cached: true };
      const done = await runJob(adapter, { ...job, model: model.id });
      const record = makeRecord({
        key,
        requestKey: requestKey(job.task, job.request),
        task: job.task,
        adapter: adapter.id,
        request: job.request,
        run: { ...done, model: { ...model, ...done.model } },
        local: keep === 'local',
      });
      const entry: NeuralEntry = {
        record,
        outputs: done.result.outputs.map((x, i) => ({
          bytes: x.bytes,
          mime: x.mime,
          sha256: record.outputs[i]?.sha256 ?? sha256Hex(x.bytes),
        })),
      };
      const after = total() + size(entry);
      if (after > cap)
        throw new Ts23dError('T3D_NEURAL_FAILED', {
          cause: `${o.recipe}: neural cache would hold ${after} bytes, cap ${cap} (ADR 014)`,
          fix: "ask for smaller outputs (size, width/height, maxTriangles), delete unused keys under neural/, or keep an output that only feeds a next request off git: ctx.neural(task, request, { keep: 'local' })",
        });
      byKey.set(key, entry);
      return { entry, cached: false };
    },
    entries: () => [...byKey.values()].sort((a, b) => (a.record.key < b.record.key ? -1 : 1)),
    notices: () => [...notices.values()].map((n) => n.notice),
    misses: () => [...notices.values()].map((n) => n.job),
    bytes: total,
    absentLocal: () => {
      const out = new Map<string, string>();
      for (const e of byKey.values())
        e.outputs.forEach((x, i) => {
          const sha = e.record.outputs[i]?.sha256;
          if (x.absent && sha) out.set(sha, e.record.key);
        });
      return out;
    },
  };
}

const provided = new Map<string, RecipeNeuralCache>();

/** Hand a loaded cache to compiles of its recipe's assets (the CLI does this before building). */
export function provideNeural(cache: RecipeNeuralCache, assets: readonly string[] = []): void {
  const names = [cache.recipe, ...assets];
  for (const name of names) provided.set(name, cache);
  // `ctx.neural` in those compiles reads the same cache: a hit's result, a miss → null (CPU path).
  provideNeuralSource(names, {
    get: (task, request, ask) => {
      const r = cache.get(task, request, ask);
      return r.fallback ? null : r.result;
    },
  });
}

/** The cache provided for a recipe or asset name, or an empty offline one (all fall back). */
export function providedNeural(recipe: string, requireNeural = false): RecipeNeuralCache {
  return provided.get(recipe) ?? neuralCache({ recipe, offline: true, requireNeural });
}
