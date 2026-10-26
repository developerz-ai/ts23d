// Guard: no ambient entropy in library or recipe code. Same source + seed must give the same
// bytes, so Math.random, clocks and locale-dependent formatting are refused outright.

import { report, tsFiles, type Violation } from './lib/files.ts';

const BANNED: readonly { re: RegExp; what: string; fix: string }[] = [
  { re: /Math\.random\s*\(/, what: 'Math.random()', fix: 'use ctx.rng or createRng(seed)' },
  {
    re: /Date\.now\s*\(|new Date\s*\(/,
    what: 'wall-clock time',
    fix: 'pass a seed or a value in; assets must not depend on when they were built',
  },
  {
    re: /performance\.now\s*\(/,
    what: 'performance.now()',
    fix: 'timing belongs in scripts/, not in geometry',
  },
  {
    re: /toLocale\w*String\s*\(/,
    what: 'locale formatting',
    fix: 'format explicitly (toFixed) — locale changes bytes',
  },
];

export function checkSource(file: string, source: string): Violation[] {
  const out: Violation[] = [];
  source.split('\n').forEach((text, i) => {
    if (text.trimStart().startsWith('//')) return;
    for (const b of BANNED)
      if (b.re.test(text))
        out.push({ file, line: i + 1, message: `${b.what} breaks determinism`, fix: b.fix });
  });
  return out;
}

if (import.meta.main) {
  const files = [...(await tsFiles('src')), ...(await tsFiles('recipes'))].filter(
    (f) => !f.endsWith('.test.ts') && !f.startsWith('src/cli/'),
  );
  const violations = (
    await Promise.all(files.map(async (f) => checkSource(f, await Bun.file(f).text())))
  ).flat();
  process.exitCode = report('determinism', violations, process.argv.includes('--json'));
}
