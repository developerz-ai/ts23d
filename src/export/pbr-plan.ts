// Named finishes → glTF materials for the GLB writer: one material per finish the asset declares
// AND some part uses (sheen, anisotropy, iridescence, clearcoat, specular), appended after the
// paint materials so assets without finishes keep their material indices and bytes.

import type { CompiledAsset } from '../core/index.ts';
import type { Json } from './bin-writer.ts';
import { finishMaterial } from './materials.ts';

export interface FinishPlan {
  readonly materials: readonly Json[];
  /** Finish name → material index. */
  readonly index: ReadonlyMap<string, number>;
}

export function finishPlan(
  lods: readonly CompiledAsset[],
  start: number,
  withSheet: boolean,
): FinishPlan {
  const declared = lods[0]?.finishes ?? {};
  const used = new Set(lods.flatMap((l) => l.parts.flatMap((p) => (p.finish ? [p.finish] : []))));
  const names = Object.keys(declared).filter((n) => used.has(n));
  const materials: Json[] = [];
  const index = new Map<string, number>();
  for (const n of names) {
    const f = declared[n];
    if (!f) continue;
    index.set(n, start + materials.length);
    materials.push(finishMaterial(n, f, withSheet));
  }
  return { materials, index };
}
