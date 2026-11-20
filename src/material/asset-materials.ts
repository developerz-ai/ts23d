// Which project materials an asset maps onto: what its trim sheet must hold (asset-sheet.ts).
// Three sources, in order of trust. (1) What the compile recorded (`CompiledAsset.materials`):
// every `stripRect` asked inside build() and every material a part's mesh brought with it
// (`Mesh.mapped`, written by whatever mapped its UVs, wherever that ran; D354). (2) A mesh that
// names no material for a custom row it samples (UVs written by hand, or a copy that dropped
// `mapped`) on a row the compile recorded: the recorded material, unless a module-level mesh was
// mapped onto ANOTHER material of that row, because this may be that mesh with its record lost:
// T3D_MATERIAL_UNKNOWN, never a silent guess. (3) Such a mesh on a row the compile did not
// record: the one defined material holding the row, else T3D_MATERIAL_UNKNOWN.

import { type CompiledAsset, type MaterialUse, type Part, Ts23dError } from '../core/index.ts';
import { materialGeneration } from './define.ts';
import { rowsSampled } from './rows-sampled.ts';
import { customIds, idsOnRow, outsideCount, outsideOnRow } from './slots.ts';
import { STRIP_ROWS, STRIPS } from './trim-sheet.ts';

export type Compiled = CompiledAsset | readonly CompiledAsset[];
export const listOf = (a: Compiled): readonly CompiledAsset[] => ('parts' in a ? [a] : a);

const quoted = (ids: readonly string[]): string => ids.map((id) => `'${id}'`).join(', ');

/** Custom rows (0-based among them) the part samples without its mesh naming a material there. */
function unnamedRows(p: Part): number[] {
  // A textured part's UVs address its own set (ADR 016), not the sheet.
  if (!p.mesh || p.textures) return [];
  const uv = p.mesh.uvs;
  const vs = new Float32Array(uv.length >> 1);
  for (let i = 0; i < vs.length; i++) vs[i] = uv[i * 2 + 1] ?? 0;
  const named = new Set((p.mesh.mapped ?? []).map((u) => u.row));
  const out: number[] = [];
  for (const row of rowsSampled(vs, p.mesh.indices)) {
    const custom = row - STRIPS.length;
    if (row >= STRIPS.length && row < STRIP_ROWS && !named.has(custom)) out.push(custom);
  }
  return out;
}

const memo = new WeakMap<CompiledAsset, { at: string; uses: readonly MaterialUse[] }>();

function usesOf(asset: CompiledAsset): readonly MaterialUse[] {
  const at = `${materialGeneration()}|${outsideCount()}`;
  const hit = memo.get(asset);
  if (hit?.at === at) return hit.uses;
  const recorded = new Map((asset.materials ?? []).map((u) => [u.row, u.id]));
  const byRow = new Map(recorded);
  /** Materials of module-level meshes on a recorded row, other than the recorded one. */
  const rivals = (row: number): string[] =>
    outsideOnRow(row).filter((id) => id !== recorded.get(row));
  // Nothing defined beyond what the compile recorded and no rival: no row can name another.
  const open = customIds().length > recorded.size;
  if (open || [...recorded.keys()].some((row) => rivals(row).length > 0))
    for (const p of asset.parts)
      for (const row of unnamedRows(p)) {
        const held = recorded.get(row);
        if (held !== undefined) {
          const other = rivals(row);
          if (other.length > 0)
            throw new Ts23dError('T3D_MATERIAL_UNKNOWN', {
              cause: `part '${p.name}' of asset '${asset.name}' maps into custom strip row ${row}, which this asset holds for '${held}', but its mesh does not say which material its UVs were mapped with, and a mesh built outside every build() was mapped onto ${quoted(other)} on the same row: if this part is that mesh (copied by code that dropped \`mapped\`), it would be painted as '${held}'`,
              fix: `say what the part's UVs map onto: mappedOnto(mesh, '${held}'), or keep \`mapped\` when copying a mesh ({ ...mesh, uvs }). If it is meant to show '${other[0]}', mappedOnto(mesh, '${other[0]}') and give that material a row this asset leaves free: defineMaterial({ id: '${other[0]}', row: … })`,
            });
          continue;
        }
        if (!open || byRow.has(row)) continue;
        const [only, ...more] = idsOnRow(row);
        if (only !== undefined && more.length === 0) byRow.set(row, only);
        else if (only !== undefined)
          throw new Ts23dError('T3D_MATERIAL_UNKNOWN', {
            cause: `asset '${asset.name}' maps into custom strip row ${row} with a mesh built outside its build(), and ${quoted([only, ...more])} all hold that row: which one it meant is not recorded`,
            fix: "build the mesh inside build() or a definePart (the compile then records the material it maps onto), not in a module-level constant; or say what hand-written UVs map onto: mappedOnto(mesh, '<id>')",
          });
      }
  const uses = [...byRow].sort((a, b) => a[0] - b[0]).map(([row, id]) => ({ id, row }));
  memo.set(asset, { at, uses });
  return uses;
}

/**
 * The project materials an asset maps onto, in row order. Pass every LOD you export together:
 * they share one sheet, so two LODs with different materials on one row are a conflict.
 */
export function materialsOf(assets: Compiled): readonly string[] {
  const byRow = new Map<number, string>();
  for (const a of listOf(assets))
    for (const u of usesOf(a)) {
      const held = byRow.get(u.row);
      if (held !== undefined && held !== u.id)
        throw new Ts23dError('T3D_MATERIAL_CONFLICT', {
          cause: `asset '${a.name}' maps onto '${held}' at one LOD and '${u.id}' at another, and both hold custom strip row ${u.row}: its LODs share one trim sheet`,
          fix: `give one of them a row the asset leaves free: defineMaterial({ id: '${u.id}', row: … })`,
        });
      byRow.set(u.row, u.id);
    }
  return [...byRow].sort((a, b) => a[0] - b[0]).map(([, id]) => id);
}
