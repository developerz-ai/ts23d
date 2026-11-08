// The critique attestation as a recipes-gate step: reads each asset's committed
// out/<asset>/critique.json, hashes the committed hero.png + sheet.png it must be bound to, and
// turns missing / malformed / stale / low-scored critiques into violations. Phase-in switch here.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BOUND_RENDERS, critiqueFindings } from '../../src/qa/critique.ts';
import type { Violation } from './files.ts';

/**
 * 'warn': findings print, the gate stays green (27+ assets predate critiques).
 * 'enforce': findings fail the recipes gate. Flip once every committed asset has a critique.
 */
export const CRITIQUE_MODE: 'warn' | 'enforce' = 'warn';

/** Pass mark on every criterion, repo-wide. No per-recipe overrides: fix the asset instead. */
export const CRITIQUE_MIN_SCORE = 8;

const sha256 = (b: Uint8Array): string => new Bun.CryptoHasher('sha256').update(b).digest('hex');

/** Violations for one asset's committed critique (dir = recipes/<name>, file = its entry .ts). */
export async function critiqueViolations(
  dir: string,
  file: string,
  asset: string,
  minimum: number = CRITIQUE_MIN_SCORE,
): Promise<Violation[]> {
  const out = join(dir, 'out', asset);
  const committed: Record<string, string> = {};
  for (const f of BOUND_RENDERS) {
    const b = Bun.file(join(out, f));
    if (await b.exists()) committed[f] = sha256(new Uint8Array(await b.arrayBuffer()));
  }
  const cj = Bun.file(join(out, 'critique.json'));
  let raw: unknown;
  if (await cj.exists()) {
    try {
      raw = await cj.json();
    } catch {
      raw = null; // unparsable: reported as "not a JSON object"
    }
  }
  const redo = `bun run t3d critique ${file} --out tmp/critique, READ the images, write ${out}/critique.json`;
  return critiqueFindings(asset, raw, committed, minimum).map((f) => ({
    file,
    line: 1,
    message: f.message,
    fix: f.fix.startsWith('bun run t3d critique <recipe>') ? redo : f.fix,
  }));
}

/** Print critique findings as warnings (warn mode). Goes to stderr so --json stdout stays valid. */
export function warnCritiques(violations: readonly Violation[]): void {
  if (violations.length === 0) return;
  console.error(
    `! critique (warn mode, not failing): ${violations.length} finding(s) — score every asset ≥ ${CRITIQUE_MIN_SCORE}`,
  );
  for (const v of violations) console.error(`  ${v.file}  ${v.message}\n    fix: ${v.fix}`);
}

/**
 * `bun run shots` replaces out/ wholesale; carry each asset's critique.json across so a refresh
 * keeps it (and the gate then reports it stale if the images changed). Call between rendering
 * into `tmp` and swapping it in.
 */
export async function keepCritiques(out: string, tmp: string): Promise<string[]> {
  const kept: string[] = [];
  if (!existsSync(out)) return kept; // first render: nothing to keep
  const glob = new Bun.Glob('*/critique.json');
  for await (const rel of glob.scan({ cwd: out, onlyFiles: true })) {
    const asset = rel.split('/')[0] ?? '';
    // Only for assets the recipe still exports (their folder was re-rendered into tmp).
    if (!(await Bun.file(join(tmp, asset, 'manifest.json')).exists())) continue;
    await Bun.write(join(tmp, rel), Bun.file(join(out, rel)));
    kept.push(rel);
  }
  return kept.sort();
}
