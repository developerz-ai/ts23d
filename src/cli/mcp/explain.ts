// `explain_error`: a T3D_* code → its rows in docs/architecture/errors.md (cause, fix, where it is
// thrown), read from the doc the package ships so the answer is the documented one, not a copy.
// Every markdown table row whose first cell is the code counts; columns are named by the table's
// own header, so library, CLI, finding and assertion tables all answer.

import { dirname, join } from 'node:path';
import { Ts23dError } from '../../core/index.ts';

const DOC = join('docs', 'architecture', 'errors.md');

/** The package's errors doc: the nearest docs/ above this file (src/cli/mcp/, or the dist bundle). */
export async function errorsDoc(from = import.meta.dir): Promise<string> {
  for (let dir = from; ; dir = dirname(dir)) {
    if (await Bun.file(join(dir, DOC)).exists()) return join(dir, DOC);
    if (dirname(dir) === dir)
      throw new Ts23dError('T3D_RECIPE_NOT_FOUND', {
        cause: `no ${DOC} above ${from}`,
        fix: 'reinstall @developerz.ai/ts23d (the package ships docs/); or read docs/architecture/errors.md on GitHub',
      });
  }
}

export interface Explained {
  readonly code: string;
  /** The `##`/`###` heading the row sits under. */
  readonly section: string;
  /** Header → cell, e.g. { Cause: '…', Fix: '…' }. */
  readonly columns: Readonly<Record<string, string>>;
}

const cells = (row: string): string[] =>
  row
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim());

/** Every documented row for `code` in `doc` (markdown). */
export function explainIn(doc: string, code: string): Explained[] {
  const found: Explained[] = [];
  let section = '';
  let header: string[] = [];
  for (const line of doc.split('\n')) {
    if (line.startsWith('#')) section = line.replace(/^#+\s*/, '');
    if (!line.startsWith('|')) {
      header = [];
      continue;
    }
    const row = cells(line);
    if (header.length === 0) {
      header = row;
      continue;
    }
    if (row[0] !== `\`${code}\``) continue;
    const columns: Record<string, string> = {};
    header.forEach((h, i) => {
      if (i > 0 && row[i] !== undefined) columns[h] = row[i] ?? '';
    });
    found.push({ code, section, columns });
  }
  return found;
}

/** The documented rows for `code`; an unknown or malformed code is T3D_CLI_USAGE with the fix. */
export async function explain(code: string): Promise<Explained[]> {
  if (!/^T3D_[A-Z0-9_]+$/.test(code))
    throw new Ts23dError('T3D_CLI_USAGE', {
      cause: `'${code}' is not a ts23d error code`,
      fix: 'pass the code as printed, e.g. T3D_PART_UNKNOWN (upper case, T3D_ prefix)',
    });
  const rows = explainIn(await Bun.file(await errorsDoc()).text(), code);
  if (rows.length === 0)
    throw new Ts23dError('T3D_CLI_USAGE', {
      cause: `${code} is not in docs/architecture/errors.md`,
      fix: 'check the spelling against the error you saw; the printed `fix:` line is the authority for new codes',
    });
  return rows;
}
