// Refresh every asset's committed outputs: recipes/<dir>/out/<asset>/{sheet.png, hero.png (path
// traced), blueprint.png, manifest.json}. These are what GitHub shows next to each recipe; the recipes
// gate fails when a committed manifest no longer matches a fresh compile.
//   bun run shots                 every recipe folder
//   bun run shots t34 tiger_1     only these folders
// Each folder renders into a sibling temp dir first and replaces out/ only when every step
// succeeded: a failure (a half-edited shared module) keeps the old outputs.

import { readdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { HERO_PATH } from '../src/render/index.ts';
import { keepCritiques } from './lib/critique.ts';
import { recipeFolders } from './lib/files.ts';
import { CURRENT_SHARD, inShard } from './lib/shard.ts';

/**
 * The committed hero is what critiques judge, so it is path traced (src/render/path/): 960 × 540
 * at 16 samples per pixel + denoise. Measured on 4 threads: wolf (138k tris) 6.7 s of tracing,
 * human_head 6 s, roadster_v10 (900k tris) 13 s; a 4-vCPU CI runner ≈ 1.5× that, which keeps
 * the 12-shard shots job under its 5-minute budget. Raise spp only with a fresh measurement.
 */
export const HERO_FLAGS: readonly string[] = [
  '--quality',
  'path',
  '--size',
  `${HERO_PATH.width}x${HERO_PATH.height}`,
  '--spp',
  String(HERO_PATH.spp),
];

/** Each refresh step: a `t3d` command and its extra flags after `<file> --out <tmp>`. */
const STEPS: readonly (readonly [string, ...string[]])[] = [
  ['shot'],
  ['hero', ...HERO_FLAGS],
  ['blueprint'],
  ['icon'],
];

/** Runs one `t3d` command; resolves true on exit 0. */
export type Runner = (cmd: readonly string[]) => Promise<boolean>;

const t3d: Runner = async (cmd) => {
  const p = Bun.spawn(['bun', 'run', 'src/cli/bin.ts', ...cmd], {
    stdout: 'inherit',
    stderr: 'inherit',
  });
  return (await p.exited) === 0;
};

/** Render one folder's outputs atomically: temp dir → out/ on success, old out/ kept on failure. */
export async function refresh(dir: string, file: string, run: Runner = t3d): Promise<boolean> {
  const out = join(dir, 'out');
  const tmp = join(dir, '.out-tmp');
  await rm(tmp, { recursive: true, force: true });
  for (const [cmd, ...flags] of STEPS) {
    if (!(await run([cmd, file, '--out', tmp, ...flags]))) {
      await rm(tmp, { recursive: true, force: true });
      return false;
    }
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
  for (const { dir, file } of inShard((await recipeFolders()).folders, CURRENT_SHARD)) {
    if (only.length && !only.some((o) => dir.endsWith(`/${o}`))) continue;
    if (!(await refresh(dir, file))) {
      failed++;
      console.error(`✘ ${dir}: render failed — kept the previous out/`);
    }
  }
  process.exitCode = failed ? 1 : 0;
}
