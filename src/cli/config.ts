// t3d.config.ts: the project's model choices, in TypeScript like a recipe (ADR 015). It names one
// adapter per neural task and optional defaults:
//   import { defineConfig, http } from '@developerz.ai/ts23d';
//   export const config = defineConfig({ neural: { mesh: http('http://gpu:8190', 'pixal3d') } });
// Absent file = no adapters (every neural request falls back to the CPU path). A file that throws
// is T3D_RECIPE_THREW; a malformed `config` is T3D_NEURAL_FAILED naming the field.

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isNeuralTask, type NeuralTask, Ts23dError } from '../core/index.ts';
import type { NeuralAdapter, NeuralBinding, T3dConfig } from '../neural/index.ts';

export const CONFIG_FILE = 't3d.config.ts';

export interface ResolvedBinding {
  readonly adapter: NeuralAdapter;
  readonly model?: string;
}

export interface LoadedConfig {
  /** Where it came from; undefined when there is no config file. */
  readonly file?: string;
  readonly neural: ReadonlyMap<NeuralTask, ResolvedBinding>;
  readonly requireNeural: boolean;
}

const bad = (file: string, cause: string): never => {
  throw new Ts23dError('T3D_NEURAL_FAILED', {
    cause: `${file}: ${cause}`,
    fix: "export const config = defineConfig({ neural: { image: http('http://127.0.0.1:8190') } })",
  });
};

const isAdapter = (v: unknown): v is NeuralAdapter => {
  const a = v as Partial<NeuralAdapter> | null;
  return (
    typeof a?.id === 'string' &&
    Array.isArray(a.tasks) &&
    typeof a.models === 'function' &&
    typeof a.run === 'function'
  );
};

function binding(file: string, task: NeuralTask, v: NeuralBinding | undefined): ResolvedBinding {
  const b = (isAdapter(v) ? { adapter: v } : v) as
    | { adapter?: unknown; model?: unknown }
    | undefined;
  if (!isAdapter(b?.adapter))
    return bad(
      file,
      `neural.${task} is not an adapter (use http(…), comfyAdapter(…), mockAdapter())`,
    );
  if (b.model !== undefined && typeof b.model !== 'string')
    bad(file, `neural.${task}.model must be a model id string`);
  if (!b.adapter.tasks.includes(task))
    bad(file, `neural.${task}: ${b.adapter.id} does not run '${task}'`);
  return { adapter: b.adapter, ...(typeof b.model === 'string' ? { model: b.model } : {}) };
}

/** Check a config object (from a file or a test). */
export function resolveConfig(c: unknown, file = CONFIG_FILE): LoadedConfig {
  const cfg = (c ?? {}) as T3dConfig;
  if (typeof cfg !== 'object') bad(file, '`config` is not an object');
  const neural = new Map<NeuralTask, ResolvedBinding>();
  for (const [task, v] of Object.entries(cfg.neural ?? {})) {
    if (!isNeuralTask(task))
      bad(file, `neural.${task} is not a task (image, mesh, texture, rig, motion, hair, score)`);
    neural.set(task as NeuralTask, binding(file, task as NeuralTask, v));
  }
  if (cfg.requireNeural !== undefined && typeof cfg.requireNeural !== 'boolean')
    bad(file, 'requireNeural must be true or false');
  return { file, neural, requireNeural: cfg.requireNeural === true };
}

/** Load `<dir>/t3d.config.ts` (named export `config`); none = no adapters. */
export async function loadConfig(dir = process.cwd()): Promise<LoadedConfig> {
  const file = resolve(join(dir, CONFIG_FILE));
  if (!existsSync(file)) return { neural: new Map(), requireNeural: false };
  let mod: Record<string, unknown>;
  try {
    mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
  } catch (e) {
    if (e instanceof Ts23dError) throw e;
    throw new Ts23dError('T3D_RECIPE_THREW', {
      cause: `${CONFIG_FILE} failed to load: ${e instanceof Error ? e.message : String(e)}`,
      fix: `fix ${file} so it imports and runs (bun ${CONFIG_FILE})`,
    });
  }
  if (!('config' in mod)) bad(file, 'has no named export `config`');
  return resolveConfig(mod['config'], file);
}
