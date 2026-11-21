// Texture credits into the GLB: when an asset samples an image strip (a CC0 texture set registered
// with defineMaterial), its credit line joins the XMP packet's `dc:contributor`, and so does the
// `credit` of every texture set a part carries (ADR 016). Assets that use only procedural strips
// get no change, so their bytes stay identical.

import { type CompiledAsset, type Part, textureSetsOf } from '../core/index.ts';
import { materialsOf, stripCredits } from '../material/index.ts';
import type { GlbMeta } from './metadata.ts';

/**
 * Credits of the image strips one part's UVs sample among the asset's materials `own`. A textured
 * part's UVs address its own set; a finished or hero part's its layer's atlas, so it brings the
 * credits recorded before it was unwrapped (`atlasCredits`, D535).
 */
export function partCredits(p: Part, own: readonly string[]): readonly string[] {
  if (p.atlas) return p.atlasCredits ?? [];
  const uv = p.textures ? undefined : p.mesh?.uvs;
  if (!uv) return [];
  const v = new Float32Array(uv.length >> 1);
  for (let i = 0; i < v.length; i++) v[i] = uv[i * 2 + 1] ?? 0;
  return stripCredits(v, p.mesh?.indices, own);
}

export function creditsOf(asset: CompiledAsset): string[] {
  const out = new Set<string>();
  // Several defined materials may hold one row: only this asset's own is on its sheet (D299).
  const own = materialsOf(asset);
  for (const set of textureSetsOf(asset.parts)) if (set.credit) out.add(set.credit);
  for (const p of asset.parts) for (const c of partCredits(p, own)) out.add(c);
  return [...out].sort();
}

/** `lods`: every LOD in the file (a texture set used only on a lower LOD is credited too). */
export function withCredits(
  asset: CompiledAsset,
  meta: GlbMeta | undefined,
  lods: readonly CompiledAsset[] = [asset],
): GlbMeta | undefined {
  const credits = [...new Set(lods.flatMap(creditsOf))].sort();
  if (!credits.length) return meta;
  return { ...meta, credits: [...(meta?.credits ?? []), ...credits] };
}
