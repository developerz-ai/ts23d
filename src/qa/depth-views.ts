// Axis-aligned orthographic depth views for QA: a z-buffer per side of the asset (±X, ±Y, ±Z) that
// also records WHICH part owns each pixel. The `gaps` gate reads slits off these maps; the overlay
// draws them. Pure CPU, deterministic (fixed triangle order, strict depth test).

import type { Bounds, Mesh, Vec3 } from '../core/index.ts';

/** One side of the asset: looking along −sign·axis (sign +1 = the viewer sits on the + side). */
export interface DepthView {
  readonly axis: 0 | 1 | 2;
  readonly sign: 1 | -1;
  /** Image axes: column = world[u], row = world[v] (row 0 = smallest v). */
  readonly u: 0 | 1 | 2;
  readonly v: 0 | 1 | 2;
  readonly width: number;
  readonly height: number;
  /** Metres per pixel. */
  readonly px: number;
  readonly min: Vec3;
  readonly max: Vec3;
  /** Distance from the viewer's bounding plane; Infinity where nothing was drawn. */
  readonly depth: Float32Array;
  /** Index into the part list passed in; −1 where nothing was drawn. */
  readonly part: Int32Array;
}

const OTHER = [
  [1, 2],
  [0, 2],
  [0, 1],
] as const;

export const VIEW_NAMES = ['-X', '+X', '-Y', '+Y', '-Z', '+Z'] as const;
export const viewName = (v: Pick<DepthView, 'axis' | 'sign'>): string =>
  `${v.sign > 0 ? '+' : '-'}${'XYZ'[v.axis]}`;

/** World point of pixel (col, row) at `depth` in view `v`. */
export function pixelToWorld(v: DepthView, col: number, row: number, depth: number): Vec3 {
  const p: [number, number, number] = [0, 0, 0];
  p[v.u] = v.min[v.u] + (col + 0.5) * v.px;
  p[v.v] = v.min[v.v] + (row + 0.5) * v.px;
  p[v.axis] = v.sign > 0 ? v.max[v.axis] - depth : v.min[v.axis] + depth;
  return p;
}

export function depthView(
  meshes: readonly Mesh[],
  bounds: Bounds,
  axis: 0 | 1 | 2,
  sign: 1 | -1,
  px: number,
): DepthView {
  const [u, v] = OTHER[axis];
  const width = Math.max(1, Math.ceil((bounds.max[u] - bounds.min[u]) / px));
  const height = Math.max(1, Math.ceil((bounds.max[v] - bounds.min[v]) / px));
  const depth = new Float32Array(width * height).fill(Infinity);
  const part = new Int32Array(width * height).fill(-1);
  const u0 = bounds.min[u];
  const v0 = bounds.min[v];
  const top = sign > 0 ? bounds.max[axis] : bounds.min[axis];
  meshes.forEach((m, pi) => {
    const P = m.positions;
    const I = m.indices;
    for (let t = 0; t < I.length; t += 3) {
      const a = (I[t] ?? 0) * 3;
      const b = (I[t + 1] ?? 0) * 3;
      const c = (I[t + 2] ?? 0) * 3;
      // Pixel-space coordinates (centres at +0.5) and depth of each corner.
      const ax = ((P[a + u] ?? 0) - u0) / px;
      const ay = ((P[a + v] ?? 0) - v0) / px;
      const bx = ((P[b + u] ?? 0) - u0) / px;
      const by = ((P[b + v] ?? 0) - v0) / px;
      const cx = ((P[c + u] ?? 0) - u0) / px;
      const cy = ((P[c + v] ?? 0) - v0) / px;
      const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (Math.abs(area) < 1e-9) continue; // edge-on: covers no pixel centre
      const da = sign * (top - (P[a + axis] ?? 0));
      const db = sign * (top - (P[b + axis] ?? 0));
      const dc = sign * (top - (P[c + axis] ?? 0));
      const x0 = Math.max(0, Math.ceil(Math.min(ax, bx, cx) - 0.5));
      const x1 = Math.min(width - 1, Math.floor(Math.max(ax, bx, cx) - 0.5));
      const y0 = Math.max(0, Math.ceil(Math.min(ay, by, cy) - 0.5));
      const y1 = Math.min(height - 1, Math.floor(Math.max(ay, by, cy) - 0.5));
      // Edge functions are affine in (x, y): step them per pixel instead of re-deriving.
      const inv = 1 / area;
      const a0 = -(cy - by) * inv;
      const a1 = -(ay - cy) * inv;
      for (let y = y0; y <= y1; y++) {
        const sx = x0 + 0.5;
        const sy = y + 0.5;
        let w0 = ((bx - sx) * (cy - sy) - (by - sy) * (cx - sx)) * inv;
        let w1 = ((cx - sx) * (ay - sy) - (cy - sy) * (ax - sx)) * inv;
        const row = y * width;
        for (let x = x0; x <= x1; x++, w0 += a0, w1 += a1) {
          const w2 = 1 - w0 - w1;
          // Closed edges (≥ −ε): two triangles sharing an edge leave no crack at their seam.
          if (w0 < -1e-7 || w1 < -1e-7 || w2 < -1e-7) continue;
          const d = w0 * da + w1 * db + w2 * dc;
          const k = row + x;
          if (d < (depth[k] ?? Infinity)) {
            depth[k] = d;
            part[k] = pi;
          }
        }
      }
    }
  });
  return { axis, sign, u, v, width, height, px, min: bounds.min, max: bounds.max, depth, part };
}

/** The sides named (default all six), in VIEW_NAMES order. */
export const depthViews = (
  meshes: readonly Mesh[],
  bounds: Bounds,
  px: number,
  sides: readonly string[] = VIEW_NAMES,
): DepthView[] =>
  ([0, 1, 2] as const).flatMap((axis) =>
    ([-1, 1] as const)
      .filter((sign) => sides.includes(viewName({ axis, sign })))
      .map((sign) => depthView(meshes, bounds, axis, sign, px)),
  );
