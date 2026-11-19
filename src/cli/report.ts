// What `t3d` prints. With --json: exactly one envelope on stdout — { ok: true, data } on success;
// whenever ok is false an `error: { code, message, fix }` is there too: the coded error that
// stopped the run (no `data`), the first failed file or asset (`data` holds the built items and
// each failure as { file, asset?, error }), or T3D_QA_FAILED summing up QA findings (`data` as
// on success). Human text: results on stdout, errors on stderr. Also folds findings that repeat
// across LODs into one `LOD0-2: …` line.

import { join } from 'node:path';
import { formatCount, type Lod, Ts23dError } from '../core/index.ts';
import type { Finding } from '../qa/index.ts';
import type { AssetManifest } from './manifest.ts';

export type ErrorJson = ReturnType<Ts23dError['toJSON']>;

/** One failed file or asset in a multi-recipe run: data[] carries it beside the built ones. */
export interface Failed {
  readonly file: string;
  readonly asset?: string;
  readonly error: ErrorJson;
}

/** Usage errors exit 2, every other coded error 1. */
export const exitOf = (e: Ts23dError): number => (e.code === 'T3D_CLI_USAGE' ? 2 : 1);

/** Where the envelope goes: the console.log in place when the run started (stdout). */
let stdout: (line: string) => void = (line) => console.log(line);
/** process.stdout.write before the outermost active jsonStdout (protocol output goes there). */
let realWrite: typeof process.stdout.write | undefined;

/** A writer to the real stdout, past any jsonStdout redirect: for protocol lines (MCP). */
export function stdoutWriter(): (text: string) => void {
  const w = realWrite ?? process.stdout.write;
  return (text) => {
    w.call(process.stdout, text);
  };
}

/**
 * For one --json run: keep the current console.log for the envelope and send every other
 * console.log / info / debug and every direct `process.stdout.write` (human lines, a recipe's own
 * output) to stderr. The envelope is printed with the original writer put back for that one line
 * (Node's console.log writes through it). Returns the undo.
 */
export function jsonStdout(): () => void {
  const { log, info, debug } = console;
  const before = stdout;
  const write = process.stdout.write;
  const outermost = realWrite === undefined;
  if (outermost) realWrite = write;
  const toStderr = process.stderr.write.bind(process.stderr) as typeof process.stdout.write;
  stdout = (line) => {
    process.stdout.write = write;
    try {
      log(line);
    } finally {
      process.stdout.write = toStderr;
    }
  };
  process.stdout.write = toStderr;
  console.log = console.error;
  console.info = console.error;
  console.debug = console.error;
  return () => {
    Object.assign(console, { log, info, debug });
    process.stdout.write = write;
    if (outermost) realWrite = undefined;
    stdout = before;
  };
}

/** The one stdout line under --json. */
export function envelope(ok: boolean, data: unknown, error?: ErrorJson): void {
  stdout(
    JSON.stringify(error ? { ok, error, ...(data === undefined ? {} : { data }) } : { ok, data }),
  );
}

/** The envelope `error` for a run whose items failed QA: the count, the assets, where to look. */
export function qaFailed(count: number, assets: readonly string[], where: string): ErrorJson {
  return new Ts23dError('T3D_QA_FAILED', {
    cause: `QA failed: ${count} finding(s) on ${assets.length} asset(s): ${assets.join(', ')}`,
    fix: `read ${where}: each finding has its own code and fix; apply them and run again`,
  }).toJSON();
}

/**
 * The run's one output: envelope or human lines; exit 1 on any failure or finding. `qa` is the
 * error when the items themselves failed (QA findings, gaps); a failed file or asset wins.
 */
export function finish<T>(
  json: boolean,
  failed: readonly Failed[],
  items: readonly T[],
  print: (item: T) => void,
  qa?: ErrorJson,
): number {
  const ok = !qa && failed.length === 0;
  if (json) envelope(ok, [...items, ...failed], failed[0]?.error ?? qa);
  else items.forEach(print);
  return ok ? 0 : 1;
}

/** Print one coded error: the envelope under --json, `CODE: cause` + `fix:` on stderr otherwise. */
export function printError(e: Ts23dError, json: boolean): number {
  if (json) envelope(false, undefined, e.toJSON());
  else console.error(`${e.message}\n  fix: ${e.fix}`);
  return exitOf(e);
}

/** Human line for a failure inside a run (the run goes on). */
export function printFailed(f: Failed): void {
  console.error(`✘ ${f.asset ?? f.file}  ${f.error.message}\n  fix: ${f.error.fix}`);
}

/** [0, 1, 2] → "0-2", [0, 2] → "0,2", [1] → "1". */
export function lodLabel(lods: readonly Lod[]): string {
  const sorted = [...lods].sort();
  const first = sorted[0];
  const last = sorted.at(-1);
  if (first === undefined || last === undefined) return '';
  const run = sorted.length > 2 && last - first === sorted.length - 1;
  return run ? `${first}-${last}` : sorted.join(',');
}

/**
 * Per-LOD findings → one finding per distinct (gate, code, part, message, fix, gap, nearest), its
 * message prefixed with the LODs it holds at: `LOD0-2: part 'x' floats`. First-seen order.
 */
export function foldLods(perLod: readonly { lod: Lod; findings: readonly Finding[] }[]): Finding[] {
  const groups = new Map<string, { finding: Finding; lods: Lod[] }>();
  for (const { lod, findings } of perLod)
    for (const f of findings) {
      const key = JSON.stringify([f.gate, f.code, f.part, f.message, f.fix, f.gap, f.nearest]);
      const g = groups.get(key);
      if (g) {
        if (!g.lods.includes(lod)) g.lods.push(lod);
      } else groups.set(key, { finding: f, lods: [lod] });
    }
  return [...groups.values()].map(({ finding, lods }) => ({
    ...finding,
    message: `LOD${lodLabel(lods)}: ${finding.message}`,
  }));
}

/** `✗ T3D_QA_X gate [part]: message (gap 0.031 m, nearest hull)` + `fix:`. */
export function findingLine(f: Finding): string {
  const extra = [
    ...(f.gap !== undefined ? [`gap ${f.gap.toFixed(3)} m`] : []),
    ...(f.nearest !== undefined ? [`nearest ${f.nearest}`] : []),
  ];
  return `  ✗ ${f.code} ${f.gate}${f.part ? ` [${f.part}]` : ''}: ${f.message}${extra.length ? ` (${extra.join(', ')})` : ''}\n    fix: ${f.fix}`;
}

/** Human summary of one built asset; `dir` resolves the manifest's relative file paths. */
export function printManifest(m: AssetManifest, dir: string): void {
  console.log(
    `${m.name}  QA ${m.qa.pass ? 'PASS' : 'FAIL'}  tris ${m.triangles.map(formatCount).join('/')}  draws ${m.drawCalls.join('/')}`,
  );
  const f = m.files;
  for (const p of [
    ...f.lods,
    ...(f.single ? [f.single] : []),
    ...(f.hero ? [f.hero] : []),
    ...(f.sheet ? [f.sheet] : []),
  ])
    console.log(`  → ${join(dir, p)}`);
  for (const x of m.qa.findings) console.log(findingLine(x));
}
