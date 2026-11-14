// Builds the publishable package: JS per subpath into dist/ (Node + browser friendly ESM) and
// .d.ts via tsc. Bun users import src/ directly through the `bun` export condition.
// Source maps are written beside the JS without a `sourceMappingURL` comment: the package's
// `files` leaves them out, and a link to a file that does not ship only makes bundlers warn.

import { rm } from 'node:fs/promises';
import { TIERS } from './lib/tiers.ts';

const STATIC_SPECIFIER = /(from\s+(['"])\.{1,2}\/[^'"]+)\.ts\2/g;
const INLINE_IMPORT = /(import\(\s*(['"])\.{1,2}\/[^'"]+)\.ts\2(\s*\))/g;

/** tsc keeps `./x.ts` specifiers in .d.ts (static and inline `import("./x.ts")` types); published
 *  types must point at the emitted `.js`. */
export function rewriteDtsSpecifiers(text: string): string {
  return text
    .replace(STATIC_SPECIFIER, (_m, head: string, q: string) => `${head}.js${q}`)
    .replace(INLINE_IMPORT, (_m, head: string, q: string, tail: string) => `${head}.js${q}${tail}`);
}

async function build(): Promise<void> {
  await rm('dist', { recursive: true, force: true });
  const modules = Object.keys(TIERS).filter((m) => m !== 'cli');
  const entrypoints = [
    'src/index.ts',
    ...modules.map((m) => `src/${m}/index.ts`),
    'src/cli/bin.ts',
  ];
  const result = await Bun.build({
    entrypoints,
    outdir: 'dist',
    root: 'src',
    target: 'node',
    format: 'esm',
    splitting: true,
    sourcemap: 'external',
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
  for await (const f of new Bun.Glob('**/*.d.ts').scan({ cwd: 'dist' })) {
    const path = `dist/${f}`;
    await Bun.write(path, rewriteDtsSpecifiers(await Bun.file(path).text()));
  }
  console.log(`✔ build: ${result.outputs.length} files → dist/`);
}

if (import.meta.main) await build();
