// Refresh every asset's committed outputs: recipes/<dir>/out/<asset>/{sheet.png, hero.png (path
// traced), blueprint.png, manifest.json}. These are what GitHub shows next to each recipe; the recipes
// gate fails when a committed manifest no longer matches a fresh compile.
//   bun run shots                 every recipe folder
//   bun run shots t34 tiger_1     only these folders
// Each folder renders into a sibling temp dir first and replaces out/ only when every step
// succeeded: a failure (a half-edited shared module) keeps the old outputs. One `bun` process per
// folder (scripts/shots-folder.ts) runs all four renders from a single import of the recipe and
// one compile per asset and LOD.
// T3D_SHARD=k/n renders only this shard's folders (scripts/lib/shard.ts, balanced by measured cost).

import { readdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { HERO_PATH } from '../src/render/index.ts';
import { keepCritiques } from './lib/critique.ts';
import { recipeFolders, tsFiles } from './lib/files.ts';
import { CURRENT_SHARD, recipeShard } from './lib/shard.ts';
import { sharedRecipeTests } from './recipes.ts';

/**
 * The committed hero is what critiques judge, so it is path traced (src/render/path/): 960 × 540
 * at 16 samples per pixel + denoise. Measured on 4 threads: wolf (138k tris) 6.7 s of tracing,
 * human_head 6 s, roadster_v10 (900k tris) 13 s; a 4-vCPU CI runner ≈ 1.5× that. Tracing was never
 * what made the shots job slow: each of the four renders used to compile the asset again (CI run
 * 44460876935: human_head 436 s for its four renders); they now share one compile
 * (src/cli/compile-cache.ts). Raise spp only with a fresh measurement.
 */
export const HERO_FLAGS: readonly string[] = [
  '--quality',
  'path',
  '--size',
  `${HERO_PATH.width}x${HERO_PATH.height}`,
  '--spp',
  String(HERO_PATH.spp),
];

/** Renders every output of `file` into `tmp`; resolves true when all of them succeeded. */
export type Runner = (file: string, tmp: string) => Promise<boolean>;

const oneProcess: Runner = async (file, tmp) => {
  const p = Bun.spawn(['bun', 'run', 'scripts/shots-folder.ts', file, tmp], {
    stdout: 'inherit',
    stderr: 'inherit',
    env: process.env,
  });
  return (await p.exited) === 0;
};

/** Render one folder's outputs atomically: temp dir → out/ on success, old out/ kept on failure. */
export async function refresh(
  dir: string,
  file: string,
  run: Runner = oneProcess,
): Promise<boolean> {
  const out = join(dir, 'out');
  const tmp = join(dir, '.out-tmp');
  await rm(tmp, { recursive: true, force: true });
  if (!(await run(file, tmp))) {
    await rm(tmp, { recursive: true, force: true });
    return false;
  }
  await rm(join(tmp, 'index.json'), { force: true });
  for (const f of await readdir(tmp)) if (f.startsWith('trim_sheet_')) await rm(join(tmp, f));
  // Committed critiques survive a refresh (the gate then judges whether they're stale).
  await keepCritiques(out, tmp);
  // Drops outputs of assets the recipe no longer exports.
  await rm(out, { recursive: true, force: true });
  await rename(tmp, out);
  return true;
}

if (import.meta.main) {
  const only = process.argv.slice(2);
  let failed = 0;
  // The split the recipes gate computes too; this shard renders its `shots` units.
  const shared = sharedRecipeTests(await tsFiles('recipes'));
  const { shots } = recipeShard((await recipeFolders()).folders, shared, CURRENT_SHARD);
  for (const { dir, file } of shots) {
    if (only.length && !only.some((o) => dir.endsWith(`/${o}`))) continue;
    const t0 = Bun.nanoseconds();
    const ok = await refresh(dir, file);
    const s = ((Bun.nanoseconds() - t0) / 1e9).toFixed(1);
    if (ok) console.log(`✔ ${dir} ${s}s`);
    else {
      failed++;
      console.error(`✘ ${dir}: render failed after ${s}s — kept the previous out/`);
    }
  }
  process.exitCode = failed ? 1 : 0;
}
