// The disk side of the recipe neural cache: recipes/<name>/neural/<key>/{output-<i>.*, record.json}
// beside the recipe file (ADR 014). Loading re-checks every record and file hash (committed bytes
// are untrusted); saving writes outputs first and record.json last, so a key directory without a
// record is ignored as unfinished. `provideRecipeNeural` is what a build calls before compiling.
// Local outputs (`local-<i>.*`, kept off git) are read only by `t3d neural run`, which sends them
// to the next request; a build never reads them, so it is the same build on every machine.

import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
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

/** `neural/.gitignore`, written with the first local output: no key's local files reach git. */
export const LOCAL_GITIGNORE =
  '# local neural outputs: kept on the machine that made them (ADR 014); record.json has the hash\n*/local-*\n';

/** `recipes/oak/oak.ts` → { recipe: 'oak', dir: 'recipes/oak/neural' }. */
export function neuralDirOf(recipeFile: string): { readonly recipe: string; readonly dir: string } {
  const abs = resolve(recipeFile);
  return { recipe: basename(abs).replace(/\.[cm]?[tj]s$/, ''), dir: join(dirname(abs), 'neural') };
}

/**
 * Every finished, valid entry under `dir` (missing dir = none). `local: false` leaves local
 * output files unread: their outputs are `absent`, as on a machine that never had them.
 */
export async function loadNeuralEntries(
  dir: string,
  o: { readonly local?: boolean } = {},
): Promise<NeuralEntry[]> {
  const keys = (await readdir(dir).catch(() => [] as string[])).filter((k) => KEY.test(k)).sort();
  const out: NeuralEntry[] = [];
  for (const key of keys) {
    const at = join(dir, key);
    const text = await readFile(join(at, 'record.json'), 'utf8').catch(() => undefined);
    if (text === undefined) continue;
    const record = parseRecord(text, join(at, 'record.json'));
    const files = new Map<string, Uint8Array>();
    for (const out of record.outputs) {
      if (out.local && o.local === false) continue;
      const bytes = await readFile(join(at, out.file)).catch(() => undefined);
      if (bytes) files.set(out.file, new Uint8Array(bytes));
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
  if (e.record.outputs.some((o) => o.local)) await ignoreLocal(dir);
  await writeFile(join(at, 'record.json'), recordJson(e.record));
  return at;
}

/** `neural/.gitignore` ignores `local-*`; rules a user already wrote there are kept. */
async function ignoreLocal(dir: string): Promise<void> {
  const file = join(dir, '.gitignore');
  const had = await readFile(file, 'utf8').catch(() => '');
  if (had.split('\n').some((l) => l.trim() === '*/local-*')) return;
  await writeFile(
    file,
    had === '' ? LOCAL_GITIGNORE : `${had.replace(/\n*$/, '\n')}${LOCAL_GITIGNORE}`,
  );
}

const INSTALLED = '/node_modules/@developerz.ai/ts23d/';

/**
 * The fix of a miss for a recipe inside an installed package with no `neural/` folder: the npm
 * package ships recipes without their model outputs, so "run it, then commit" is the wrong advice.
 */
async function installedFix(recipe: string, dir: string): Promise<string | undefined> {
  if (!dir.replaceAll('\\', '/').includes(INSTALLED)) return undefined;
  if (await stat(dir).catch(() => undefined)) return undefined;
  return `the npm package does not ship model outputs (they stay in git): clone https://github.com/developerz-ai/ts23d and build recipes/${recipe}/${recipe}.ts there, or copy the recipe folder into your project and run \`t3d neural run <copy>/${recipe}.ts\` on a machine with the adapters its README names`;
}

/** Load the recipe's committed cache and provide it to compiles of `assets` (offline). */
export async function provideRecipeNeural(
  recipeFile: string,
  assets: readonly string[],
  requireNeural: boolean,
): Promise<RecipeNeuralCache> {
  const { recipe, dir } = neuralDirOf(recipeFile);
  const missingFix = await installedFix(recipe, dir);
  const cache = neuralCache({
    recipe,
    offline: true,
    requireNeural,
    ...(missingFix ? { missingFix } : {}),
    entries: await loadNeuralEntries(dir, { local: false }),
  });
  provideNeural(cache, assets);
  return cache;
}
