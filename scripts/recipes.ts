// Gate: every recipe compiles at LOD 0/1/2, passes QA, and is byte-deterministic (two builds,
// one hash); every asset lives in recipes/<name>/<name>.ts with a README.md dossier, and its
// committed out/<asset>/ (hero.png, sheet.png, manifest.json) matches a fresh compile, and carries
// a fresh critique.json scored ≥ CRITIQUE_MIN_SCORE (warn-only until ENFORCE_FROM). Then the
// shard's recipe tests (recipes/<name>/**/*.test.ts; recipes/_*/ on shard 1) run. "The gallery is
// green".

import { loadAssets } from '../src/cli/load.ts';
import { type CompiledAsset, compile, type Lod } from '../src/core/index.ts';
import { toGlb } from '../src/export/index.ts';
import { runLodQa, runQa } from '../src/qa/index.ts';
import { critiqueMode, critiqueViolations, warnCritiques } from './lib/critique.ts';
import { recipeFolders, report, tsFiles, type Violation } from './lib/files.ts';
import { crossRecipeImports } from './lib/recipe-imports.ts';
import { CURRENT_SHARD, inShard, type Shard } from './lib/shard.ts';

/** The committed out/<asset>/ must exist and describe what the recipe compiles to today. */
export async function staleOutputs(
  dir: string,
  file: string,
  name: string,
  triangles: readonly number[],
): Promise<Violation[]> {
  const fix = `bun run shots ${dir.slice(dir.lastIndexOf('/') + 1)}  (then commit ${dir}/out/)`;
  const out = `${dir}/out/${name}`;
  const missing: string[] = [];
  for (const f of ['manifest.json', 'hero.png', 'sheet.png'])
    if (!(await Bun.file(`${out}/${f}`).exists())) missing.push(f);
  if (missing.length > 0)
    return [
      { file, line: 1, message: `${name}: no committed ${missing.join(' + ')} in ${out}/`, fix },
    ];
  const committed =
    ((await Bun.file(`${out}/manifest.json`).json()) as { triangles?: number[] }).triangles ?? [];
  return committed.join('/') === triangles.join('/')
    ? []
    : [
        {
          file,
          line: 1,
          message: `${name}: committed outputs are stale (tris ${committed.join('/')} vs ${triangles.join('/')} now)`,
          fix,
        },
      ];
}

/**
 * The recipe tests this shard runs: those inside its asset folders, plus the shared `recipes/_*`
 * folders' tests on shard 1 (or unsharded). Never generated outputs under out/.
 */
export function recipeTests(
  tests: readonly string[],
  dirs: readonly string[],
  shard: Shard | undefined,
): string[] {
  const shared = !shard || shard.k === 1;
  return tests.filter((t) => {
    const [, dir, sub] = t.split('/');
    if (!t.endsWith('.test.ts') || sub === 'out' || !dir) return false;
    return dir.startsWith('_') ? shared : dirs.includes(`recipes/${dir}`);
  });
}

/** Run the given test files (never `bun test` with no paths: that runs every test). */
function runTests(files: readonly string[], json: boolean): Violation[] {
  if (files.length === 0) return [];
  const p = Bun.spawnSync(['bun', 'test', '--timeout', '120000', ...files.map((f) => `./${f}`)], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const output = `${p.stdout}${p.stderr}`;
  if (!json) console.error(output);
  return p.exitCode === 0
    ? []
    : [
        {
          file: files.length === 1 ? (files[0] ?? '') : 'recipes',
          line: 1,
          message: `recipe tests failed (exit ${p.exitCode}):\n${output.slice(-3000)}`,
          fix: `bun test ${files.map((f) => `./${f}`).join(' ')}  and fix the failing recipe or test`,
        },
      ];
}

async function main(): Promise<void> {
  const json = process.argv.includes('--json');
  const violations: Violation[] = [];
  const critiques: Violation[] = [];
  const rows: { asset: string; triangles: number[] }[] = [];
  const { folders, stray } = await recipeFolders();
  for (const file of stray)
    violations.push({
      file,
      line: 1,
      message:
        "not an asset folder: recipes hold recipes/<name>/<name>.ts plus that folder's modules",
      fix: `move it to recipes/<name>/<name>.ts, or into recipes/_lib/ if it is a shared helper`,
    });
  const all = await tsFiles('recipes');
  for (const f of all) violations.push(...crossRecipeImports(f, await Bun.file(f).text()));
  const mine = inShard(folders, CURRENT_SHARD);
  for (const { dir, file } of mine) {
    if (!(await Bun.file(`${dir}/README.md`).exists()))
      violations.push({
        file,
        line: 1,
        message: `${dir} has no README.md dossier`,
        fix: `write ${dir}/README.md from the template in recipes/README.md (specs + sources first)`,
      });
    for (const asset of await loadAssets(file)) {
      const triangles: number[] = [];
      const lods: CompiledAsset[] = [];
      for (const lod of [0, 1, 2] as Lod[]) {
        const a = compile(asset, { lod });
        lods.push(a);
        triangles.push(a.parts.reduce((s, p) => s + (p.mesh ? p.mesh.indices.length / 3 : 0), 0));
        for (const f of runQa(a))
          violations.push({
            file,
            line: 1,
            message: `${asset.name} LOD${lod} ${f.gate}${f.part ? ` [${f.part}]` : ''}: ${f.message}`,
            fix: f.fix,
          });
        if (Bun.hash(toGlb(a)) !== Bun.hash(toGlb(compile(asset, { lod })))) {
          violations.push({
            file,
            line: 1,
            message: `${asset.name} LOD${lod} is not byte-deterministic`,
            fix: 'remove ambient state from build(): read ctx.rng/ctx.seed only',
          });
        }
      }
      // Cross-LOD gates: triangles fall LOD0 → LOD2 (DEFAULT_LOD_GATES).
      for (const f of runLodQa(lods))
        violations.push({
          file,
          line: 1,
          message: `${asset.name} ${f.gate}${f.part ? ` [${f.part}]` : ''}: ${f.message}`,
          fix: f.fix,
        });
      violations.push(...(await staleOutputs(dir, file, asset.name, triangles)));
      critiques.push(...(await critiqueViolations(dir, file, asset.name)));
      rows.push({ asset: asset.name, triangles });
    }
  }
  const tests = recipeTests(
    all,
    mine.map((f) => f.dir),
    CURRENT_SHARD,
  );
  violations.push(...runTests(tests, json));
  if (critiqueMode() === 'enforce') violations.push(...critiques);
  else warnCritiques(critiques);
  if (!json)
    for (const r of rows) console.log(`  ${r.asset.padEnd(20)} tris ${r.triangles.join('/')}`);
  process.exitCode = report(
    `recipes (${rows.length} assets, ${tests.length} test files)`,
    violations,
    json,
  );
}

if (import.meta.main) await main();
