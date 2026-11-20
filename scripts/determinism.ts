// Guard: no ambient entropy in library or recipe code. Same source + seed must give the same
// bytes, so Math.random, clocks and locale-dependent formatting are refused outright. So is the
// platform's libm (Math.sin, Math.exp, Math.hypot, `**` …) in everything that can reach an asset,
// a render or a shipped number (src/, recipes/, the gallery, examples; tests too): its last bit
// differs between CPUs and C library versions. `dmath` from src/core is the same bits everywhere.

import { report, tsFiles, type Violation } from './lib/files.ts';

/**
 * Code that never reaches an asset's bytes and needs a clock or a token: a path (a folder ends in
 * `/`) and why it is exempt from the entropy rules. Everything else under src/ and recipes/ is
 * checked; the libm rules have their own, shorter list (LIBM_ALLOWED).
 */
export const ALLOWED: readonly { path: string; why: string }[] = [
  { path: 'src/cli/', why: 'the CLI times builds and stamps reports; it emits no geometry' },
  {
    path: 'src/neural/blender-session-process.ts',
    why: 'session lock tokens and stop deadlines identify a live Blender process, not an asset',
  },
  {
    path: 'src/neural/wire.ts',
    why: 'HTTP retry budgets and Retry-After waits read the wall clock; no asset byte depends on it',
  },
];

export const isAllowed = (file: string): boolean =>
  ALLOWED.some((a) => (a.path.endsWith('/') ? file.startsWith(a.path) : file === a.path));

