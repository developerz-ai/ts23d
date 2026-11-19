// Guard: imports inside src/ only go DOWN the tier table (scripts/lib/tiers.ts). Also refuses
// cross-module deep imports — another module is reached only through its index.ts. Only code is
// read: an import written in a comment or quoted in a message string is not an import.

import { posix } from 'node:path';
import { report, tsFiles, type Violation } from './lib/files.ts';
import { ROOT_TIER, TIERS } from './lib/tiers.ts';

const ROOT = 'src/index.ts';
/**
 * Deep imports allowed by name, each with its reason. `cli` is the binary's entry point and has no
 * index.ts to re-export through; the root barrel publishes the manifest type and reader from it.
 */
const DEEP_ALLOWED: ReadonlySet<string> = new Set(['src/index.ts -> src/cli/manifest.ts']);
// Every relative specifier in the file, wherever the statement wraps: `… from '…'` (import and
// re-export), `import('…')` and the side-effect `import '…'`, in either quote style.
const IMPORT = /\b(?:from|import)\s*\(?\s*(?:'(\.[^'\n]*)'|"(\.[^"\n]*)")/g;
/** The code so far ends where a module specifier goes: after `from`, `import` or `import(`. */
const SPECIFIER = /\b(?:from|import)\s*\(?$/;
/** The code so far ends where a `/` opens a regex literal, not a division. */
const REGEX_AHEAD = /(?:^|[(,=:[!&|?{};+\-*%<>~^]|\b(?:return|typeof|case|of|in))$/;
const blank = (text: string): string => text.replace(/[^\n]/g, ' ');

/**
 * `source` with comments, regex literals, template text and every string that is not a module
 * specifier blanked: same length and line breaks, so a match's offset is still its line.
 */
export function codeOnly(source: string): string {
  const end = source.length;
  let out = '';
  let i = 0;
  let depth = 0;
  // Brace depth at each open `${`: the `}` back at that depth resumes the template's text.
  const templates: number[] = [];
  const tail = (): string => out.trimEnd().slice(-12);
  /** Copy to `to` (clamped), blanked or as written. */
  const take = (to: number, keep = false): void => {
    const text = source.slice(i, Math.min(to, end));
    out += keep ? text : blank(text);
    i += text.length;
  };
  /** The index after the run that starts at `from` and stops before `stop`, escapes skipped. */
  const run = (from: number, stop: (j: number) => boolean): number => {
    let j = from;
    while (j < end && !stop(j)) j += source[j] === '\\' ? 2 : 1;
    return j;
  };
  const template = (): void => {
    take(run(i, (j) => source[j] === '`' || source.startsWith('${', j)));
    if (i >= end) return;
    // The closing backtick, or a `${` whose code runs to the `}` back at this depth.
    if (source[i] !== '`') templates.push(depth++);
    take(source[i] === '`' ? i + 1 : i + 2, true);
  };
  while (i < end) {
    const c = source[i];
    if (source.startsWith('//', i)) take(run(i, (j) => source[j] === '\n'));
    else if (source.startsWith('/*', i)) {
      const close = source.indexOf('*/', i + 2);
      take(close < 0 ? end : close + 2);
    } else if (c === "'" || c === '"') {
      // An unclosed quote ends with its line, so one stray quote cannot hide the rest of a file.
      const close = run(i + 1, (j) => source[j] === c || source[j] === '\n');
      take(source[close] === c ? close + 1 : close, SPECIFIER.test(tail()));
    } else if (c === '`') {
      take(i + 1, true);
      template();
    } else if (c === '}' && templates.at(-1) === depth - 1) {
      templates.pop();
      depth--;
      take(i + 1, true);
      template();
    } else if (c === '/' && REGEX_AHEAD.test(tail())) {
      let inClass = false;
      const close = run(i + 1, (j) => {
        if (source[j] === '[') inClass = true;
        else if (source[j] === ']') inClass = false;
        return source[j] === '\n' || (source[j] === '/' && !inClass);
      });
      take(close + 1);
    } else {
      if (c === '{') depth++;
      else if (c === '}') depth--;
      take(i + 1, true);
    }
  }
  return out;
}

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
  const code = codeOnly(source);
  for (const m of code.matchAll(IMPORT)) {
    const spec = m[1] ?? m[2] ?? '';
    // Where the specifier lands, so a file in a nested folder is judged by its real target.
    const resolved = posix.join(posix.dirname(file), spec);
    const line = code.slice(0, m.index).split('\n').length;
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
