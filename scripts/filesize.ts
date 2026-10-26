// Guard: one file, one job. Source files past the ceiling get split, not excused.

import { report, tsFiles, type Violation } from './lib/files.ts';

export const TARGET = 200;
export const CEILING = 300;

if (import.meta.main) {
  const files = [
    ...(await tsFiles('src')),
    ...(await tsFiles('scripts')),
    ...(await tsFiles('apps/site/src')),
  ];
  const violations: Violation[] = [];
  for (const f of files) {
    const lines = (await Bun.file(f).text()).split('\n').length;
    if (lines > CEILING)
      violations.push({
        file: f,
        line: CEILING,
        message: `${lines} lines (target ${TARGET}, ceiling ${CEILING})`,
        fix: 'split by responsibility into sibling files; re-export from index.ts',
      });
  }
  process.exitCode = report('filesize', violations, process.argv.includes('--json'));
}