const BANNED: readonly { re: RegExp; what: string; fix: string }[] = [
  {
    // Also the spellings that dodge a plain search: an alias (`= Math.random`), Math['random']
    // and `const { random } = Math`.
    re: /\bMath\s*\.\s*random\s*\(|=\s*Math\s*\.\s*random\b|\bMath\s*\[\s*['"`]random['"`]\s*\]|\{[^}]*\brandom\b[^}]*\}\s*=\s*Math\b/,
    what: 'Math.random()',
    fix: 'use ctx.rng or createRng(seed)',
  },
  {
    re: /\bcrypto\s*\.\s*(?:getRandomValues|randomUUID|randomBytes|randomInt)\b|\b(?:randomUUID|randomBytes)\s*\(/,
    what: 'crypto randomness',
    fix: 'use ctx.rng or createRng(seed); derive ids from the content, not from entropy',
  },
  {
    // `Date()` without `new` returns the current time as a string.
    re: /\bDate\s*\.\s*now\b|\bnew\s+Date\b|(?<![\w.$])Date\s*\(/,
    what: 'wall-clock time',
    fix: 'pass a seed or a value in; assets must not depend on when they were built',
  },
  {
    re: /\bperformance\s*\.\s*now\b|\bprocess\s*\.\s*hrtime\b/,
    what: 'a timer (performance.now, process.hrtime)',
    fix: 'timing belongs in scripts/, not in geometry',
  },
  {
    re: /toLocale\w*\s*\(|\.\s*localeCompare\s*\(|\bIntl\s*\./,
    what: 'locale formatting or ordering',
    fix: 'format explicitly (toFixed) and order by code unit (a < b ? -1 : a > b ? 1 : 0): locale changes bytes',
  },
  {
    // Compressed bytes are whatever zlib the runtime ships, and Node's and Bun's differ (PNG bytes
    // once differed by runtime). Inflating is safe: the format fixes the output.
    re: /\b(?:deflateSync|deflateRawSync|gzipSync|brotliCompressSync|zstdCompressSync)\b/,
    what: "the runtime's compressor (node:zlib, Bun)",
    fix: "use the repo's deflate (src/core/deflate.ts): the runtime's zlib gives different bytes in Node and Bun",
  },
];

/** Math functions the engine hands to the platform's libm (or to its own pow and hypot). */
const LIBM = 'a?(?:sin|cos|tan)h?|atan2|exp|expm1|log|log2|log10|log1p|pow|cbrt|hypot';

/**
 * The libm rules (defect D403): glibc picks an FMA or an SSE2 routine per CPU and newer versions
 * round differently, so `Math.sin(x)` is not one number, and one last bit moves a vertex, a QA
 * verdict or a pixel. `**` is the engine's pow. Tested on the code alone (no strings, no comments).
 */
const LIBM_BANNED: readonly { re: RegExp; what: string; fix: string }[] = [
  {
    re: new RegExp(
      `\\bMath\\s*\\.\\s*(?:${LIBM})\\b|\\bMath\\s*\\[|\\{[^}]*\\b(?:${LIBM})\\b[^}]*\\}\\s*=\\s*Math\\b|[^}\\s]\\s*=\\s*Math\\s*[;,)]`,
    ),
    what: "the platform's libm (Math.sin, Math.exp, Math.pow, Math.hypot, …)",
    fix: 'use dmath (dmath.sin, dmath.exp, dmath.pow, dmath.hypot, dmath.norm(v) …; import { dmath } from the package or src/core): the same bits on every CPU and C library. Inverse hyperbolics: build them from dmath.log',
  },
  {
    re: /(?<!\/)\*\*(?!\/)/,
    what: "the ** operator (the engine's pow)",
    fix: 'multiply for a small whole power (x * x), Math.sqrt(x) for ** 0.5, dmath.pow(x, y) otherwise',
  },
];

/** Roots where the libm rules hold: all code that feeds an asset, a render or shipped text. */
export const LIBM_ROOTS: readonly string[] = ['src/', 'recipes/', 'apps/site/src/', 'examples/'];

/** Files that need the platform's own functions, each for a purpose that is not an output. */
export const LIBM_ALLOWED: readonly { path: string; why: string }[] = [
  {
    path: 'src/core/dmath.test.ts',
    why: 'checks dmath beyond its accurate range against Math.sin and Math.cos',
  },
  {
    path: 'src/core/dmath-accuracy.test.ts',
    why: 'measures dmath in ulps against the platform Math.* and the engine `**`',
  },
  {
    path: 'src/core/dmath-hyper.test.ts',
    why: 'measures dmath log10, expm1, log1p, sinh, cosh and tanh in ulps against Math.*',
  },
  {
    path: 'src/render/libm.test.ts',
    why: 'calls Math.sin, Math.exp and Math.hypot once to prove its libm call counter is live',
  },
  {
    path: 'src/export/libm.test.ts',
    why: 'calls Math.sin, Math.exp and Math.hypot once to prove its libm call counter is live',
  },
];

export const underLibmRule = (file: string): boolean =>
  LIBM_ROOTS.some((r) => file.startsWith(r)) && !LIBM_ALLOWED.some((a) => a.path === file);

/** The line without its trailing `//` comment; a `//` inside a string (a URL) is kept. */
export function stripComment(text: string): string {
  let quote = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') i++;
    else if (quote) quote = c === quote ? '' : quote;
    else if (c === "'" || c === '"' || c === '`') quote = c;
    else if (c === '/' && text[i + 1] === '/') return text.slice(0, i);
  }
  return text;
}

/**
 * The source line by line with only its code left: comments dropped, string and template bodies
 * emptied. A template literal may run over many lines (embedded Python or Markdown full of `**`);
 * the code inside its `${…}` is kept. Quoted strings end with their line.
 */
export function codeLines(source: string): string[] {
  const out: string[] = [];
  let block = false; // inside a block comment
  const stack: number[] = []; // -1 = in a template's text; n ≥ 0 = in its `${`, n braces deep
  for (const text of source.split('\n')) {
    let line = '';
    let quote = '';
    for (let i = 0; i < text.length; i++) {
      const c = text[i] ?? '';
      const next = text[i + 1];
      const top = stack[stack.length - 1];
      if (block) {
        if (c === '*' && next === '/') {
          block = false;
          i++;
        }
      } else if (quote) {
        if (c === '\\') i++;
        else if (c === quote) {
          quote = '';
          line += c;
        }
      } else if (top === -1) {
        if (c === '\\') i++;
        else if (c === '`') {
          stack.pop();
          line += c;
        } else if (c === '$' && next === '{') {
          stack.push(0);
          i++;
        }
      } else if (c === '/' && next === '/') break;
      else if (c === '/' && next === '*') {
        block = true;
        i++;
      } else {
        if (c === "'" || c === '"') quote = c;
        else if (c === '`') stack.push(-1);
        else if (top !== undefined && c === '{') stack[stack.length - 1] = top + 1;
        else if (top !== undefined && c === '}') {
          if (top === 0) {
            stack.pop();
            continue;
          }
          stack[stack.length - 1] = top - 1;
        }
        line += c;
      }
    }
    out.push(line);
  }
  return out;
}

/** One line's code alone (see `codeLines`). */
export const codeOnly = (line: string): string => codeLines(line)[0] ?? '';

/** Entropy, clocks, locale and the runtime's compressor: refused in library and recipe code. */
export function checkEntropy(file: string, source: string): Violation[] {
  const out: Violation[] = [];
  source.split('\n').forEach((line, i) => {
    const text = stripComment(line);
    for (const b of BANNED)
      if (b.re.test(text))
        out.push({ file, line: i + 1, message: `${b.what} breaks determinism`, fix: b.fix });
  });
  return out;
}

/**
 * The platform's libm and `**`: refused wherever `underLibmRule` holds, tests included. The rules
 * run over the whole code (lines joined), so a spelling split across lines (`Math\n.sin(x)`, a
 * destructuring of `sin` over several lines) is refused too; each finding names the line it starts
 * on, once per rule and line.
 */
export function checkLibm(file: string, source: string): Violation[] {
  const out: Violation[] = [];
  if (!underLibmRule(file)) return out;
  const lines = codeLines(source);
  const code = lines.join('\n');
  const starts: number[] = [];
  let at = 0;
  for (const l of lines) {
    starts.push(at);
    at += l.length + 1;
  }
  const lineOf = (index: number): number => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((starts[mid] ?? 0) <= index) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
  for (const b of LIBM_BANNED) {
    const seen = new Set<number>();
    for (const m of code.matchAll(new RegExp(b.re.source, 'g'))) {
      const line = lineOf(m.index);
      if (seen.has(line)) continue;
      seen.add(line);
      out.push({ file, line, message: `${b.what} breaks determinism`, fix: b.fix });
    }
  }
  return out.sort((a, b) => a.line - b.line);
}

export const checkSource = (file: string, source: string): Violation[] =>
  [...checkEntropy(file, source), ...checkLibm(file, source)].sort((a, b) => a.line - b.line);

/** Entropy rules: src/ and recipes/, outside tests and the listed exemptions. */
const entropyChecked = (f: string): boolean =>
  (f.startsWith('src/') || f.startsWith('recipes/')) && !f.endsWith('.test.ts') && !isAllowed(f);

if (import.meta.main) {
  const files = (await Promise.all(LIBM_ROOTS.map((r) => tsFiles(r.slice(0, -1))))).flat();
  const violations = (
    await Promise.all(
      files.map(async (f) => {
        const source = await Bun.file(f).text();
        return [...(entropyChecked(f) ? checkEntropy(f, source) : []), ...checkLibm(f, source)];
      }),
    )
  ).flat();
  process.exitCode = report('determinism', violations, process.argv.includes('--json'));
}
