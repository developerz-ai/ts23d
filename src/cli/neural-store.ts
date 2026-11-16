// The disk side of the recipe neural cache: recipes/<name>/neural/<key>/{output-<i>.*, record.json}
// beside the recipe file (ADR 014). Loading re-checks every record and file hash (committed bytes
// are untrusted); saving writes outputs first and record.json last, so a key directory without a
// record is ignored as unfinished. `provideRecipeNeural` is what a build calls before compiling.

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import {
  entryOf,
  type NeuralEntry,
  neuralCache,
  parseRecord,
  provideNeural,
  type RecipeNeuralCache,
  recordJson,
} from '../neural/index.ts';

const KEY = /^[0-9a-f]{64}$/;

/** `recipes/oak/oak.ts` → { recipe: 'oak', dir: 'recipes/oak/neural' }. */
export function neuralDirOf(recipeFile: string): { readonly recipe: string; readonly dir: string } {
  const abs = resolve(recipeFile);
  return { recipe: basename(abs).replace(/\.[cm]?[tj]s$/, ''), dir: join(dirname(abs), 'neural') };
}

/** Every finished, valid entry under `dir` (missing dir = none). */
export async function loadNeuralEntries(dir: string): Promise<NeuralEntry[]> {
  const keys = (await readdir(dir).catch(() => [] as string[])).filter((k) => KEY.test(k)).sort();
  const out: NeuralEntry[] = [];
  for (const key of keys) {
    const at = join(dir, key);
    const text = await readFile(join(at, 'record.json'), 'utf8').catch(() => undefined);
    if (text === undefined) continue;
    const record = parseRecord(text, join(at, 'record.json'));
    const files = new Map<string, Uint8Array>();
    for (const o of record.outputs) {
      const bytes = await readFile(join(at, o.file)).catch(() => undefined);
      if (bytes) files.set(o.file, new Uint8Array(bytes));
    }
    out.push(entryOf(record, files));
  }
  return out;
}

export async function saveNeuralEntry(dir: string, e: NeuralEntry): Promise<string> {
  const at = join(dir, e.record.key);
  await mkdir(at, { recursive: true });
  await Promise.all(
    e.record.outputs.map((o, i) =>
      writeFile(join(at, o.file), e.outputs[i]?.bytes ?? new Uint8Array()),
    ),
  );
  await writeFile(join(at, 'record.json'), recordJson(e.record));
  return at;
}

/** Load the recipe's committed cache and provide it to compiles of `assets` (offline). */
export async function provideRecipeNeural(
  recipeFile: string,
  assets: readonly string[],
  requireNeural: boolean,
): Promise<RecipeNeuralCache> {
  const { recipe, dir } = neuralDirOf(recipeFile);
  const cache = neuralCache({
    recipe,
    offline: true,
    requireNeural,
    entries: await loadNeuralEntries(dir),
  });
  provideNeural(cache, assets);
  return cache;
}
