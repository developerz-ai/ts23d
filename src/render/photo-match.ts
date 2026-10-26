// Photo match: render the asset from the camera that took a reference photo and stack
// photo · model · 50% overlay in ONE image. The strongest check an agent has — silhouette,
// proportions and colour against reality at a glance. Planned: M2 (docs/plans/roadmap.md).

import { type CompiledAsset, notImplemented, type Vec3 } from '../core/index.ts';

export interface PhotoCamera {
  /** Camera position and look-at target in asset space (metres, Z up). */
  readonly eye: Vec3;
  readonly target: Vec3;
  /** Vertical field of view, degrees. */
  readonly fovDeg: number;
}

export interface PhotoMatchOptions {
  readonly photo: Uint8Array;
  /** Solve the camera from ≥ 4 marked correspondences instead of passing it (planned with it). */
  readonly camera: PhotoCamera;
  readonly width?: number;
}

/** Returns a PNG: photo on top, model in the middle, overlay at the bottom; plus silhouette IoU. */
export function photoMatch(
  _asset: CompiledAsset,
  _o: PhotoMatchOptions,
): { png: Uint8Array; iou: number } {
  return notImplemented('photoMatch (photo · model · overlay sheet + silhouette IoU)');
}
