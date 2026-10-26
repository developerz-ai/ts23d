// Contact sheet: ONE PNG, six labelled orthographic views on a metre grid. Built for an agent's
// eyes — one image read shows proportions from every side, so it fixes the right thing first.
//   row 1: 3/4 FRONT · FRONT (+X) · SIDE (-Y)
//   row 2: TOP · 3/4 REAR · FAR LOD (LOD2, 3/4 front)

import { type CompiledAsset, encodePng, type Vec3 } from '../core/index.ts';
import { drawText } from './font.ts';
import { drawAsset, line, orthoCamera, type Target, type View, worldParts } from './raster.ts';

export const VIEWS: readonly View[] = [
  { label: '3/4 FRONT', dir: [-1, 0.8, -0.6], up: [0, 0, 1] },
  { label: 'FRONT +X', dir: [-1, 0, 0], up: [0, 0, 1] },
  { label: 'SIDE -Y', dir: [0, 1, 0], up: [0, 0, 1] },
  { label: 'TOP', dir: [0, 0, -1], up: [1, 0, 0] },
  { label: '3/4 REAR', dir: [1, -0.8, -0.6], up: [0, 0, 1] },
  { label: 'FAR LOD2', dir: [-1, 0.8, -0.6], up: [0, 0, 1] },
];

function bounds(asset: CompiledAsset): { centre: Vec3; extent: number; min: Vec3; max: Vec3 } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const m of worldParts(asset)) {
    for (let i = 0; i < m.positions.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = m.positions[i + k] ?? 0;
        min[k] = Math.min(min[k] ?? 0, v);
        max[k] = Math.max(max[k] ?? 0, v);
      }
    }
  }
  const lo: Vec3 = [min[0] ?? 0, min[1] ?? 0, min[2] ?? 0];
  const hi: Vec3 = [max[0] ?? 0, max[1] ?? 0, max[2] ?? 0];
  const extent = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], 0.1);
  return {
    centre: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2],
    extent,
    min: lo,
    max: hi,
  };
}

const gridStep = (extent: number): number =>
  [0.1, 0.5, 1, 5, 10, 50, 100].find((s) => extent / s <= 24) ?? 100;

export interface SheetOptions {
  readonly cell?: number;
  /** The far view's asset — compile the same recipe at LOD 2 and pass it here. */
  readonly far?: CompiledAsset;
}

export function contactSheet(asset: CompiledAsset, o: SheetOptions = {}): Uint8Array {
  const cell = o.cell ?? 400;
  const width = cell * 3;
  const height = cell * 2 + 40;
  const px = new Uint8Array(width * height * 4).fill(255);
  const b = bounds(asset);
  const step = gridStep(b.extent);
  VIEWS.forEach((view, i) => {
    const t: Target = {
      px: new Uint8Array(cell * cell * 4),
      depth: new Float32Array(cell * cell).fill(Infinity),
      width: cell,
      height: cell,
    };
    for (let k = 0; k < cell * cell; k++) t.px.set([238, 240, 243, 255], k * 4);
    const cam = orthoCamera(view, b.centre, b.extent, cell);
    drawAsset(t, cam, i === 5 && o.far ? o.far : asset);
    const g0 = Math.floor(Math.min(b.min[0], b.min[1]) / step - 1) * step;
    const g1 = Math.ceil(Math.max(b.max[0], b.max[1]) / step + 1) * step;
    for (let g = g0; g <= g1 + 1e-9; g += step) {
      line(t, cam.project([g, g0, 0]), cam.project([g, g1, 0]), [190, 196, 204]);
      line(t, cam.project([g0, g, 0]), cam.project([g1, g, 0]), [190, 196, 204]);
    }
    const ox = (i % 3) * cell;
    const oy = 40 + Math.floor(i / 3) * cell;
    for (let y = 0; y < cell; y++)
      px.set(t.px.subarray(y * cell * 4, (y + 1) * cell * 4), ((oy + y) * width + ox) * 4);
    drawText(px, width, ox + 8, oy + 8, view.label, 3, [40, 44, 52]);
  });
  const dims = `${asset.name}  ${(b.max[0] - b.min[0]).toFixed(1)}X${(b.max[1] - b.min[1]).toFixed(1)}X${(b.max[2] - b.min[2]).toFixed(1)}M  GRID ${step}M  LOD${asset.lod}`;
  drawText(px, width, 10, 10, dims, 4, [20, 22, 26]);
  return encodePng(width, height, px);
}
