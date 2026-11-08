// RTS readability: the asset as a strategy-game camera sees it (high, ~58° down, a few dozen
// pixels tall) and how much of that tiny image is team colour. Team pixels are found by
// rendering two liveries and diffing them: a pixel that changes between team colours IS team
// colour, whatever the hue, lighting or grime. Zero-GPU, deterministic.

import { type CompiledAsset, encodePng, Ts23dError } from '../core/index.ts';
import type { PaintedSheet } from '../material/index.ts';
import { renderBeauty } from './beauty.ts';

/** The house RTS camera: front-left, high, small. */
export const RTS_CAMERA = { azDeg: -35, elDeg: 58, fovDeg: 20, size: 64 } as const;

export interface RtsViewOptions {
  /** Square edge in pixels, default 64 (a unit on a 1080p RTS screen). */
  readonly size?: number;
  /** Elevation, degrees, default 58. */
  readonly elDeg?: number;
  readonly azDeg?: number;
  readonly sheet?: PaintedSheet;
}

export interface TeamCoverage {
  /** Pixels the asset covers (mask ≥ 50%). */
  readonly covered: number;
  /** Covered pixels whose colour changes between the two liveries. */
  readonly team: number;
  /** team / covered, 0–1. */
  readonly share: number;
}

const render = (asset: CompiledAsset, o: RtsViewOptions) =>
  renderBeauty(asset, {
    width: o.size ?? RTS_CAMERA.size,
    height: o.size ?? RTS_CAMERA.size,
    azDeg: o.azDeg ?? RTS_CAMERA.azDeg,
    elDeg: o.elDeg ?? RTS_CAMERA.elDeg,
    fovDeg: RTS_CAMERA.fovDeg,
    supersample: 2,
    ...(o.sheet ? { sheet: o.sheet } : {}),
  });

/** The RTS-camera view as PNG bytes (default 64 × 64, 58° elevation). */
export function rtsView(asset: CompiledAsset, o: RtsViewOptions = {}): Uint8Array {
  const r = render(asset, o);
  return encodePng(r.width, r.height, r.rgba);
}

/**
 * Share of the RTS-camera silhouette that is team colour: `a` and `b` are the same asset compiled
 * with two different team variants (`compile(asset, { variant: 'red' })` / `'blue'`). A channel
 * difference above `threshold` (0–255, default 24) counts as a team pixel.
 */
export function teamCoverage(
  a: CompiledAsset,
  b: CompiledAsset,
  o: RtsViewOptions & { readonly threshold?: number } = {},
): TeamCoverage {
  if (a.name !== b.name)
    throw new Ts23dError('T3D_RENDER_OPTIONS', {
      cause: `teamCoverage compares two liveries of one asset, got '${a.name}' and '${b.name}'`,
      fix: 'compile the same asset twice: compile(asset, { variant: "red" }) and { variant: "blue" }',
    });
  const ra = render(a, o);
  const rb = render(b, o);
  const t = o.threshold ?? 24;
  let covered = 0;
  let team = 0;
  for (let i = 0; i < ra.mask.length; i++) {
    if ((ra.mask[i] ?? 0) < 128) continue;
    covered++;
    let d = 0;
    for (let k = 0; k < 3; k++)
      d = Math.max(d, Math.abs((ra.rgba[i * 4 + k] ?? 0) - (rb.rgba[i * 4 + k] ?? 0)));
    if (d > t) team++;
  }
  return { covered, team, share: covered ? team / covered : 0 };
}
