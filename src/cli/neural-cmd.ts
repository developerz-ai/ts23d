// `t3d neural ls` lists the models every configured adapter offers (t3d.config.ts).
// `t3d neural run <recipe.ts…>` fills the recipe's committed cache: compiles every asset at LOD
// 0-2 against the cache already on disk (hits print as `=` lines), collects the requests that
// missed, runs each through the adapter configured for its task, validates, and writes
// recipes/<name>/neural/<key>/. Requests
// with no adapter stay missing (notice); with --require-neural any left missing is an error.
// The only command that talks to a model; builds never do (ADR 014).

import {
  compile,
  type Lod,
  type NeuralRequests,
  type NeuralTask,
  Ts23dError,
} from '../core/index.ts';
import { decodePng } from '../material/index.ts';
import {
  type NeuralEntry,
  type NeuralJob,
  neuralCache,
  provideNeural,
  publishable,
  type RecipeNeuralCache,
} from '../neural/index.ts';
import { checkInputImage } from '../render/index.ts';
import { type LoadedConfig, loadConfig } from './config.ts';
import { loadAssets } from './load.ts';
import { loadNeuralEntries, neuralDirOf, saveNeuralEntry } from './neural-store.ts';
import { envelope, printError } from './report.ts';

export interface ListedModel {
  readonly task: NeuralTask;
  readonly adapter: string;
  readonly id: string;
  readonly licence: string;
  readonly weightsSha256?: string;
  readonly vramGb?: number;
  readonly cost?: number;
  readonly terms?: string;
  /** The config pins this model for the task. */
  readonly pinned: boolean;
}

export async function neuralLs(config: LoadedConfig): Promise<ListedModel[]> {
  const out: ListedModel[] = [];
  for (const [task, b] of config.neural)
    for (const m of await b.adapter.models())
      if (m.task === task)
        out.push({ ...m, task, adapter: b.adapter.id, pinned: m.id === b.model });
  return out;
}

export interface NeuralFilled {
  readonly task: NeuralTask;
  readonly key: string;
  readonly model: string;
  readonly dir: string;
  readonly cached: boolean;
  readonly warning?: string;
}

export interface NeuralRunResult {
  readonly file: string;
  readonly recipe: string;
  readonly filled: readonly NeuralFilled[];
  readonly missing: readonly { readonly message: string; readonly fix: string }[];
  /** Input-image findings sent anyway under --allow-bad-input. */
  readonly notices: readonly string[];
}

const LODS: readonly Lod[] = [0, 1, 2];

function filledOf(entry: NeuralEntry, dir: string, cached: boolean): NeuralFilled {
  return {
    task: entry.record.task,
    key: entry.record.key,
    model: entry.record.model.id,
    dir,
    cached,
    ...(publishable(entry.record)
      ? {}
      : {
          warning: `licence '${entry.record.model.licence}' may not allow publishing outputs: this repository's recipes gate refuses them (ADR 015)`,
        }),
  };
}

const CLEAN_FIX =
  'generate a clean concept: t3d concept <recipe> (plain background, ¾ view, full frame), or strip the background with an image/segment model';

/**
 * Input-image rules (render/input-image.ts) on a `mesh` request's image, BEFORE anything is sent:
 * a failing image is T3D_NEURAL_INPUT (D55: cluttered photos make broken AI meshes). With
 * `allowBadInput` the findings come back instead, to print and to record in record.json.
 */
export function checkMeshInputs(recipe: string, job: NeuralJob, allowBadInput = false): string[] {
  if (job.task !== 'mesh') return [];
  const image = (job.request as NeuralRequests['mesh']).image;
  if (!image) return [];
  const bytes = job.inputs?.get(image.sha256);
  const where = `${recipe}: mesh input ${image.sha256.slice(0, 12)}…`;
  const fail = (findings: readonly string[]): string[] => {
    if (allowBadInput) return findings.map((f) => `${where}: ${f} (allowed: --allow-bad-input)`);
    throw new Ts23dError('T3D_NEURAL_INPUT', {
      cause: `${where}: ${findings.join('; ')}`,
      fix: CLEAN_FIX,
    });
  };
  if (!bytes) return [];
  if (image.mime !== 'image/png') return fail([`is ${image.mime}: only PNG inputs can be checked`]);
  let png: { data: Uint8Array; width: number; height: number } | null = null;
  try {
    png = decodePng(bytes, (cause) => {
      throw new Ts23dError('T3D_NEURAL_INPUT', {
        cause: `${where}: ${cause}`,
        fix: 'pass an 8-bit PNG',
      });
    });
  } catch (e) {
    if (!(e instanceof Ts23dError)) throw e;
    return fail([e.message]);
  }
  const { findings } = checkInputImage(png.data, png.width, png.height);
  return findings.length ? fail(findings.map((f) => `${f.rule}: ${f.message}`)) : [];
}

/** Rounds of compile → fill: an output can name the next request's input (image → mesh). */
const ROUNDS = 4;

