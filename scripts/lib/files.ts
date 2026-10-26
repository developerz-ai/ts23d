// File discovery shared by the guards: every tracked-looking .ts file under the given roots.

import { Glob } from 'bun';

export async function tsFiles(root: string, cwd = process.cwd()): Promise<string[]> {
  const out: string[] = [];
  for await (const f of new Glob(`${root}/**/*.ts`).scan({ cwd, dot: false })) {
    if (!f.includes('node_modules') && !f.includes('/dist/')) out.push(f);
  }
  return out.sort();
}

export interface Violation {
  readonly file: string;
  readonly line: number;
  readonly message: string;
  readonly fix: string;
}

/** Print violations (or JSON) and return the exit code. */
export function report(name: string, violations: readonly Violation[], json: boolean): number {
  if (json) console.log(JSON.stringify({ ok: violations.length === 0, check: name, violations }));
  else if (violations.length === 0) console.log(`✔ ${name}`);
  else {
    console.error(`✗ ${name}: ${violations.length} violation(s)`);
    for (const v of violations)
      console.error(`  ${v.file}:${v.line}  ${v.message}\n    fix: ${v.fix}`);
  }
  return violations.length === 0 ? 0 : 1;
}
