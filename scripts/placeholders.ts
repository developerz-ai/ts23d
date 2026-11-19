// Guard: no placeholder output. Agents elide code ("// ...", "rest of the code", "same as above")
// and it compiles, so a pattern list catches what review misses. Planned work uses notImplemented().

import { report, tsFiles, type Violation } from './lib/files.ts';

const FIX = 'write the real code, or throw notImplemented() and name the gap in the PR body';

const DOTS = String.raw`(?:\.\.\.|…)`;

const BANNED: readonly { re: RegExp; what: string }[] = [
  // An ellipsis comment stands in for code, bare (`// ...`, `/* … */`) or wrapped round a label
  // (`// ... existing code ...`); `// …and then` continuing prose does not.
  {
    re: new RegExp(
      String.raw`\/\/\s*${DOTS}\s*$|\/\/\s*${DOTS}.*${DOTS}\s*$|\/\*\s*${DOTS}(?:.*${DOTS})?\s*\*\/`,
    ),
    what: 'elided code comment',
  },
  // The whole comment, so prose that merely mentions existing code or an unchanged value passes.
  {
    re: new RegExp(
      String.raw`(?:\/\/|\/\*)\s*(?:${DOTS}\s*)?(?:(?:the |all )?existing (?:code|logic|methods|functions|imports|implementation)(?: (?:here|unchanged|stays|remains|as is))?|unchanged)\s*(?:${DOTS})?\s*(?:\*\/\s*)?$`,
      'i',
    ),
    what: '"existing code" elision',
  },
  { re: /rest of (the )?(code|file|implementation)/i, what: '"rest of the code" placeholder' },
  {
    re: /\brest of (the )?\w+ (stays|remains|is|are) (the same|unchanged|as (is|before))|\brest of (the )?\w+ (unchanged|omitted)\b/i,
    what: '"rest stays the same" elision',
  },
  { re: /\bremaining\b[^.;]*\bomitted\b/i, what: '"remaining omitted" elision' },
  { re: /\b(implement|add) (this|logic|here|me)\b/i, what: '"implement here" placeholder' },
  {
    re: /\b(similar(ly)?|same) (to |for |as |pattern as )?(above|(the )?(rest|remaining))\b/i,
    what: '"same as above" elision',
  },
  { re: /TODO:?\s*(implement|fill|write)\b/i, what: 'TODO stub' },
  { re: /for brevity/i, what: '"for brevity" elision' },
];

export function checkSource(file: string, source: string): Violation[] {
  const out: Violation[] = [];
  source.split('\n').forEach((text, i) => {
    // One finding a line: the first pattern names it.
    const hit = BANNED.find((b) => b.re.test(text));
    if (hit) out.push({ file, line: i + 1, message: hit.what, fix: FIX });
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
