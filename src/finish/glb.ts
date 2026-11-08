// The finished asset as one GLB: LOD0 = the finished asset on the `ts23d_finish` material (its own
// atlas textures), LOD1/2 as MSFT_lod alternates on the trim sheet, exactly as compiled. Refuses a
// finish that failed finish QA unless `force` (then the provenance says so).

import type { CompiledAsset } from '../core/index.ts';
import { encodePng } from '../core/index.ts';
import { exportLodGlb, type GlbOptions, withFinishLayer } from '../export/index.ts';
import { assertFinish, type FinishResult } from './finish.ts';

export interface FinishPngs {
  readonly albedo: Uint8Array;
  readonly orm: Uint8Array;
  readonly normal: Uint8Array;
  readonly base: Uint8Array;
}

export function finishPngs(r: FinishResult): FinishPngs {
  const n = r.maps.size;
  return {
    albedo: encodePng(n, n, r.maps.albedo),
    orm: encodePng(n, n, r.maps.orm),
    normal: encodePng(n, n, r.maps.normal),
    base: encodePng(n, n, r.maps.base),
  };
}

export function finishedGlb(
  r: FinishResult,
  lower: readonly CompiledAsset[],
  o: GlbOptions & { readonly force?: boolean } = {},
): Uint8Array {
  if (!o.force) assertFinish(r);
  const { force: _force, ...glb } = o;
  const pngs = finishPngs(r);
  return withFinishLayer(exportLodGlb([r.asset, ...lower], glb).glb, {
    albedo: pngs.albedo,
    orm: pngs.orm,
    normal: pngs.normal,
    provenance: {
      ...r.provenance,
      quality: 'hero',
      ...(r.findings.length ? { forced: r.findings.map((f) => `${f.code}: ${f.message}`) } : {}),
    },
  });
}
