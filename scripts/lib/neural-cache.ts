// The committed neural cache of one recipe folder (ADR 014), checked as files: every record parses
// and its outputs match their sha256; a committed (non-local) output must be there; committed
// bytes stay under the per-recipe cap. A local output (`"local": true`, `local-<i>.*`) may be
// missing (it lives on the machine that made it), is hashed when present, never counts toward
// the cap, and must never be tracked by git. Runs only in this repo's recipes step.

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Ts23dError } from '../../src/core/index.ts';
import { entryOf, NEURAL_CAP_BYTES, parseRecord } from '../../src/neural/index.ts';
import type { Violation } from './files.ts';

const KEY = /^[0-9a-f]{64}$/;

/** Paths git tracks under `dir`, relative to it (`git ls-files`); throws when git cannot say. */
export async function gitTracked(dir: string): Promise<readonly string[]> {
  const p = Bun.spawn(['git', 'ls-files', '--', '.'], { cwd: dir, stdout: 'pipe', stderr: 'pipe' });
  const [out, err, code] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  if (code !== 0) throw new Error(`git ls-files exited ${code}: ${err.trim()}`);
  return out.split('\n').filter(Boolean);
}

/** Violations in `<recipeDir>/neural/`; `tracked` and `capBytes` are injectable for tests. */
export async function neuralCacheViolations(
  recipeDir: string,
  o: {
    readonly tracked?: (dir: string) => Promise<readonly string[]>;
    readonly capBytes?: number;
  } = {},
): Promise<Violation[]> {
  const root = join(recipeDir, 'neural');
  const cap = o.capBytes ?? NEURAL_CAP_BYTES;
  const keys = (await readdir(root).catch(() => [] as string[])).filter((k) => KEY.test(k)).sort();
  const out: Violation[] = [];
  const local: string[] = [];
  let committed = 0;
  for (const key of keys) {
    const file = join(root, key, 'record.json');
    const text = await readFile(file, 'utf8').catch(() => undefined);
    if (text === undefined) continue;
    try {
      const record = parseRecord(text, file);
      const files = new Map<string, Uint8Array>();
      for (const x of record.outputs) {
        const bytes = await readFile(join(root, key, x.file)).catch(() => undefined);
        if (bytes) files.set(x.file, new Uint8Array(bytes));
        if (x.local) local.push(`${key}/${x.file}`);
        // The file's real length (a missing one is reported by entryOf below).
        else committed += bytes?.length ?? 0;
      }
      entryOf(record, files);
    } catch (e) {
      if (!(e instanceof Ts23dError)) throw e;
      out.push({ file, line: 1, message: e.message, fix: e.fix });
    }
  }
  if (committed > cap)
    out.push({
      file: root,
      line: 1,
      message: `committed neural outputs are ${committed} bytes, cap ${cap} (ADR 014)`,
      fix: "ask for smaller outputs, delete unused keys, or keep an output that only feeds a next request local: ctx.neural(task, request, { keep: 'local' })",
    });
  if (local.length === 0) return out;
  let tracked: readonly string[];
  try {
    tracked = await (o.tracked ?? gitTracked)(root);
  } catch (e) {
    return [
      ...out,
      {
        file: root,
        line: 1,
        message: `cannot tell whether local neural outputs are tracked (${e instanceof Error ? e.message : String(e)})`,
        fix: 'run the gate inside the git checkout',
      },
    ];
  }
  for (const f of local)
    if (tracked.includes(f))
      out.push({
        file: join(root, f),
        line: 1,
        message:
          'a local neural output is tracked by git (it is kept on the machine that made it; record.json carries its sha256)',
        fix: `git rm --cached ${join(root, f)}; .gitignore must hold recipes/*/neural/*/local-*`,
      });
  return out;
}
