// Wear slots in the GLB: a part painted with a `wear: true` slot is cut into its paint triangles
// (the part, still `paint: slot`, mapped to every livery) and its bare ones (a child
// `<part>_bare`, unpainted: the plain trim material, COLOR_0 = the wear's own colour, which no
// KHR_materials_variants mapping reaches). The child sits at the part's pivot and never moves on
// its own, so merging puts it in the pivot's trim-sheet mesh: no draw call of its own when the
// pivot already has unpainted geometry. Assets without a wear slot pass through untouched.

import { type CompiledAsset, type Part, splitWear, Ts23dError } from '../core/index.ts';

export function splitWornParts(asset: CompiledAsset): CompiledAsset {
  const set = asset.paintSet;
  const wear = set?.wear;
  if (!set || !wear?.length) return asset;
  const names = new Set(asset.parts.map((p) => p.name));
  const parts: Part[] = [];
  for (const p of asset.parts) {
    const slot = p.paint !== undefined && wear.includes(p.paint) ? set.paint[p.paint] : undefined;
    if (!p.mesh || !slot) {
      parts.push(p);
      continue;
    }
    const { paint, bare } = splitWear(p.mesh, slot);
    if (!bare) {
      parts.push(p);
      continue;
    }
    // An all-bare part is simply unpainted (its node, pivot and children stay as they are).
    const { paint: _slot, ...plain } = p;
    if (!paint) {
      parts.push({ ...plain, mesh: bare });
      continue;
    }
    const name = `${p.name}_bare`;
    if (names.has(name))
      throw new Ts23dError('T3D_RECIPE_INVALID', {
        cause: `'${asset.name}' has a part '${name}' and the worn part '${p.name}' of wear slot '${p.paint}' exports its bare triangles under that name`,
        fix: `rename the part '${name}' ('<part>_bare' is generated for wear-slot parts)`,
      });
    parts.push({ ...p, mesh: paint });
    parts.push({ name, mesh: bare, at: [0, 0, 0], parent: p.name, yaw: 0, motion: null });
  }
  return { ...asset, parts };
}
