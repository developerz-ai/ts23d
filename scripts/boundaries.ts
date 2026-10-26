// Guard: imports inside src/ only go DOWN the tier table (scripts/lib/tiers.ts). Also refuses
// cross-module deep imports — another module is reached only through its index.ts.

import { report, tsFiles, type Violation } from './lib/files.ts';
import { ROOT_TIER, TIERS } from './lib/tiers.ts';

const IMPORT = /^\s*(?:import|export)[^'"]*from\s+'(\.[^']+)'/;

export function checkFile(file: string, source: string): Violation[] {
  const [, mod = ''] = file.split('/');
  const isRoot = file === 'src/index.ts';
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
  source.split('\n').forEach((text, i) => {
    const spec = IMPORT.exec(text)?.[1];
    if (!spec || spec.startsWith('./')) return;
    const target = isRoot ? spec.split('/')[1] : spec.split('/')[1];
    const targetTier = target ? TIERS[target] : undefined;
    if (targetTier === undefined) return;
    if (!spec.endsWith('/index.ts')) {
      out.push({
        file,
        line: i + 1,
        message: `deep import '${spec}'`,
        fix: `import from '../${target}/index.ts' and export what you need there`,
      });
    }
    if (targetTier >= tier) {
      out.push({
        file,
        line: i + 1,
        message: `'${mod || 'index'}' (tier ${tier}) imports '${target}' (tier ${targetTier})`,
        fix: 'imports only go down a tier: move the shared code lower, or invert the dependency',
      });
    }
  });
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
