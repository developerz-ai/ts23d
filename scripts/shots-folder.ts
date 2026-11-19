// One recipe folder's committed renders in ONE process: `t3d shot`, `hero` (path traced), `blueprint`
// and `icon` run in-process through the CLI's own `run()`, so the recipe and the library load once
// instead of four times. The output bytes are the four separate commands' bytes (same code path,
// same flags; on 2026-11-19 all 55 folders matched the four-process output). It saves only the
// imports (human_head 12 s each, most recipes about 1 s): each command still compiles the asset
// itself (human_head LOD0 about 55 s per command). Sharing one compile across the four commands
// needs a src/cli change: a per-process compile cache or one multi-output command.
// One process per folder, never one for every folder: recipes register materials globally and the
// painted trim sheet follows the registered set, so another recipe's materials would change pixels.
//   bun run scripts/shots-folder.ts recipes/t34/t34.ts recipes/t34/.out-tmp    (scripts/shots.ts runs it)

import { run } from '../src/cli/run.ts';
import { HERO_FLAGS } from './shots.ts';

/** Each render: a `t3d` command and its extra flags after `<file> --out <dir>`, in this order. */
export const RENDERS: readonly (readonly [string, ...string[]])[] = [
  ['shot'],
  ['hero', ...HERO_FLAGS],
  ['blueprint'],
  ['icon'],
];

/** The argv of every render of `file` into `out`. */
export const renderArgv = (file: string, out: string): string[][] =>
  RENDERS.map(([cmd, ...flags]) => [cmd, file, '--out', out, ...flags]);

/** Runs one `t3d` argv; resolves its exit code. */
export type Cli = (argv: readonly string[]) => Promise<number>;

/** Every render in order; stops at the first non-zero exit and returns it (0 when all passed). */
export async function renderFolder(file: string, out: string, cli: Cli = run): Promise<number> {
  for (const argv of renderArgv(file, out)) {
    const code = await cli(argv);
    if (code !== 0) return code;
  }
  return 0;
}

if (import.meta.main) {
  const [file, out] = process.argv.slice(2);
  if (!file || !out) {
    console.error(
      'usage: bun run scripts/shots-folder.ts <recipe.ts> <out dir>. fix: bun run shots <name>',
    );
    process.exit(2);
  }
  process.exitCode = await renderFolder(file, out);
}
