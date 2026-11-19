// Build assets without the CLI: the library is plain TypeScript, so a script is all you need.
// Run: bun examples/build-with-bun.ts [out-dir]. This file and the `t3d` CLI need Bun; the library
// itself also imports under Node ≥ 22 (the published dist/, proven by scripts/pack-smoke.ts).
// Pick exactly what you want — which LODs, textures or not, QA or not, sheets or not.

import {
  compile,
  contactSheet,
  DEFAULT_SHEET,
  type Lod,
  runQa,
  sheetFor,
  toGlb,
} from '@developerz.ai/ts23d';
import { tiger_1 } from '../recipes/tiger_1/tiger_1.ts';

const out = process.argv[2] ?? 'out/example';
const asset = tiger_1;
const lods: Lod[] = [0, 2]; // near + far only — your call
const compiled = lods.map((lod) => compile(asset, { lod }));

// Textures are optional. One sheet per asset: the built-in strips plus the project materials
// this asset maps onto, painted once for every LOD you export (they share it).
const sheet = sheetFor(compiled, { ...DEFAULT_SHEET, size: 512 });

for (const c of compiled) {
  // QA is a function too: gate however your pipeline wants.
  const findings = runQa(c);
  if (findings.length > 0) {
    for (const f of findings) console.error(`LOD${c.lod} ${f.gate}: ${f.message}\n  fix: ${f.fix}`);
    process.exit(1);
  }

  await Bun.write(`${out}/${asset.name}.lod${c.lod}.glb`, toGlb(c, { sheet, animations: true }));
}

// The six-view contact sheet (from LOD0, the first compiled), for you or your agent to look at.
const near = compiled[0];
if (near) await Bun.write(`${out}/${asset.name}.png`, contactSheet(near, { sheet }));
console.log(`✔ ${asset.name}: LOD ${lods.join(', ')} + contact sheet → ${out}/`);
