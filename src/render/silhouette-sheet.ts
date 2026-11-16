// The CPU concept sheet (`t3d concept`): N seeded variants of a recipe as black silhouettes in a
// grid, one shared scale so sizes compare, each with its scores — the concept artist's thumbnail
// test (docs: concept-artist skill) without a GPU. Scores per silhouette: `complexity` =
// perimeter² ÷ 4π·area (1 = a disc; features raise it), `distinct` = 1 − IoU with the variants'
// mean mask (how far it departs from the family), `score` 0–10 from both. Drawn as a bar under
// each cell plus the label and score in the pixel font.

import type { CompiledAsset, Vec3 } from '../core/index.ts';
import { encodePng } from '../core/index.ts';
import { drawText } from './font.ts';
import { partMasks } from './part-masks.ts';
import { orthoCamera, type View, worldParts } from './raster.ts';

export interface SilhouetteVariant {
  readonly label: string;
  readonly asset: CompiledAsset;
}

export interface SilhouetteScore {
  readonly label: string;
  readonly complexity: number;
  readonly distinct: number;
  readonly score: number;
}

export interface SilhouetteSheet {
  readonly png: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly scores: readonly SilhouetteScore[];
}

const VIEWS: Readonly<Record<'side' | 'front' | 'top', View>> = {
  side: { label: 'side', dir: [0, 1, 0], up: [0, 0, 1] },
  front: { label: 'front', dir: [-1, 0, 0], up: [0, 0, 1] },
  top: { label: 'top', dir: [0, 0, -1], up: [1, 0, 0] },
};

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

function bounds(a: CompiledAsset): { lo: Vec3; hi: Vec3 } {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const m of worldParts(a))
    for (let i = 0; i < m.positions.length; i += 3)
      for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k] ?? 0, m.positions[i + k] ?? 0);
        hi[k] = Math.max(hi[k] ?? 0, m.positions[i + k] ?? 0);
      }
  return { lo: lo as unknown as Vec3, hi: hi as unknown as Vec3 };
}

export function silhouetteSheet(
  variants: readonly SilhouetteVariant[],
  o: { readonly cell?: number; readonly cols?: number; readonly view?: keyof typeof VIEWS } = {},
): SilhouetteSheet {
  const cell = o.cell ?? 192;
  const cols = Math.max(1, Math.min(o.cols ?? 4, variants.length));
  const rows = Math.ceil(variants.length / cols);
  const view = VIEWS[o.view ?? 'side'];
  const boxes = variants.map((v) => bounds(v.asset));
  const lo: Vec3 = [0, 1, 2].map((k) =>
    Math.min(...boxes.map((b) => b.lo[k] ?? 0)),
  ) as unknown as Vec3;
  const hi: Vec3 = [0, 1, 2].map((k) =>
    Math.max(...boxes.map((b) => b.hi[k] ?? 0)),
  ) as unknown as Vec3;
  const centre: Vec3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  const extent = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], 1e-6);
  const cam = orthoCamera(view, centre, extent, cell);
  const masks = variants.map((v) => {
    const m = partMasks(v.asset, cam, cell, cell);
    return Uint8Array.from(m.ids, (id) => (id >= 0 ? 1 : 0));
  });
  const mean = new Float32Array(cell * cell);
  for (const m of masks)
    for (let k = 0; k < m.length; k++) mean[k] = (mean[k] ?? 0) + (m[k] ?? 0) / masks.length;
  const scores = masks.map((m, i): SilhouetteScore => {
    let area = 0;
    let edge = 0;
    let inter = 0;
    let union = 0;
    for (let k = 0; k < m.length; k++) {
      const on = m[k] === 1;
      const avg = (mean[k] ?? 0) >= 0.5;
      if (on) area++;
      if (on && avg) inter++;
      if (on || avg) union++;
      if (on && (k % cell === cell - 1 || m[k + 1] !== 1)) edge++;
      if (on && (k + cell >= m.length || m[k + cell] !== 1)) edge++;
    }
    const complexity = area > 0 ? (edge * edge) / (4 * Math.PI * area) / 1.27 : 0;
    const distinct = union > 0 ? 1 - inter / union : 0;
    const score = 10 * (0.5 * clamp01(distinct * 4) + 0.5 * clamp01((complexity - 1) / 4));
    return { label: variants[i]?.label ?? `${i}`, complexity, distinct, score };
  });
  const label = 14;
  const W = cols * cell;
  const H = rows * (cell + label);
  const px = new Uint8Array(W * H * 4).fill(255);
  masks.forEach((m, i) => {
    const ox = (i % cols) * cell;
    const oy = Math.floor(i / cols) * (cell + label);
    for (let k = 0; k < m.length; k++)
      if (m[k] === 1)
        px.set([20, 20, 22, 255], ((oy + Math.floor(k / cell)) * W + ox + (k % cell)) * 4);
    const s = scores[i];
    const bar = Math.round(((s?.score ?? 0) / 10) * (cell - 8));
    for (let y = oy + cell + 1; y < oy + cell + 4; y++)
      for (let x = ox + 4; x < ox + 4 + bar; x++) px.set([200, 90, 40, 255], (y * W + x) * 4);
    drawText(
      px,
      W,
      ox + 4,
      oy + cell + 6,
      `${s?.label ?? ''} ${(s?.score ?? 0).toFixed(1)}`,
      1,
      [40, 40, 40],
    );
  });
  return { png: encodePng(W, H, px), width: W, height: H, scores };
}
