// assertLodSilhouette: the far LOD keeps the near LOD's outline. Renders orthographic silhouettes
// of LOD0 and the far LOD from the six axis views in LOD0's frame and compares them by IoU (after a
// small max-pool: from afar, sub-pixel slits close). A low IoU is what players see as LOD popping.
//   it('LOD2 keeps the outline', () => assertLodSilhouette(tank, 0.85));

import type { Asset, Lod } from '../core/index.ts';
import { maskIoU, poolMask, silhouette, viewFrame } from '../render/index.ts';
import { compileLods, failOn } from './compiled.ts';
import { ALL_AXIS_VIEWS, AXIS_VIEWS, type AxisView } from './image-views.ts';

export interface LodSilhouetteOptions {
  /** The LOD compared against LOD0. Default 2. */
  readonly lod?: Lod;
  readonly views?: readonly AxisView[];
  /** Silhouette size, pixels. Default 128. */
  readonly size?: number;
  /** Max-pool factor before comparing (1 = raw). Default 2. */
  readonly pool?: number;
  readonly seed?: number;
}

/** IoU per view of LOD0 vs the far LOD silhouette. */
export function lodSilhouetteIoU(
  asset: Asset,
  o: LodSilhouetteOptions = {},
): { view: AxisView; iou: number }[] {
  const far = o.lod ?? 2;
  const [near, other] = compileLods(asset, {
    lods: [0, far],
    ...(o.seed !== undefined ? { seed: o.seed } : {}),
  });
  if (!near || !other) return [];
  const size = o.size ?? 128;
  const f = o.pool ?? 2;
  return (o.views ?? ALL_AXIS_VIEWS).map((name) => {
    const view = AXIS_VIEWS[name];
    const frame = viewFrame(near, view);
    const a = poolMask(silhouette(near, view, size, frame), f);
    const b = poolMask(silhouette(other, view, size, frame), f);
    return { view: name, iou: maskIoU(a.mask, b.mask) };
  });
}

/** Every view's LOD0 ↔ far-LOD silhouette IoU ≥ `minIoU` (default 0.85). Returns the worst IoU. */
export function assertLodSilhouette(
  asset: Asset,
  minIoU = 0.85,
  o: LodSilhouetteOptions = {},
): number {
  const r = lodSilhouetteIoU(asset, o);
  failOn(
    `${asset.name} LOD silhouette`,
    r
      .filter((v) => v.iou < minIoU)
      .map((v) => ({
        lod: o.lod ?? 2,
        finding: {
          gate: 'lod-silhouette',
          code: 'T3D_QA_LOD_SILHOUETTE',
          message: `seen from ${v.view} the outline matches LOD0 at IoU ${v.iou.toFixed(3)} < ${minIoU}`,
          fix: 'keep the big masses at every LOD (drop segments and small detail, not extent): read ctx.lod and gate detail, never whole bodies',
        },
      })),
  );
  return Math.min(1, ...r.map((v) => v.iou));
}