export async function neuralRun(
  file: string,
  config: LoadedConfig,
  requireNeural: boolean,
  o: { readonly allowBadInput?: boolean } = {},
): Promise<NeuralRunResult> {
  const { recipe, dir } = neuralDirOf(file);
  const assets = await loadAssets(file);
  const filledBy = new Map<string, NeuralFilled>();
  const notices: string[] = [];
  let missing: { message: string; fix: string }[] = [];
  for (let round = 0; round < ROUNDS; round++) {
    const cache = neuralCache({ recipe, entries: await loadNeuralEntries(dir) });
    // Requests already answered by the committed cache: reported as `=` lines, so a full hit does
    // not read as "asks for nothing".
    const counted: RecipeNeuralCache = {
      ...cache,
      get: (task, request, ask) => {
        const r = cache.get(task, request, ask);
        const entry = r.fallback
          ? undefined
          : cache.entries().find((e) => e.record.key === r.record.key);
        if (entry && !filledBy.has(entry.record.key))
          filledBy.set(entry.record.key, filledOf(entry, `${dir}/${entry.record.key}`, true));
        return r;
      },
    };
    provideNeural(
      counted,
      assets.map((a) => a.name),
    );
    for (const a of assets) for (const lod of LODS) compile(a, { lod });
    missing = [];
    cache.misses().forEach((job, i) => {
      if (!config.neural.has(job.task)) {
        const n = cache.notices()[i];
        if (n) missing.push({ message: n.message, fix: n.fix });
      }
    });
    let fresh = 0;
    for (const job of cache.misses()) {
      const b = config.neural.get(job.task);
      if (!b) continue;
      const overrides = checkMeshInputs(recipe, job, o.allowBadInput);
      notices.push(...overrides);
      const model = job.model ?? b.model;
      const filled = await cache.fill(b.adapter, model ? { ...job, model } : job);
      const { cached } = filled;
      // An allowed bad input is part of the output's history: record.json says so.
      const entry =
        overrides.length && !cached
          ? { ...filled.entry, record: { ...filled.entry.record, overrides } }
          : filled.entry;
      const at = cached ? `${dir}/${entry.record.key}` : await saveNeuralEntry(dir, entry);
      if (!cached) fresh++;
      filledBy.set(entry.record.key, filledOf(entry, at, cached));
    }
    if (fresh === 0) break;
  }
  const filled = [...filledBy.values()];
  if (requireNeural && missing.length > 0)
    throw new Ts23dError('T3D_NEURAL_MISSING', {
      cause: `${recipe}: ${missing.length} neural request(s) have no output and no adapter`,
      fix: missing[0]?.fix ?? 'configure the adapters in t3d.config.ts',
    });
  return { file, recipe, filled, missing, notices };
}

/** `t3d neural <ls|run> [files…]`: prints, returns the exit code. */
export async function neuralMain(
  positional: readonly string[],
  o: {
    readonly json: boolean;
    readonly requireNeural: boolean;
    readonly config?: LoadedConfig;
    /** Send `mesh` images that fail the input-image rules anyway (recorded in record.json). */
    readonly allowBadInput?: boolean;
  },
): Promise<number> {
  const [sub, ...files] = positional;
  try {
    const config = o.config ?? (await loadConfig());
    const require = o.requireNeural || config.requireNeural;
    if (sub === 'ls') {
      const models = await neuralLs(config);
      if (o.json) envelope(true, { models });
      else if (models.length === 0) console.log('no neural adapters configured (t3d.config.ts)');
      else
        for (const m of models)
          console.log(
            `${m.task.padEnd(8)}${m.adapter}  ${m.id}${m.pinned ? ' (pinned)' : ''}  licence: ${m.licence}${m.vramGb === undefined ? '' : `  ${m.vramGb} GB`}${m.cost === undefined ? '' : `  cost ${m.cost}`}`,
          );
      return 0;
    }
    if (sub !== 'run' || files.length === 0)
      throw new Ts23dError('T3D_CLI_USAGE', {
        cause: `t3d neural ${sub ?? ''} is not a neural command`,
        fix: 'use `t3d neural ls` or `t3d neural run <recipe.ts…> [--require-neural] [--allow-bad-input]`',
      });
    const runs: NeuralRunResult[] = [];
    for (const f of files)
      runs.push(await neuralRun(f, config, require, { allowBadInput: o.allowBadInput === true }));
    if (o.json) envelope(true, { runs });
    else
      for (const r of runs) {
        for (const f of r.filled)
          console.log(
            `${f.cached ? '=' : '+'} ${r.recipe} ${f.task} ${f.model} → ${f.dir}${f.warning ? `\n  ! ${f.warning}` : ''}`,
          );
        for (const n of r.notices) console.log(`notice: ${n}`);
        for (const m of r.missing) console.log(`T3D_NEURAL_MISSING: ${m.message}\n  fix: ${m.fix}`);
        if (r.filled.length === 0 && r.missing.length === 0)
          console.log(`${r.recipe}: asks for no neural outputs`);
      }
    return 0;
  } catch (e) {
    if (e instanceof Ts23dError) return printError(e, o.json);
    throw e;
  }
}
