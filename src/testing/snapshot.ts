// Determinism and snapshot helpers: the GLB an asset compiles to, hashed. Pin a hash in a test to
// catch any unintended geometry change; compile twice to prove the recipe has no ambient state.

import { type Asset, compile, type Lod, Ts23dError } from '../core/index.ts';
import { exportGlb, type GlbOptions } from '../export/index.ts';
import type { LodOptions } from './compiled.ts';
import { ALL_LODS } from './compiled.ts';
import { hashBytes } from './hash.ts';

export interface SnapshotOptions {
  readonly lod?: Lod;
  readonly seed?: number;
  /** Exporter options; default the plain optimised GLB (no textures, no clips). */
  readonly glb?: GlbOptions;
}

/** 16-hex-digit content hash of the asset's GLB at one LOD. */
export function snapshotHash(asset: Asset, o: SnapshotOptions = {}): string {
  const a = compile(asset, {
    lod: o.lod ?? 0,
    ...(o.seed !== undefined ? { seed: o.seed } : {}),
  });
  return hashBytes(exportGlb(a, o.glb ?? {}).glb);
}

/** Compile + export twice per LOD; the bytes must match. */
export function assertDeterministic(asset: Asset, o: LodOptions = {}): void {
  for (const lod of o.lods ?? ALL_LODS) {
    const once = snapshotHash(asset, { lod, ...(o.seed !== undefined ? { seed: o.seed } : {}) });
    const twice = snapshotHash(asset, { lod, ...(o.seed !== undefined ? { seed: o.seed } : {}) });
    if (once !== twice)
      throw new Ts23dError('T3D_QA_FAILED', {
        cause: `${asset.name} LOD${lod} is not byte-deterministic (${once} vs ${twice})`,
        fix: 'remove ambient state from build(): read ctx.rng/ctx.seed only — no Math.random, Date, or module-level counters',
      });
  }
}
