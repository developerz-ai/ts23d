// Committed neural outputs must be publishable (ADR 015 §3): every recipes/<name>/neural/<key>/
// record.json names the model's licence; this repository refuses one it may not redistribute.
// Users' own projects are never gated — this runs only in this repo's recipes step. A malformed
// record is left to the cache loader, which refuses it at build time with its own code.

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { publishableLicence } from '../../src/neural/index.ts';
import type { Violation } from './files.ts';

const licenceOf = (raw: unknown): string | undefined => {
  const model = (raw as { model?: unknown } | null)?.model;
  const l = (model as { licence?: unknown } | null)?.licence;
  return typeof l === 'string' ? l.trim() : undefined;
};

/** Violations for unpublishable committed outputs in one recipe folder. */
export async function neuralLicenceViolations(recipeDir: string): Promise<Violation[]> {
  const root = join(recipeDir, 'neural');
  const keys = await readdir(root).catch(() => [] as string[]);
  const out: Violation[] = [];
  for (const key of keys.sort()) {
    const file = join(root, key, 'record.json');
    const f = Bun.file(file);
    if (!(await f.exists())) continue;
    const licence = licenceOf(await f.json());
    if (licence && publishableLicence(licence)) continue;
    out.push({
      file,
      line: 1,
      message: `committed neural output under licence '${licence ?? 'missing'}' may not be published from this repo (ADR 015)`,
      fix: 'regenerate it with a model whose licence allows publishing outputs (MIT, Apache-2.0, CC0, CC-BY…), or keep it local (do not commit)',
    });
  }
  return out;
}
