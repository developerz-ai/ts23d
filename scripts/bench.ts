// Measures every gallery recipe — triangles per LOD, compile+QA time, GLB bytes, parts, materials
// (draw calls) — and, with --write, replaces the README block between the bench markers.
// Numbers in docs come from this command, never from memory.
//   bun run bench [--json] [--write]

import { loadAssets } from '../src/cli/load.ts';
import { compile, type Lod } from '../src/core/index.ts';
import { mergeToPivots, toGlb } from '../src/export/index.ts';
import { runQa } from '../src/qa/index.ts';
import { tsFiles } from './lib/files.ts';

interface Row {
  asset: string;
  triangles: number[];
  kib: number[];
  parts: number;
  animated: number;
  drawCalls: number;
  ms: number;
  qa: 'PASS' | 'FAIL';
}

const rows: Row[] = [];
for (const file of await tsFiles('recipes')) {
  for (const asset of await loadAssets(file)) {
    const t0 = performance.now();
    const lods = ([0, 1, 2] as Lod[]).map((lod) => compile(asset, { lod }));
    const findings = lods.flatMap((a) => runQa(a));
    const glbs = lods.map((a) => toGlb(a));
    const ms = performance.now() - t0;
    const top = lods[0];
    rows.push({
      asset: asset.name,
      triangles: lods.map((a) =>
        a.parts.reduce((s, p) => s + (p.mesh ? p.mesh.indices.length / 3 : 0), 0),
      ),
      kib: glbs.map((g) => Math.round(g.byteLength / 1024)),
      parts: top?.parts.length ?? 0,
      animated: top?.parts.filter((p) => p.motion).length ?? 0,
      drawCalls: top ? mergeToPivots(top).parts.filter((p) => p.mesh).length : 0,
      ms: Math.round(ms),
      qa: findings.length === 0 ? 'PASS' : 'FAIL',
    });
  }
}

const table = [
  '| asset | tris LOD0 / 1 / 2 | GLB KiB LOD0 / 1 / 2 | parts | animated | draw calls (1 material) | compile + QA, 3 LODs | QA |',
  '|---|---|---|---|---|---|---|---|',
  ...rows.map(
    (r) =>
      `| \`${r.asset}\` | ${r.triangles.join(' / ')} | ${r.kib.join(' / ')} | ${r.parts} | ${r.animated} | ${r.drawCalls} | ${r.ms} ms | ${r.qa} |`,
  ),
].join('\n');

if (process.argv.includes('--json')) console.log(JSON.stringify({ ok: true, data: rows }));
else console.log(table);

if (process.argv.includes('--write')) {
  const readme = await Bun.file('README.md').text();
  const start = '<!-- bench:start -->';
  const end = '<!-- bench:end -->';
  if (!readme.includes(start) || !readme.includes(end)) {
    console.error(
      `T3D_BENCH: README.md has no ${start} … ${end} block\n  fix: add the two markers where the table belongs`,
    );
    process.exit(1);
  }
  const block = `${start}\n_Measured by \`bun run bench\` on ${Bun.version} (Bun)._\n\n${table}\n${end}`;
  await Bun.write('README.md', readme.replace(new RegExp(`${start}[\\s\\S]*?${end}`), block));
  console.log('✔ README bench block updated');
}
