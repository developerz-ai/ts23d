// Texture credits into the GLB: when an asset samples an image strip (a CC0 texture set registered
// with defineMaterial), its credit line joins the XMP packet's `dc:contributor`. Assets that use
// only procedural strips get no change, so their bytes stay identical.

import type { CompiledAsset } from '../core/index.ts';
import { stripCredits } from '../material/index.ts';
import type { GlbMeta } from './metadata.ts';

export function creditsOf(asset: CompiledAsset): string[] {
  const out = new Set<string>();
  for (const p of asset.parts) {
    const uv = p.mesh?.uvs;
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
