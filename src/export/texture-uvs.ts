// What a textured part's UVs must be for its own set (ADR 016) to show: a normal map needs a UV
// layout to build tangents from (an error: the map cannot be decoded without one), and a baked
// atlas is addressed inside 0..1 (a warning: the sampler repeats, so a UV more than a texel
// outside the square wraps onto another island's pixels, which is what an unconverted UDIM tile
// or a V-flipped import looks like).

import { type CompiledAsset, type Mesh, pngHeader, Ts23dError } from '../core/index.ts';
import type { ExportWarning } from './glb-options.ts';

/** Vertices whose UV leaves 0..1 by more than one texel of a `size`² map. */
export function uvsOutside(mesh: Mesh, size: number): number {
  const texel = 1 / Math.max(1, size);
  let n = 0;
  for (let i = 0; i < mesh.uvs.length; i += 2) {
    const u = mesh.uvs[i] ?? 0;
    const v = mesh.uvs[i + 1] ?? 0;
    if (u < -texel || u > 1 + texel || v < -texel || v > 1 + texel) n++;
  }
  return n;
}

/** Some triangle spans UV area: there is a layout to build a tangent frame from. */
export function hasUvLayout(mesh: Mesh): boolean {
  const { uvs, indices } = mesh;
  if (uvs.length !== (mesh.positions.length / 3) * 2) return false;
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t] ?? 0, indices[t + 1] ?? 0, indices[t + 2] ?? 0];
    const du1 = (uvs[b * 2] ?? 0) - (uvs[a * 2] ?? 0);
    const dv1 = (uvs[b * 2 + 1] ?? 0) - (uvs[a * 2 + 1] ?? 0);
    const du2 = (uvs[c * 2] ?? 0) - (uvs[a * 2] ?? 0);
    const dv2 = (uvs[c * 2 + 1] ?? 0) - (uvs[a * 2 + 1] ?? 0);
    if (Math.abs(du1 * dv2 - du2 * dv1) > 1e-12) return true;
  }
  return false;
}

/** Throws for a normal-mapped part without a UV layout; returns one warning per stray-UV part. */
export function textureSetWarnings(lods: readonly CompiledAsset[]): ExportWarning[] {
  const out: ExportWarning[] = [];
  for (const l of lods)
    for (const p of l.parts) {
      const set = p.textures;
      if (!set || !p.mesh || p.mesh.indices.length === 0) continue;
      const where = `part '${p.name}' in '${l.name}' LOD${l.lod}`;
      if (set.normal && !hasUvLayout(p.mesh))
        throw new Ts23dError('T3D_TEXTURE_INVALID', {
          cause: `${where} has the normal map of texture set '${set.name}' but no UV layout (every triangle has zero UV area)`,
          fix: 'give the mesh the UVs the map was baked on (importModel keeps them; a Blender step unwraps before it bakes), or drop `normal` from the set',
        });
      const size = pngHeader(set.albedo)?.width ?? 1;
      const stray = uvsOutside(p.mesh, size);
      if (stray)
        out.push({
          code: 'T3D_TEXTURE_INVALID',
          message: `${where}: ${stray} of ${p.mesh.uvs.length / 2} vertices have UVs more than a texel outside 0..1 of texture set '${set.name}' (${size}²)`,
          fix: 'bake the part into one 0..1 atlas (no UDIM tiles) and keep glTF UVs (V down); UVs outside the square wrap onto other islands',
        });
    }
  return out;
}
