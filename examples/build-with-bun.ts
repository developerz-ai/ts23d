// Build assets without the CLI: the library is plain TypeScript, so a script is all you need.
// Run: bun examples/build-with-bun.ts [out-dir]   (Node ≥ 22 works too, against the built dist/)
// Pick exactly what you want — which LODs, textures or not, QA or not, sheets or not.

import {
  compile,
  contactSheet,
  DEFAULT_SHEET,
  type Lod,
  paintTrimSheet,
  runQa,
  toGlb,
} from '@developerz-ai/ts23d';
import { tiger_1 } from '../recipes/tiger_1.ts';

const out = process.argv[2] ?? 'out/example';
const asset = tiger_1;
const lods: Lod[] = [0, 2]; // near + far only — your call

// Textures are optional: paint once, embed (or pass { external: true } and ship the PNGs).
const sheet = paintTrimSheet({ ...DEFAULT_SHEET, size: 512 });

for (const lod of lods) {
  const compiled = compile(asset, { lod });

  // QA is a function too: gate however your pipeline wants.
  const findings = runQa(compiled);
  if (findings.length > 0) {
    for (const f of findings) console.error(`LOD${lod} ${f.gate}: ${f.message}\n  fix: ${f.fix}`);
    process.exit(1);
  }

  await Bun.write(
    `${out}/${asset.name}.lod${lod}.glb`,
    toGlb(compiled, { sheet, animations: true }),
  );
}

// The six-view contact sheet, for you or your agent to look at.
await Bun.write(`${out}/${asset.name}.png`, contactSheet(compile(asset, { lod: 0 })));
console.log(`✔ ${asset.name}: LOD ${lods.join(', ')} + contact sheet → ${out}/`);
