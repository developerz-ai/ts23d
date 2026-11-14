// Guard: no placeholder output. Agents elide code ("// ...", "rest of the code", "same as above")
// and it compiles, so a pattern list catches what review misses. Planned work uses notImplemented().

import { report, tsFiles, type Violation } from './lib/files.ts';

const FIX = 'write the real code, or throw notImplemented() and name the gap in the PR body';

const BANNED: readonly { re: RegExp; what: string }[] = [
  { re: /(\/\/|\/\*)\s*(\.\.\.|…)/, what: 'elided code comment' },
  { re: /rest of (the )?(code|file|implementation)/i, what: '"rest of the code" placeholder' },
  { re: /\b(implement|add) (this|logic|here|me)\b/i, what: '"implement here" placeholder' },
  {
    re: /\b(similar(ly)?|same) (to |for |as |pattern as )?(above|(the )?(rest|remaining))\b/i,
    what: '"same as above" elision',
  },
  { re: /TODO:?\s*implement/i, what: 'TODO stub' },
  { re: /for brevity/i, what: '"for brevity" elision' },
];

export function checkSource(file: string, source: string): Violation[] {
  const out: Violation[] = [];
  source.split('\n').forEach((text, i) => {
    for (const b of BANNED)
      if (b.re.test(text)) out.push({ file, line: i + 1, message: b.what, fix: FIX });
  });
  return out;
}

/** The guard and its test carry the patterns as fixtures. */
const SELF = new Set(['scripts/placeholders.ts', 'scripts/placeholders.test.ts']);

if (import.meta.main) {
  const roots = ['src', 'scripts', 'recipes', 'examples', 'apps/site/src'];
  const files = (await Promise.all(roots.map((r) => tsFiles(r))))
    .flat()
    .filter((f) => !SELF.has(f));
  const violations = (
    await Promise.all(files.map(async (f) => checkSource(f, await Bun.file(f).text())))
  ).flat();
  process.exitCode = report('placeholders', violations, process.argv.includes('--json'));
}
