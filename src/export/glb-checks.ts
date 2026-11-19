// Input checks of the GLB writer: glow rules, the LOD list of a single-file export, and mesh
// attribute arrays that must match their vertex count before merging reads them (QA reports the
// same as `mesh-arrays`; this is the export's own lock for callers that skip QA).

import { type CompiledAsset, type Mesh, Ts23dError } from '../core/index.ts';
import type { GlowRule } from './materials.ts';

export function checkGlow(rules: readonly GlowRule[]): void {
  for (const r of rules)
    if ((r.strength ?? 4) < 0 || (r.color ?? [0, 0, 0]).some((c) => c < 0 || c > 1))
      throw new Ts23dError('T3D_RECIPE_INVALID', {
        cause: `glow rule for ${JSON.stringify(r.parts)} has a colour outside 0..1 or a negative strength`,
        fix: 'colour is linear 0..1 (hex() converts sRGB); brightness goes in `strength`',
      });
}

export function checkLods(lods: readonly CompiledAsset[]): void {
  const names = new Set(lods.map((l) => l.name));
  const levels = lods.map((l) => l.lod);
  if (
    lods.length === 0 ||
    names.size !== 1 ||
    levels.some((l, i) => i > 0 && l <= (levels[i - 1] ?? 0))
  )
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `exportLodGlb got LODs [${levels.join(', ')}] of [${[...names].join(', ')}]`,
      fix: 'pass compile(asset, { lod }) results of ONE asset, highest detail first: LOD0, LOD1, LOD2',
    });
  const preview = lods.find((l) => l.variant !== undefined);
  if (preview)
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `exportLodGlb got '${preview.name}' compiled as variant '${preview.variant}'`,
      fix: 'export compile(asset, { lod }) without `variant`: the GLB carries every variant',
    });
}

/** Normals, uvs and colours of the vertex count, whole triangles: else a typed-array RangeError. */
export function checkMeshArrays(m: Mesh, label: string): void {
  const verts = m.positions.length / 3;
  const wrong = [
    Number.isInteger(verts) ? '' : `positions ${m.positions.length}`,
    m.normals.length === m.positions.length ? '' : `normals ${m.normals.length}`,
    m.uvs.length === Math.floor(verts) * 2 ? '' : `uvs ${m.uvs.length}`,
    m.colors.length === m.positions.length ? '' : `colors ${m.colors.length}`,
    m.indices.length % 3 === 0 ? '' : `indices ${m.indices.length}`,
  ].filter((w) => w !== '');
  if (wrong.length)
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `${label} (${Math.floor(verts)} vertices) has attribute arrays of the wrong length: ${wrong.join(', ')}`,
      fix: 'run QA first (the mesh-arrays gate names it); a Mesh needs 3 normals, 2 uvs and 3 colours per vertex and 3 indices per triangle',
    });
}
