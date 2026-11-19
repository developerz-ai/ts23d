// Guard: no ambient entropy in library or recipe code. Same source + seed must give the same
// bytes, so Math.random, clocks and locale-dependent formatting are refused outright.

import { report, tsFiles, type Violation } from './lib/files.ts';

/**
 * Code that never reaches an asset's bytes and needs a clock or a token: a path (a folder ends in
 * `/`) and why it is exempt. Everything else under src/ and recipes/ is checked.
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

export function checkSource(file: string, source: string): Violation[] {
  const out: Violation[] = [];
  source.split('\n').forEach((line, i) => {
    const text = stripComment(line);
    for (const b of BANNED)
      if (b.re.test(text))
        out.push({ file, line: i + 1, message: `${b.what} breaks determinism`, fix: b.fix });
  });
  return out;
}

if (import.meta.main) {
  const files = [...(await tsFiles('src')), ...(await tsFiles('recipes'))].filter(
    (f) => !f.endsWith('.test.ts') && !isAllowed(f),
  );
  const violations = (
    await Promise.all(files.map(async (f) => checkSource(f, await Bun.file(f).text())))
  ).flat();
  process.exitCode = report('determinism', violations, process.argv.includes('--json'));
}
