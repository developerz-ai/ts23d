// Conventions rule: no `instanceof Ts23dError` outside core. A recipe and the CLI can load
// different copies of the library (a `bunx -p` CLI over a project's node_modules), and
// `instanceof` is false across copies, so a coded error would lose its code and fix. Use the
// brand check `isTs23dError(e)` from core. Old sites another owner is fixing go in PENDING_BRAND
// with owner and reason; an entry with nothing left to excuse is itself a violation.

import type { Source } from './conventions.ts';
import type { Violation } from './lib/files.ts';

/** Where the brand check is defined: it must use `instanceof` once, for this copy's errors. */
const DEFINITION = 'src/core/errors.ts';

/** Files still holding the old form, excused while their owner fixes them. Owner + reason. */
export const PENDING_BRAND: Readonly<Record<string, string>> = {};

/** `<expr> instanceof Ts23dError` in code (prose quoting the form has no operand before it). */
const PATTERN = /[\w\])]\s+instanceof\s+Ts23dError\b/;

export function brandChecks(
  sources: readonly Source[],
  pending: Readonly<Record<string, string>> = PENDING_BRAND,
): Violation[] {
  const out: Violation[] = [];
  const excused = new Set<string>();
  for (const s of sources) {
    if (s.file === DEFINITION) continue;
    s.text.split('\n').forEach((text, i) => {
      if (/^\s*(\/\/|\*)/.test(text) || !PATTERN.test(text)) return;
      if (s.file in pending) {
        excused.add(s.file);
        return;
      }
      out.push({
        file: s.file,
        line: i + 1,
        message:
          '`instanceof Ts23dError` is false for an error from another copy of the library: its code and fix are lost',
        fix: "use the brand check: `isTs23dError(e)` (import { isTs23dError } from '…/core/index.ts')",
      });
    });
  }
  for (const [file, why] of Object.entries(pending))
    if (!excused.has(file))
      out.push({
        file: 'scripts/conventions-brand.ts',
        line: 1,
        message: `stale PENDING_BRAND entry ${file} (${why}): it has no \`instanceof Ts23dError\` left`,
        fix: `delete ${file} from PENDING_BRAND`,
      });
  return out;
}
