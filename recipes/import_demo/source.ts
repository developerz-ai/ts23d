// The import, declared like a vendored input: where the file is, its sha256, licence, author and
// source — then the import → clean → simplify chain, once per process for all three LODs (LOD1
// simplifies LOD0's result, LOD2 LOD1's: the same chain whichever LOD compiles first).
// To use a real CC0 head (MakeHuman/MPFB export), see ./README.md › Swap in a real scan.

import {
  type ImportedMesh,
  type ImportSource,
  importGlb,
  type Mesh,
  simplify,
} from '@developerz.ai/ts23d';
import { scanGlb } from './scan.ts';

export const SCAN: ImportSource = {
  // Written by `bun scripts/import.ts fixture`; the build reads the same bytes from scanGlb().
  path: 'tmp/import/scan.glb',
  sha256: 'bdb0c920bc70a4c41fa7c9fe1748c8b01a54a2c707553058985baeea12a5acee',
  license: 'CC0-1.0',
  author: 'ts23d contributors (procedural stand-in scan, recipes/import_demo/scan.ts)',
  url: 'https://github.com/developerz-ai/ts23d/tree/main/recipes/import_demo',
};

/** Triangle budget of the imported head per LOD. */
export const HEAD_TRIS = [12000, 4000, 1200] as const;

let imported: ImportedMesh | null = null;
const lods: Mesh[] = [];

/** The cleaned import (bytes: the stand-in generator; a real file comes from the import cache). */
export function scan(): ImportedMesh {
  imported ??= importGlb(
    { ...SCAN, bytes: scanGlb() },
    // The scan is registered to the bust already (metres, glTF frame): keep its placement.
    { place: 'origin', clean: { minShellTris: 32, maxHoleEdges: 8 } },
  );
  return imported;
}

/** The head at LOD `lod`: QEM-simplified to HEAD_TRIS, seams and the neck cut preserved. */
export function headLod(lod: 0 | 1 | 2): Mesh {
  for (let l = lods.length; l <= lod; l++) {
    const from = l === 0 ? scan().mesh : (lods[l - 1] ?? scan().mesh);
    lods.push(simplify(from, { targetTris: HEAD_TRIS[l] ?? 1200 }).mesh);
  }
  return lods[lod] ?? scan().mesh;
}
