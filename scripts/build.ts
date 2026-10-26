// Builds the publishable package: JS per subpath into dist/ (Node + browser friendly ESM) and
// .d.ts via tsc. Bun users import src/ directly through the `bun` export condition.

import { rm } from 'node:fs/promises';
import { TIERS } from './lib/tiers.ts';

await rm('dist', { recursive: true, force: true });
const modules = Object.keys(TIERS).filter((m) => m !== 'cli');
const entrypoints = ['src/index.ts', ...modules.map((m) => `src/${m}/index.ts`), 'src/cli/bin.ts'];
const result = await Bun.build({
  entrypoints,
  outdir: 'dist',
  root: 'src',
  target: 'node',
  format: 'esm',
  splitting: true,
  sourcemap: 'linked',
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
const tsc = Bun.spawnSync(['bunx', 'tsc', '-p', 'tsconfig.build.json'], {
  stdout: 'inherit',
  stderr: 'inherit',
});
if (tsc.exitCode !== 0) process.exit(tsc.exitCode ?? 1);
// tsc keeps `./x.ts` specifiers in .d.ts; published types must point at the emitted .js.
for await (const f of new Bun.Glob('**/*.d.ts').scan({ cwd: 'dist' })) {
  const path = `dist/${f}`;
  const text = await Bun.file(path).text();
  await Bun.write(path, text.replace(/(from\s+'\.{1,2}\/[^']+)\.ts'/g, "$1.js'"));
}
console.log(`✔ build: ${result.outputs.length} files → dist/`);
