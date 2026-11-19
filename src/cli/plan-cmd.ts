// `t3d plan check [PLAN.md] [--recipes <dir>] [--out <dir>] [--json]`: the plan (plan-template.ts)
// against the recipes folder and the manifests the last build wrote. Defaults come from the plan:
// PLAN.md's folder holds the recipes, its `Engine:` line names the import folder (engine layout).
// Exit 0 when plan, recipes and builds agree · 1 on any finding · 2 on usage.

import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { ENGINES, engineLayout } from '../export/index.ts';
import { usage } from './flags.ts';
import { type BuiltStats, checkPlan, type PlanFinding, parsePlan } from './plan-template.ts';
import { envelope, qaFailed } from './report.ts';
import { recipeEntries } from './watch.ts';

export interface PlanReport {
  readonly plan: string;
  readonly recipes: string;
  readonly out: string;
  readonly planned: number;
  readonly built: number;
  readonly findings: readonly PlanFinding[];
}

function options(argv: readonly string[]): { file?: string; recipes?: string; out?: string } {
  const o: { file?: string; recipes?: string; out?: string } = {};
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i] ?? '';
    if (a === '--json') continue;
    if (a === '--recipes' || a === '--out') {
      const v = argv[++i];
      if (v === undefined || v.startsWith('-'))
        throw usage(`${a} needs a directory`, `pass ${a} <dir>`);
      o[a === '--out' ? 'out' : 'recipes'] = v;
    } else if (a.startsWith('-'))
      throw usage(
        `unknown flag ${a} for t3d plan check`,
        'flags: --recipes <dir> --out <dir> --json',
      );
    else o.file = a;
  }
  return o;
}

function readStats(file: string): BuiltStats | undefined {
  if (!existsSync(file)) return undefined;
  const m = JSON.parse(readFileSync(file, 'utf8')) as Partial<BuiltStats>;
  return {
    lods: m.lods ?? [],
    triangles: m.triangles ?? [],
    ...(m.clips ? { clips: m.clips } : {}),
  };
}

/** Check a plan file on disk; the folders default from the plan (see header). */
export function planCheck(argv: readonly string[]): PlanReport {
  if (argv[0] !== 'check')
    throw usage(`unknown plan command "${argv[0] ?? ''}"`, 'run t3d plan check [assets/PLAN.md]');
  const o = options(argv);
  const candidates = [...new Set(ENGINES.map((e) => join(engineLayout(e).recipes, 'PLAN.md')))];
  const file = o.file ?? candidates.find((c) => existsSync(c));
  if (!file || !existsSync(file))
    throw usage(
      `no plan at ${file ?? candidates.join(' or ')}`,
      'run t3d init --engine <engine> (writes assets/PLAN.md), or pass the plan path',
    );
  const plan = parsePlan(readFileSync(file, 'utf8'));
  const recipesDir = o.recipes ?? dirname(file);
  const out = o.out ?? (plan.engine ? engineLayout(plan.engine).out : 'out');
  const recipes = new Map(recipeEntries(recipesDir).map((f) => [basename(f, '.ts'), f] as const));
  const built = new Map<string, BuiltStats>();
  for (const name of new Set([...recipes.keys(), ...plan.assets.map((a) => a.name)])) {
    const s = readStats(join(out, name, 'manifest.json'));
    if (s) built.set(name, s);
  }
  const findings = checkPlan(plan, recipes, built, recipesDir);
  return {
    plan: file,
    recipes: recipesDir,
    out,
    planned: plan.assets.length,
    built: built.size,
    findings,
  };
}

export function planMain(argv: readonly string[], json: boolean): number {
  const r = planCheck(argv);
  const ok = r.findings.length === 0;
  if (json)
    envelope(
      ok,
      r,
      ok
        ? undefined
        : qaFailed(
            r.findings.length,
            [...new Set(r.findings.map((f) => f.asset))],
            'data.findings',
          ),
    );
  else {
    for (const f of r.findings)
      console.log(`✘ ${f.code} ${f.asset} (${f.check}): ${f.message}\n  fix: ${f.fix}`);
    console.log(
      `plan ${r.plan}: ${r.planned} planned, ${r.built} built in ${r.out}/ — ${ok ? 'PASS' : `${r.findings.length} finding(s)`}`,
    );
  }
  return ok ? 0 : 1;
}
