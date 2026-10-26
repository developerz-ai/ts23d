// Shader hooks: per-asset effects that stay on the one shared material (wind sway, window glow,
// wear). Emitted as glTF extras the engine adapter maps onto its own shader system.

import { notImplemented } from '../core/index.ts';

export interface ShaderHints {
  /** Vertex attribute channel carrying wind weight (vegetation). */
  readonly wind?: { readonly strength: number };
  /** Emissive mask on window cells at night. */
  readonly windowGlow?: { readonly color: string; readonly ratio: number };
}

/** Three.js TSL node graph for the trim-sheet material + hints. Planned: M3. */
export function threeMaterialSource(_hints: ShaderHints = {}): string {
  return notImplemented('threeMaterialSource (TSL trim-sheet material)');
}
