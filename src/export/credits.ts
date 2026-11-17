// Texture credits into the GLB: when an asset samples an image strip (a CC0 texture set registered
// with defineMaterial), its credit line joins the XMP packet's `dc:contributor`, and so does the
// `credit` of every texture set a part carries (ADR 016). Assets that use only procedural strips
// get no change, so their bytes stay identical.

import { type CompiledAsset, textureSetsOf } from '../core/index.ts';
import { stripCredits } from '../material/index.ts';
import type { GlbMeta } from './metadata.ts';

export function creditsOf(asset: CompiledAsset): string[] {
  const out = new Set<string>();
  for (const set of textureSetsOf(asset.parts)) if (set.credit) out.add(set.credit);
  for (const p of asset.parts) {
    // A textured part's UVs address its own set, not a strip of the sheet.
    const uv = p.textures ? undefined : p.mesh?.uvs;
    if (!uv) continue;
    const v = new Float32Array(uv.length >> 1);
    for (let i = 0; i < v.length; i++) v[i] = uv[i * 2 + 1] ?? 0;
    for (const c of stripCredits(v)) out.add(c);
  }
  return [...out].sort();
}

export function withCredits(asset: CompiledAsset, meta: GlbMeta | undefined): GlbMeta | undefined {
  const credits = creditsOf(asset);
  if (!credits.length) return meta;
  return { ...meta, credits: [...(meta?.credits ?? []), ...credits] };
}
