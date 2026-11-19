// Guard: imports inside src/ only go DOWN the tier table (scripts/lib/tiers.ts). Also refuses
// cross-module deep imports — another module is reached only through its index.ts.

import { posix } from 'node:path';
import { report, tsFiles, type Violation } from './lib/files.ts';
import { ROOT_TIER, TIERS } from './lib/tiers.ts';

const ROOT = 'src/index.ts';
// Every relative specifier in the file, wherever the statement wraps: `… from '…'` (import and
// re-export), `import('…')` and the side-effect `import '…'`, in either quote style.
/**
 * Deep imports allowed by name, each with its reason. `cli` is the binary's entry point and has no
 * index.ts to re-export through; the root barrel publishes the manifest type and reader from it.
 */
const DEEP_ALLOWED: ReadonlySet<string> = new Set(['src/index.ts -> src/cli/manifest.ts']);
const IMPORT = /\b(?:from|import)\s*\(?\s*(?:'(\.[^'\n]*)'|"(\.[^"\n]*)")/g;

export function checkFile(file: string, source: string): Violation[] {
  const [, mod = ''] = file.split('/');
  const isRoot = file === ROOT;
  const tier = isRoot ? ROOT_TIER : TIERS[mod];
  if (tier === undefined) {
    return [
      {
        file,
        line: 1,
        message: `module '${mod}' has no tier`,
        fix: `add it to scripts/lib/tiers.ts and docs/architecture/README.md`,
      },
    ];
  }
  const out: Violation[] = [];
  const up = 'imports only go down a tier: move the shared code lower, or invert the dependency';
  for (const m of source.matchAll(IMPORT)) {
    const spec = m[1] ?? m[2] ?? '';
    // Where the specifier lands, so a file in a nested folder is judged by its real target.
    const resolved = posix.join(posix.dirname(file), spec);
    const line = source.slice(0, m.index).split('\n').length;
    if (resolved === ROOT) {
      if (!isRoot)
        out.push({ file, line, message: `'${mod}' imports the root barrel '${spec}'`, fix: up });
      continue;
    }
    const [top, target = ''] = resolved.split('/');
    const targetTier = top === 'src' ? TIERS[target] : undefined;
    if (targetTier === undefined || (!isRoot && target === mod)) continue;
    if (resolved !== `src/${target}/index.ts` && !DEEP_ALLOWED.has(`${file} -> ${resolved}`)) {
      const index = posix.relative(posix.dirname(file), `src/${target}/index.ts`);
      out.push({
        file,
        line,
        message: `deep import '${spec}'`,
        fix: `import from '${index.startsWith('.') ? index : `./${index}`}' and export what you need there`,
      });
    }
    if (targetTier >= tier) {
      out.push({
        file,
        line,
        message: `'${mod}' (tier ${tier}) imports '${target}' (tier ${targetTier})`,
        fix: up,
      });
    }
  }
  return out;
}

if (import.meta.main) {
  // Tests aren't shipped and may use any tier to build fixtures; src/types holds ambient
  // declarations, not a module.
  const files = (await tsFiles('src')).filter(
    (f) => !f.endsWith('.test.ts') && !f.startsWith('src/types/'),
  );
  const violations = (
    await Promise.all(files.map(async (f) => checkFile(f, await Bun.file(f).text())))
  ).flat();
  process.exitCode = report('boundaries', violations, process.argv.includes('--json'));
}
