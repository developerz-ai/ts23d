// Refresh every asset's committed outputs: recipes/<dir>/out/<asset>/{sheet.png, hero.png,
// manifest.json}. These are what GitHub shows next to each recipe; the recipes gate fails when a
// committed manifest no longer matches a fresh compile.
//   bun run shots                 every recipe folder
//   bun run shots t34 tiger_1     only these folders

import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { recipeFolders } from './lib/files.ts';

const only = process.argv.slice(2);
const run = async (cmd: string[]): Promise<void> => {
  const p = Bun.spawn(['bun', 'run', 'src/cli/bin.ts', ...cmd], {
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if ((await p.exited) !== 0) process.exit(1);
};

for (const { dir, file } of (await recipeFolders()).folders) {
  if (only.length && !only.some((o) => dir.endsWith(`/${o}`))) continue;
  const out = join(dir, 'out');
  // Drop outputs of assets the recipe no longer exports.
  await rm(out, { recursive: true, force: true });
  await run(['shot', file, '--out', out]);
  await run(['hero', file, '--out', out]);
  await rm(join(out, 'index.json'), { force: true });
  for (const f of await readdir(out)) if (f.startsWith('trim_sheet_')) await rm(join(out, f));
}
