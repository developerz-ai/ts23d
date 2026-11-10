// Gate: every recipe compiles at LOD 0/1/2, passes QA, and is byte-deterministic (two builds,
// one hash); every asset lives in recipes/<name>/<name>.ts with a README.md dossier, and its
// committed out/<asset>/{manifest.json,hero.png,sheet.png} match fresh deterministic output, and carries a fresh critique.json
// scored ≥ CRITIQUE_MIN_SCORE (warn-only while CRITIQUE_MODE = 'warn'). "The gallery is green".

import { loadAssets } from '../src/cli/load.ts';
import { manifestOf } from '../src/cli/manifest.ts';
import { type Asset, type CompiledAsset, compile, type Lod } from '../src/core/index.ts';
import { toGlb } from '../src/export/index.ts';
import { DEFAULT_SHEET, paintTrimSheet } from '../src/material/index.ts';
import { runLodQa, runQa } from '../src/qa/index.ts';
import { beauty, contactSheet } from '../src/render/index.ts';
import { CRITIQUE_MODE, critiqueViolations, warnCritiques } from './lib/critique.ts';
import { recipeFolders, report, tsFiles, type Violation } from './lib/files.ts';
import { crossRecipeImports } from './lib/recipe-imports.ts';
import { CURRENT_SHARD, inShard } from './lib/shard.ts';

export async function recipesGate(): Promise<number> {
  const violations: Violation[] = [];
  const critiques: Violation[] = [];
  const rows: { asset: string; triangles: number[] }[] = [];
  const { folders, stray } = await recipeFolders();
  // `shots` runs `hero` with the default 2048px trim sheet; paint it once for identical bytes.
  const sheet = paintTrimSheet({ ...DEFAULT_SHEET, size: 2048 });
  for (const file of stray)
    violations.push({
      file,
      line: 1,
      message:
        "not an asset folder: recipes hold recipes/<name>/<name>.ts plus that folder's modules",
      fix: `move it to recipes/<name>/<name>.ts, or into recipes/_lib/ if it is a shared helper`,
    });
  for (const f of await tsFiles('recipes'))
    violations.push(...crossRecipeImports(f, await Bun.file(f).text()));
  for (const { dir, file } of inShard(folders, CURRENT_SHARD)) {
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
        triangles.push(
          a.parts.reduce((sum, part) => sum + (part.mesh ? part.mesh.indices.length / 3 : 0), 0),
        );
        for (const finding of runQa(a))
          violations.push({
            file,
            line: 1,
            message: `${asset.name} LOD${lod} ${finding.gate}${finding.part ? ` [${finding.part}]` : ''}: ${finding.message}`,
            fix: finding.fix,
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
      for (const finding of runLodQa(lods))
        violations.push({
          file,
          line: 1,
          message: `${asset.name} ${finding.gate}${finding.part ? ` [${finding.part}]` : ''}: ${finding.message}`,
          fix: finding.fix,
        });
      const fresh = freshOutputs(asset, lods, dir, sheet);
      violations.push(...(await staleOutputs(dir, file, asset.name, fresh)));
      critiques.push(...(await critiqueViolations(dir, file, asset.name)));
      rows.push({ asset: asset.name, triangles });
    }
  }
  const json = process.argv.includes('--json');
  if (CRITIQUE_MODE === 'enforce') violations.push(...critiques);
  else warnCritiques(critiques);
  if (!json)
    for (const row of rows)
      console.log(`  ${row.asset.padEnd(20)} tris ${row.triangles.join('/')}`);
  return report(`recipes (${rows.length})`, violations, json);
}

if (import.meta.main) process.exitCode = await recipesGate();

/** Fresh bytes produced by `t3d shot` and `t3d hero` with their default options. */
function freshOutputs(
  asset: Asset,
  lods: readonly CompiledAsset[],
  dir: string,
  sheet: ReturnType<typeof paintTrimSheet>,
): Readonly<Record<string, Uint8Array>> {
  const [lod0, , lod2] = lods;
  if (!lod0 || !lod2) throw new Error('recipes gate requires LOD0 and LOD2');
  const out = `${dir}/out/${asset.name}`;
  const findings = lods.flatMap((lod) =>
    runQa(lod).map((finding) => ({ ...finding, message: `LOD${lod.lod}: ${finding.message}` })),
  );
  return {
    'manifest.json': new TextEncoder().encode(
      `${JSON.stringify(
        manifestOf(
          asset,
          lods,
          {
            lods: [],
            sheet: `${out}/sheet.png`,
            thumb: `${out}/thumb.png`,
          },
          findings,
        ),
        null,
        2,
      )}
`,
    ),
    'hero.png': beauty(lod0, { sheet }),
    'sheet.png': contactSheet(lod0, { far: lod2 }),
  };
}

/** The committed out/<asset>/ must byte-match fresh deterministic recipe output. */
export async function staleOutputs(
  dir: string,
  file: string,
  name: string,
  fresh: Readonly<Record<string, Uint8Array>>,
): Promise<Violation[]> {
  const fix = `bun run shots ${dir.slice('recipes/'.length)}  (then commit ${dir}/out/)`;
  const out = `${dir}/out/${name}`;
  const stale: string[] = [];
  for (const name of ['manifest.json', 'hero.png', 'sheet.png']) {
    const committed = Bun.file(`${out}/${name}`);
    if (!(await committed.exists())) stale.push(`${name} is missing`);
    else if (!sameBytes(await committed.bytes(), fresh[name] ?? new Uint8Array()))
      stale.push(`${name} differs`);
  }
  return stale.length
    ? [
        {
          file,
          line: 1,
          message: `${name}: committed outputs are stale (${stale.join('; ')})`,
          fix,
        },
      ]
    : [];
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}
