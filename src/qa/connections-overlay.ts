// `connectionsOverlay(asset)`: the connections gate made visible. Four views (3/4 front, side,
// front, 3/4 rear) of the LOD0 meshes, every weak connection ringed: red = error (island, point,
// glued, poke, eye…), orange = unblended seam, yellow = warning (buried), green = a grown or
// socket joint that passed. A PNG (zero-GPU) an agent Reads after a failing build.

import { type Bounds, type CompiledAsset, encodePng, worldMeshes } from '../core/index.ts';
import { type ConnectionReport, connectionReport } from './connections.ts';
import { type Frame, rasterise, ring, type View } from './connections-raster.ts';

const RED = [225, 30, 30];
const ORANGE = [245, 140, 0];
const YELLOW = [235, 205, 0];
const GREEN = [30, 170, 70];

export const OVERLAY_VIEWS: readonly View[] = [
  { yaw: Math.PI * 0.2, pitch: 0.4 },
  { yaw: Math.PI / 2, pitch: 0.05 },
  { yaw: 0, pitch: 0.05 },
  { yaw: Math.PI * 1.2, pitch: 0.4 },
];

function dot(f: Frame, x: number, y: number, rgb: readonly number[]): void {
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const px = Math.round(x) + dx;
      const py = Math.round(y) + dy;
      if (px >= 0 && py >= 0 && px < f.size && py < f.size)
        f.rgba.set([rgb[0] ?? 0, rgb[1] ?? 0, rgb[2] ?? 0, 255], (py * f.size + px) * 4);
    }
}

function mark(f: Frame, report: ConnectionReport): void {
  const draw = (
    at: readonly [number, number, number],
    radius: number,
    rgb: readonly number[],
  ): void => {
    const [x, y] = f.project(at);
    ring(f, x, y, Math.max(7, radius * f.scale), rgb, 3);
  };
  for (const ok of report.ok) draw(ok.at, ok.radius, GREEN);
  for (const i of report.issues) {
    if (i.trace) {
      // Only the visible stretch of a seam: behind the surface it would mislead.
      const tol = Math.max(0.01, i.radius * 0.2);
      for (const p of i.trace) {
        const [x, y, z] = f.project(p);
        if (z <= f.depthAt(x, y) + tol) dot(f, x, y, ORANGE);
      }
      continue;
    }
    if (i.radius <= 0) continue;
    const rgb = i.severity === 'warning' ? YELLOW : i.code === 'T3D_CONNECT_SEAM' ? ORANGE : RED;
    draw(i.at, i.radius, rgb);
  }
}

/** 2 × 2 views, `size` px square overall. */
export interface OverlayOptions {
  /** Square PNG size in px (default 1024). */
  readonly size?: number;
  /** Views to draw (default OVERLAY_VIEWS, 2 × 2); one view fills the image. */
  readonly views?: readonly View[];
  /** Only these parts (names), e.g. to zoom on a head. */
  readonly parts?: readonly string[];
  /** Frame this sphere (world centre, radius in metres) instead of the whole asset. */
  readonly focus?: { readonly at: readonly [number, number, number]; readonly radius: number };
}

export function connectionsOverlay(asset: CompiledAsset, o: OverlayOptions = {}): Uint8Array {
  const size = o.size ?? 1024;
  const views = o.views ?? OVERLAY_VIEWS;
  const all = connectionReport(asset);
  const keep = (part: string): boolean => !o.parts || o.parts.includes(part);
  const report: ConnectionReport = {
    issues: all.issues.filter((i) => keep(i.part)),
    ok: all.ok.filter((i) => keep(i.part)),
  };
  const meshes = [...worldMeshes(asset.parts)].filter(([n]) => keep(n)).map(([, m]) => m);
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const m of meshes)
    for (let i = 0; i < m.positions.length; i += 3)
      for (const k of [0, 1, 2] as const) {
        const v = m.positions[i + k] ?? 0;
        if (v < min[k]) min[k] = v;
        if (v > max[k]) max[k] = v;
      }
  const f = o.focus;
  const bounds: Bounds = f
    ? {
        min: [f.at[0] - f.radius, f.at[1] - f.radius, f.at[2] - f.radius],
        max: [f.at[0] + f.radius, f.at[1] + f.radius, f.at[2] + f.radius],
      }
    : meshes.length
      ? { min, max }
      : { min: [0, 0, 0], max: [1, 1, 1] };
  const across = views.length > 1 ? 2 : 1;
  const down = Math.ceil(views.length / across);
  const cell = Math.floor(size / across);
  const W = cell * across;
  const out = new Uint8Array(W * cell * down * 4);
  views.forEach((v, vi) => {
    const frame = rasterise(meshes, bounds, v, cell);
    mark(frame, report);
    const ox = (vi % across) * cell;
    const oy = Math.floor(vi / across) * cell;
    for (let y = 0; y < cell; y++)
      out.set(frame.rgba.subarray(y * cell * 4, (y + 1) * cell * 4), ((oy + y) * W + ox) * 4);
  });
  return encodePng(W, cell * down, out);
}
