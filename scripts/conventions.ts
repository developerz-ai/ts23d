// Guard: the CLAUDE.md rules a script can check, one function each. Every finding prints file:line,
// the rule and a fix. A check that finds old violations in code another owner is fixing starts
// with an explicit allowlist entry below carrying that owner and the reason; nothing is skipped
// silently, and a stale entry (nothing left to excuse) is itself a violation.

import { existsSync } from 'node:fs';
import { report, tsFiles, type Violation } from './lib/files.ts';

export interface Source {
  readonly file: string;
  readonly text: string;
}

const isTest = (f: string): boolean => f.endsWith('.test.ts');
const lineOf = (text: string, index: number): number => text.slice(0, index).split('\n').length;

/** "No bare `Error` in `src/`": throw Ts23dError(code, { cause, fix }). */
export function bareErrors(s: Source): Violation[] {
  const out: Violation[] = [];
  s.text.split('\n').forEach((text, i) => {
    if (/^\s*(\/\/|\*)/.test(text)) return;
    const m = /\b(?:new|throw)\s+(Error|RangeError|TypeError)\(/.exec(text);
    if (m)
      out.push({
        file: s.file,
        line: i + 1,
        message: `bare ${m[1]} in src/ (CLAUDE.md: no bare Error)`,
        fix: "throw new Ts23dError('T3D_…', { cause, fix }) with a code from src/core/errors.ts",
      });
  });
  return out;
}

/** "Header comment states the job": the first line (after a shebang) is a comment. */
export function missingHeader(s: Source): Violation[] {
  const lines = s.text.split('\n');
  const first = lines[0]?.startsWith('#!') ? lines[1] : lines[0];
  return /^\s*(\/\/|\/\*)/.test(first ?? '')
    ? []
    : [
        {
          file: s.file,
          line: 1,
          message: 'no header comment (CLAUDE.md: header comment states the job)',
          fix: "start the file with '// <what this file does, in one or two lines>'",
        },
      ];
}

/** Env-var names that look like codes but are not errors. */
export const ENV_NAMES: ReadonlySet<string> = new Set(['T3D_SHARD', 'T3D_UPDATE_GOLDEN']);

/** Codes documented before the code that raises them lands. Owner + reason per entry. */
export const PENDING_CODES: Readonly<Record<string, string>> = {};

const CODE = /T3D_[A-Z0-9]+(?:_[A-Z0-9]+)*(?![A-Z0-9_*])/g;
const QUOTED = /['"`](T3D_[A-Z0-9]+(?:_[A-Z0-9]+)*)['"`]/g;
const GATE_NAME = /\bgate\s*[:=]\s*'([a-z][a-z0-9-]*)'/g;
const findingCode = (gate: string): string =>
  `T3D_QA_${gate.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;

/**
 * errors.md is the catalogue: every quoted `T3D_*` code in src/ (the ErrorCode union, finding
 * codes) has a row, and every code in errors.md is raised somewhere: literally, or as the
 * `T3D_QA_<GATE>` a gate's name generates. Wildcards (`T3D_WEATHER_*`) are prose, not codes.
 */
export function errorsDoc(
  src: readonly Source[],
  doc: Source,
  pending: Readonly<Record<string, string>> = PENDING_CODES,
): Violation[] {
  const documented = new Set([...doc.text.matchAll(CODE)].map((m) => m[0]));
  const raised = new Set<string>();
  const out: Violation[] = [];
  for (const s of src) {
    for (const m of s.text.matchAll(GATE_NAME)) raised.add(findingCode(m[1] ?? ''));
    for (const m of s.text.matchAll(QUOTED)) {
      const code = m[1] ?? '';
      raised.add(code);
      if (documented.has(code) || ENV_NAMES.has(code)) continue;
      documented.add(code); // one finding per code: its first use
      out.push({
        file: s.file,
        line: lineOf(s.text, m.index),
        message: `${code} is not in ${doc.file}`,
        fix: `add a row for ${code} to ${doc.file} (code, where, cause, fix)`,
      });
    }
  }
  for (const m of doc.text.matchAll(CODE)) {
    const code = m[0];
    if (raised.has(code) || ENV_NAMES.has(code) || code in pending) continue;
    raised.add(code);
    out.push({
      file: doc.file,
      line: lineOf(doc.text, m.index),
      message: `${code} is documented but nothing in src/ raises it`,
      fix: 'drop the row, or mark it retired ("unused") and keep the code in the ErrorCode union',
    });
  }
  for (const [code, why] of Object.entries(pending))
    if (raised.has(code))
      out.push({
        file: 'scripts/conventions.ts',
        line: 1,
        message: `stale PENDING_CODES entry ${code} (${why}): src/ raises it now`,
        fix: `delete ${code} from PENDING_CODES`,
      });
  return out;
}

/** "LOD-gate, never decimate" (ADR 011): `simplify(` only beside an imported mesh. */
export function decimatesCode(s: Source): Violation[] {
  const at = s.text.search(/\bsimplify\(/);
  if (at === -1 || /\bimportGlb\b/.test(s.text)) return [];
  return [
    {
      file: s.file,
      line: lineOf(s.text, at),
      message: 'simplify() on code-built geometry (CLAUDE.md: LOD-gate, never decimate; ADR 011)',
      fix: 'read ctx.lod and emit less at LOD1/2; simplify() is only for importGlb meshes',
    },
  ];
}

/** Kinds that model a real, measurable thing: they must cite it. Each is a module in src/kinds. */
export const REAL_KINDS = ['vehicle', 'building'] as const;

/** Every REAL_KINDS entry is still exported from src/kinds/index.ts as './<kind>.ts'. */
export function kindsDrift(kindsIndex: Source): Violation[] {
  return REAL_KINDS.filter((k) => !kindsIndex.text.includes(`from './${k}.ts'`)).map((k) => ({
    file: kindsIndex.file,
    line: 1,
    message: `REAL_KINDS lists '${k}' but ${kindsIndex.file} exports no ./${k}.ts`,
    fix: 'update REAL_KINDS in scripts/conventions.ts to the vehicle/building kinds that exist',
  }));
}

/** "Real units and references": a vehicle/building recipe declares real, sources and measures. */
export function realSources(folder: readonly Source[]): Violation[] {
  const all = folder.map((s) => s.text).join('\n');
  for (const s of folder) {
    const m = new RegExp(`\\bkind:\\s*'(${REAL_KINDS.join('|')})'`).exec(s.text);
    if (!m) continue;
    const missing = ['real', 'sources', 'measures'].filter(
      (k) => !new RegExp(`\\b${k}:`).test(all),
    );
    return missing.length === 0
      ? []
      : [
          {
            file: s.file,
            line: lineOf(s.text, m.index),
            message: `kind '${m[1]}' without ${missing.join(', ')} (CLAUDE.md: real units and references)`,
            fix: 'declare real: { length, width, height, measures: [...] } and sources: [...] from the README dossier',
          },
        ];
  }
  return [];
}

/** Defect rows shipped before the path rule; they name a gate, not a file. Owner + reason. */
const LEGACY_WHY = 'predates the path rule; names its gate only. Owner: docs (add the test path)';
export const LEGACY_DEFECT_ROWS: Readonly<Record<string, string>> = Object.fromEntries(
  'D1 D2 D3 D4 D5 D6 D7 D8 D9 D10 D11 D12 D14 D16 D19'.split(' ').map((d) => [d, LEGACY_WHY]),
);

const PATH = /`((?:src|scripts|recipes|apps|docs|examples)\/[^`\s:]+)(?::\d+)?`/g;

/** "Enforce rules": every shipped defect row names a check path, and the path exists. */
export function defectRows(
  doc: Source,
  exists: (p: string) => boolean = existsSync,
  legacy: Readonly<Record<string, string>> = LEGACY_DEFECT_ROWS,
): Violation[] {
  const out: Violation[] = [];
  doc.text.split('\n').forEach((row, i) => {
    const cells = row.split('|').map((c) => c.trim());
    const id = cells[1] ?? '';
    if (!/^D\d+$/.test(id) || !(cells.at(-2) ?? '').startsWith('shipped')) return;
    const paths = [...row.matchAll(PATH)].map((m) => m[1] ?? '');
    const at = { file: doc.file, line: i + 1 };
    if (paths.length === 0 && !(id in legacy))
      out.push({
        ...at,
        message: `${id} is shipped but names no file`,
        fix: 'name the test or gate file that fails on it, in backticks: `src/qa/x.test.ts`',
      });
    else if (paths.length > 0 && id in legacy)
      out.push({
        ...at,
        message: `stale LEGACY_DEFECT_ROWS entry ${id}`,
        fix: `drop ${id} from it`,
      });
    for (const p of paths.filter((x) => !exists(x)))
      out.push({ ...at, message: `${id} names ${p}, which does not exist`, fix: 'fix the path' });
  });
  return out;
}

const read = async (file: string): Promise<Source> => ({ file, text: await Bun.file(file).text() });

if (import.meta.main) {
  const src = await Promise.all((await tsFiles('src')).filter((f) => !isTest(f)).map(read));
  const scripts = await Promise.all((await tsFiles('scripts')).filter((f) => !isTest(f)).map(read));
  const recipes = await Promise.all((await tsFiles('recipes')).filter((f) => !isTest(f)).map(read));
  const folders = new Map<string, Source[]>();
  for (const s of recipes) {
    const dir = s.file.split('/')[1] ?? '';
    if (dir.startsWith('_') || s.file.includes('/out/')) continue;
    folders.set(dir, [...(folders.get(dir) ?? []), s]);
  }
  const violations = [
    ...src.flatMap(bareErrors),
    ...[...src, ...scripts].filter((s) => !s.file.endsWith('/index.ts')).flatMap(missingHeader),
    ...errorsDoc(src, await read('docs/architecture/errors.md')),
    ...[...recipes, ...src.filter((s) => s.file.startsWith('src/kinds/'))].flatMap(decimatesCode),
    ...kindsDrift(await read('src/kinds/index.ts')),
    ...[...folders.values()].flatMap(realSources),
    ...defectRows(await read('docs/architecture/defect-catalogue.md')),
  ];
  process.exitCode = report('conventions', violations, process.argv.includes('--json'));
}
