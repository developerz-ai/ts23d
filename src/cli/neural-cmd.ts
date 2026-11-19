// `t3d neural ls` lists the models every configured adapter offers (t3d.config.ts).
// `t3d neural run <recipe.ts…>` fills the recipe's committed cache: compiles every asset at LOD
// 0-2 against the cache already on disk (hits print as `=` lines), collects the requests that
// missed, runs each through the adapter configured for its task, validates, and writes
// recipes/<name>/neural/<key>/. Requests
// with no adapter stay missing (notice); with --require-neural any left missing is an error.
// A request fed by a local output that is not on this machine is never sent (neural-local.ts).
// Mesh input images pass the input-image rules first (neural-input.ts). Paid adapters (Meshy,
// Kubeez) are priced first: above 50 credits, or a job they cannot price, a run needs --yes-spend
// (neural-spend.ts). A chain longer than ROUNDS stops there and lists what it did not reach as
// missing. The only command that talks to a model; builds never do (ADR 014).

import { compile, isTs23dError, type Lod, type NeuralTask, Ts23dError } from '../core/index.ts';
import {
  type NeuralEntry,
  neuralCache,
  provideNeural,
  publishable,
  type RecipeNeuralCache,
} from '../neural/index.ts';
import { type LoadedConfig, loadConfig } from './config.ts';
import { loadAssets } from './load.ts';
import { checkMeshInputs } from './neural-input.ts';
import { absentInputNotice, absentInputs } from './neural-local.ts';
import { type SpendGuard, spendGuard } from './neural-spend.ts';
import { loadNeuralEntries, neuralDirOf, saveNeuralEntry } from './neural-store.ts';
import { queuedAdapter } from './queue/index.ts';
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
  /** A local output (`keep: 'local'`) whose file is not on this machine. */
  readonly absent?: true;
  readonly warning?: string;
}

export interface NeuralRunResult {
  readonly file: string;
  readonly recipe: string;
  readonly filled: readonly NeuralFilled[];
  readonly missing: readonly { readonly message: string; readonly fix: string }[];
  /** Input-image findings sent anyway under --allow-bad-input. */
  readonly notices: readonly string[];
  /** Estimated credits of the jobs sent to paid adapters (0 on a full cache hit). */
  readonly estimatedCredits: number;
}

const LODS: readonly Lod[] = [0, 1, 2];

function filledOf(entry: NeuralEntry, dir: string, cached: boolean): NeuralFilled {
  return {
    task: entry.record.task,
    key: entry.record.key,
    model: entry.record.model.id,
    dir,
    cached,
    ...(entry.outputs.some((x) => x.absent) ? { absent: true as const } : {}),
    ...(publishable(entry.record)
      ? {}
      : {
          warning: `licence '${entry.record.model.licence}' may not allow publishing outputs: this repository's recipes gate refuses them (ADR 015)`,
        }),
  };
}

/** Rounds of compile → fill: an output can name the next request's input. The longest chain is
 *  a model body's: image → mesh → Blender proxy → rig → Blender final (kinds `modelChain`). */
export const ROUNDS = 5;

