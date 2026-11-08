// `t3d tune <recipe.ts>`: offline tuning of every exported asset that declares `tune`. Writes, beside
// the recipe: tune.json (committed; the recipe imports it), tune-report.md and tune-strip.png
// (before/after — Read it). Creates an empty tune.json first so the recipe's import resolves
// (removed again when nothing in the file declares tune).
// Same recipe + --seed + --evals → the same tune.json bytes.

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Ts23dError } from '../core/index.ts';
import {
  convergenceTable,
  loadMasks,
  reportMd,
  type TuneResult,
  tune,
  tuneJson,
  tuneStrip,
} from '../tune/index.ts';
import type { Args } from './args.ts';
import { loadAssets } from './load.ts';

export interface TuneRun {
  readonly file: string;
  readonly json: string;
  readonly results: readonly TuneResult[];
  readonly reports: readonly string[];
  readonly strips: readonly string[];
}

export async function tuneFile(file: string, args: Args): Promise<TuneRun> {
  const dir = dirname(resolve(file));
  const json = join(dir, 'tune.json');
  const created = !existsSync(json);
  if (created) writeFileSync(json, '{}\n');
  const assets = (
    await loadAssets(file).catch((e: unknown) => {
      if (created) rmSync(json);
      throw e;
    })
  ).filter((a) => a.tune);
  if (assets.length === 0 && created) rmSync(json);
  if (assets.length === 0)
    throw new Ts23dError('T3D_TUNE_INVALID', {
      cause: `${file} exports no asset with a tune declaration`,
      fix: "add tune: { params: { … }, objectives: [ … ] } to defineAsset and read params with ctx.tuned('name')",
    });
  const results: TuneResult[] = [];
  const reports: string[] = [];
  const strips: string[] = [];
  for (const asset of assets) {
    const spec = asset.tune;
    if (!spec) continue;
    const masks = loadMasks(spec, dir);
    const r = tune(asset, {
      masks,
      ...(args.evals !== undefined ? { evals: args.evals } : {}),
      ...(args.seed !== undefined ? { seed: args.seed } : {}),
      ...(args.method ? { method: args.method } : {}),
    });
    results.push(r);
    const suffix = assets.length > 1 ? `-${asset.name}` : '';
    const strip = `tune-strip${suffix}.png`;
    const report = join(dir, `tune-report${suffix}.md`);
    writeFileSync(join(dir, strip), tuneStrip(asset, r, masks));
    writeFileSync(report, reportMd(r, strip));
    strips.push(join(dir, strip));
    reports.push(report);
  }
  const existing: unknown = JSON.parse(readFileSync(json, 'utf8'));
  writeFileSync(json, tuneJson(existing, results));
  return { file, json, results, reports, strips };
}

export function printTune(run: TuneRun): void {
  for (const r of run.results) {
    console.log(
      `${r.asset}  tune ${r.method} seed ${r.seed}  ${r.evals} evals (${r.compiled} compiled)  stop: ${r.stop}`,
    );
    console.log(convergenceTable(r));
    for (const [i, o] of r.before.score.objectives.entries()) {
      const after = r.after.score.objectives[i]?.value ?? o.value;
      console.log(`  ${o.name}: ${o.value.toFixed(4)} → ${after.toFixed(4)}`);
    }
    console.log(`  total ${r.before.score.total.toFixed(4)} → ${r.after.score.total.toFixed(4)}`);
    for (const [k, v] of Object.entries(r.after.values))
      console.log(`  ${k}: ${r.before.values[k]} → ${v}`);
  }
  for (const f of [run.json, ...run.reports, ...run.strips]) console.log(`  → ${f}`);
}
