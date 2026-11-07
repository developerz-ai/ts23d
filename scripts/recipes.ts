// Gate: every recipe compiles at LOD 0/1/2, passes QA, and is byte-deterministic (two builds,
// one hash); every asset lives in recipes/<name>/<name>.ts with a README.md dossier, and its
// committed out/<asset>/manifest.json matches a fresh compile. This is "the gallery is green".

import { loadAssets } from '../src/cli/load.ts';
import { type CompiledAsset, compile, type Lod } from '../src/core/index.ts';
import { toGlb } from '../src/export/index.ts';
import { runLodQa, runQa } from '../src/qa/index.ts';
import { recipeFolders, report, type Violation } from './lib/files.ts';

const violations: Violation[] = [];
const rows: { asset: string; triangles: number[] }[] = [];
const { folders, stray } = await recipeFolders();
for (const file of stray)
  violations.push({
    file,
    line: 1,
    message: 'not an asset folder: recipes hold recipes/<name>/<name>.ts',
    fix: `move it to recipes/<name>/<name>.ts, or into recipes/_lib/ if it is a shared helper`,
  });
for (const { dir, file } of folders) {
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
    rows.push({ asset: asset.name, triangles });
  }
}
const json = process.argv.includes('--json');
if (!json)
  for (const r of rows) console.log(`  ${r.asset.padEnd(20)} tris ${r.triangles.join('/')}`);
process.exitCode = report(`recipes (${rows.length})`, violations, json);

/** The committed out/<asset>/ must exist and describe what the recipe compiles to today. */
async function staleOutputs(
  dir: string,
  file: string,
  name: string,
  triangles: readonly number[],
): Promise<Violation[]> {
  const fix = `bun run shots ${dir.slice('recipes/'.length)}  (then commit ${dir}/out/)`;
  const path = `${dir}/out/${name}/manifest.json`;
  const f = Bun.file(path);
  if (!(await f.exists()) || !(await Bun.file(`${dir}/out/${name}/hero.png`).exists()))
    return [
      {
        file,
        line: 1,
        message: `${name}: no committed hero.png + manifest.json in ${dir}/out/${name}/`,
        fix,
      },
    ];
  const committed = ((await f.json()) as { triangles?: number[] }).triangles ?? [];
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