export async function neuralRun(
  file: string,
  config: LoadedConfig,
  requireNeural: boolean,
  o: {
    readonly allowBadInput?: boolean;
    /** Allow a run estimated above SPEND_LIMIT credits. */
    readonly yesSpend?: boolean;
    /** Where estimate lines go before anything is sent. */
    readonly log?: (line: string) => void;
    /** One guard for a whole command: `neural run a.ts b.ts` has ONE limit, not one per file. */
    readonly spend?: SpendGuard;
  } = {},
): Promise<NeuralRunResult> {
  const { recipe, dir } = neuralDirOf(file);
  const assets = await loadAssets(file);
  const filledBy = new Map<string, NeuralFilled>();
  const notices: string[] = [];
  const spend =
    o.spend ?? spendGuard({ yesSpend: o.yesSpend === true, ...(o.log ? { log: o.log } : {}) });
  const spentBefore = spend.total();
  let missing: { message: string; fix: string }[] = [];
  let capped = 0;
  // ROUNDS fill rounds, plus one compile-only pass when the last round still filled something:
  // a request that only appears after it is listed as missing, never silently dropped.
  for (let round = 0; round <= ROUNDS; round++) {
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
    // A miss fed by a local output this machine does not hold has no bytes to send.
    const absent = cache.absentLocal();
    const jobs = cache.misses().filter((job, i) => {
      const shas = absentInputs(job, absent);
      const n = cache.notices()[i];
      if (shas.length) missing.push(absentInputNotice({ recipe, file, dir, job, shas, absent }));
      else if (!config.neural.has(job.task) && n) missing.push({ message: n.message, fix: n.fix });
      return shas.length === 0;
    });
    if (round === ROUNDS) {
      const late = jobs.filter((job) => config.neural.has(job.task));
      capped = late.length;
      for (const job of late)
        missing.push({
          message: `${recipe}: ${job.task} request not sent: it first appeared after ${ROUNDS} rounds of compile → fill (a longer chain than one run follows)`,
          fix: `run t3d neural run ${file} again: each run follows ${ROUNDS} more links`,
        });
      break;
    }
    await spend.check(
      recipe,
      jobs.flatMap((job) => {
        const b = config.neural.get(job.task);
        return b
          ? [{ job: b.model && !job.model ? { ...job, model: b.model } : job, adapter: b.adapter }]
          : [];
      }),
    );
    let fresh = 0;
    for (const job of jobs) {
      const b = config.neural.get(job.task);
      if (!b) continue;
      const overrides = checkMeshInputs(recipe, job, o.allowBadInput);
      notices.push(...overrides);
      const model = job.model ?? b.model;
      // One Blender, one local model at a time on this machine: a job that runs queues for it.
      const filled = await cache.fill(queuedAdapter(b.adapter), model ? { ...job, model } : job);
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
      cause: `${recipe}: ${missing.length} neural request(s) have no output and could not be sent${capped ? ` (${capped} first appeared after ${ROUNDS} rounds, the cap of one run)` : ''}`,
      fix: missing[0]?.fix ?? 'configure the adapters in t3d.config.ts',
    });
  return { file, recipe, filled, missing, notices, estimatedCredits: spend.total() - spentBefore };
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
    /** --yes-spend: allow a run estimated above 50 credits on paid adapters. */
    readonly yesSpend?: boolean;
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
        fix: 'use `t3d neural ls` or `t3d neural run <recipe.ts…> [--require-neural] [--allow-bad-input] [--yes-spend]`',
      });
    const runs: NeuralRunResult[] = [];
    const log = o.json ? {} : { log: (line: string) => console.log(line) };
    const spend = spendGuard({ yesSpend: o.yesSpend === true, ...log });
    for (const f of files)
      runs.push(
        await neuralRun(f, config, require, {
          allowBadInput: o.allowBadInput === true,
          yesSpend: o.yesSpend === true,
          spend,
          ...log,
        }),
      );
    if (o.json) envelope(true, { runs });
    else
      for (const r of runs) {
        for (const f of r.filled)
          console.log(
            `${f.cached ? '=' : '+'} ${r.recipe} ${f.task} ${f.model} → ${f.dir}${f.absent ? ' (local output, not on this machine)' : ''}${f.warning ? `\n  ! ${f.warning}` : ''}`,
          );
        for (const n of r.notices) console.log(`notice: ${n}`);
        for (const m of r.missing) console.log(`T3D_NEURAL_MISSING: ${m.message}\n  fix: ${m.fix}`);
        if (r.filled.length === 0 && r.missing.length === 0)
          console.log(`${r.recipe}: asks for no neural outputs`);
      }
    return 0;
  } catch (e) {
    if (isTs23dError(e)) return printError(e, o.json);
    throw e;
  }
}
