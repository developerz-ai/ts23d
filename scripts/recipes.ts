// Gate: every recipe compiles at LOD 0/1/2, passes QA, and is byte-deterministic (two builds,
// one hash). This is what "the gallery is green" means.

import { loadAssets } from '../src/cli/load.ts';
import { compile, type Lod } from '../src/core/index.ts';
import { toGlb } from '../src/export/index.ts';
import { runQa } from '../src/qa/index.ts';
import { report, tsFiles, type Violation } from './lib/files.ts';

const violations: Violation[] = [];
const rows: { asset: string; triangles: number[] }[] = [];
for (const file of await tsFiles('recipes')) {
  for (const asset of await loadAssets(file)) {
    const triangles: number[] = [];
    for (const lod of [0, 1, 2] as Lod[]) {
      const a = compile(asset, { lod });
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
    rows.push({ asset: asset.name, triangles });
  }
}
const json = process.argv.includes('--json');
if (!json)
  for (const r of rows) console.log(`  ${r.asset.padEnd(20)} tris ${r.triangles.join('/')}`);
process.exitCode = report(`recipes (${rows.length})`, violations, json);
