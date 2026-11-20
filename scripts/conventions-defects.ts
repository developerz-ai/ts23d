// Conventions rule: every defect number the code cites (`Dnnn` in a test name, a comment, a
// recipe README) has its row in the defect catalogue. The test that fails on a defect lives where
// the number is cited, so a cited number without a row is a defect nobody can look up, and a row
// renumbered away from its citations is caught here. Release history (CHANGELOG.md,
// docs/changelog/) is outside the roots read.

import { Glob } from 'bun';
import type { Source } from './conventions.ts';
import type { Violation } from './lib/files.ts';

/** Where citations are read: code, tests, recipe READMEs and Blender scripts. */
export const CITATION_ROOTS = ['src', 'recipes', 'scripts', 'apps'] as const;
const KINDS = '{ts,md,py}';
const SKIP = /(^|\/)(node_modules|dist|out|\.out-tmp)\//;

/** A defect number as written in prose: `D` and digits as a word of their own. */
const CITE = /\bD\d+\b/g;

/** The catalogue's row ids: the first cell of each table row. */
export function catalogueIds(doc: Source): Set<string> {
  const ids = new Set<string>();
  for (const row of doc.text.split('\n')) {
    const id = row.split('|')[1]?.trim() ?? '';
    if (/^D\d+$/.test(id)) ids.add(id);
  }
  return ids;
}

/** One finding per cited number with no row, at its first citation, with how often it is cited. */
export function defectCitations(sources: readonly Source[], doc: Source): Violation[] {
  const rows = catalogueIds(doc);
  const missing = new Map<string, { file: string; line: number; count: number }>();
  for (const s of sources)
    s.text.split('\n').forEach((text, i) => {
      for (const m of text.matchAll(CITE)) {
        const id = m[0];
        if (rows.has(id)) continue;
        const seen = missing.get(id);
        if (seen) seen.count++;
        else missing.set(id, { file: s.file, line: i + 1, count: 1 });
      }
    });
  return [...missing].map(([id, at]) => ({
    file: at.file,
    line: at.line,
    message: `${id} is cited (${at.count} place${at.count === 1 ? '' : 's'}) but has no row in ${doc.file}`,
    fix: `add a row for ${id} to ${doc.file} (symptom | root cause | fix; test path | shipped), or cite the number the catalogue gives this defect`,
  }));
}

/** Every file under CITATION_ROOTS that can cite a defect, sorted, outside generated folders. */
export async function citationSources(cwd = process.cwd()): Promise<Source[]> {
  const files: string[] = [];
  for (const root of CITATION_ROOTS)
    for await (const f of new Glob(`${root}/**/*.${KINDS}`).scan({ cwd, dot: false }))
      if (!SKIP.test(f)) files.push(f);
  return Promise.all(
    files.sort().map(async (file) => ({ file, text: await Bun.file(`${cwd}/${file}`).text() })),
  );
}
