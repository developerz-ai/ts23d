// Determinism and snapshot helpers: the GLB an asset compiles to, hashed. Pin a hash in a test to
// catch any unintended geometry change; compile twice to prove the recipe has no ambient state.
// The determinism check exports with baked clips and an embedded trim sheet painted per build, so
// a motion (an rps from Math.random) or sheet pixels that differ fail it, not just geometry.

import { type Asset, compile, type Lod, Ts23dError } from '../core/index.ts';
import { exportGlb, type GlbOptions } from '../export/index.ts';
import { DEFAULT_SHEET, paintTrimSheet } from '../material/index.ts';
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

/** Compile + export (clips + embedded 512² trim sheet) twice per LOD; the bytes must match. */
export function assertDeterministic(asset: Asset, o: LodOptions = {}): void {
  const seed = o.seed !== undefined ? { seed: o.seed } : {};
  // One sheet per build, like two separate `t3d build` runs; the smallest size keeps it ~0.2 s.
  const paint = () => paintTrimSheet({ ...DEFAULT_SHEET, size: 512 });
  const [first, second] = [paint(), paint()];
  for (const lod of o.lods ?? ALL_LODS) {
    const once = snapshotHash(asset, { lod, ...seed, glb: { animations: true, sheet: first } });
    const twice = snapshotHash(asset, { lod, ...seed, glb: { animations: true, sheet: second } });
    if (once !== twice)
      throw new Ts23dError('T3D_QA_FAILED', {
        cause: `${asset.name} LOD${lod} is not byte-deterministic (${once} vs ${twice}): geometry, motion clips or trim sheet differ between two builds`,
        fix: 'remove ambient state from build() and motion: read ctx.rng/ctx.seed only — no Math.random, Date, or module-level counters',
      });
  }
}
