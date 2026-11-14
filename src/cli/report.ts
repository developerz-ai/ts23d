// What `t3d` prints. With --json: exactly one envelope on stdout — { ok, data } on success or QA
// findings, { ok: false, error: { code, message, fix } } on a coded error (plus `data` when other
// assets of the run were built). Human text: results on stdout, errors on stderr. Also folds
// findings that repeat across LODs into one `LOD0-2: …` line.

import { join } from 'node:path';
import type { Lod, Ts23dError } from '../core/index.ts';
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

/**
 * For one --json run: keep the current console.log for the envelope and send every other
 * console.log (human lines, a recipe's own logging) to stderr. Returns the undo.
 */
export function jsonStdout(): () => void {
  const log = console.log;
  const before = stdout;
  stdout = (line) => log(line);
  console.log = console.error;
  return () => {
    console.log = log;
    stdout = before;
  };
}

/** The one stdout line under --json. */
export function envelope(ok: boolean, data: unknown, error?: ErrorJson): void {
  stdout(
    JSON.stringify(error ? { ok, error, ...(data === undefined ? {} : { data }) } : { ok, data }),
  );
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
    `${m.name}  QA ${m.qa.pass ? 'PASS' : 'FAIL'}  tris ${m.triangles.join('/')}  draws ${m.drawCalls.join('/')}`,
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
