// A tiny CPU rasteriser for the connections overlay: orthographic views at any yaw/pitch, flat
// shaded vertex colour with a z-buffer, plus a projector so findings can be ringed where they are.
// QA can't import /render (same tier), and the overlay only needs to be legible, not pretty.

import type { Bounds, Mesh, Vec3 } from '../core/index.ts';

export interface View {
  readonly yaw: number;
  readonly pitch: number;
}

export interface Frame {
  readonly size: number;
  readonly rgba: Uint8Array;
  /** World → pixel (x right, y down) and view depth. */
  project(p: Vec3): [number, number, number];
  /** Pixels per metre. */
  readonly scale: number;
  /** View depth of the nearest surface at a pixel (Infinity on background). */
  depthAt(x: number, y: number): number;
}

/** View axes for camera yaw (around Z, 0 = looking from +X) and pitch (down from horizontal). */
function axes(v: View): { right: Vec3; up: Vec3; fwd: Vec3 } {
  const cy = Math.cos(v.yaw);
  const sy = Math.sin(v.yaw);
  const cp = Math.cos(v.pitch);
  const sp = Math.sin(v.pitch);
  // Camera sits at direction (cy·cp, sy·cp, sp) from the centre, looking back at it.
  const back: Vec3 = [cy * cp, sy * cp, sp];
  const right: Vec3 = [-sy, cy, 0];
  const up: Vec3 = [-cy * sp, -sy * sp, cp];
  return { right, up, fwd: [-back[0], -back[1], -back[2]] };
}

export function rasterise(
  meshes: readonly Mesh[],
  bounds: Bounds,
  view: View,
  size: number,
): Frame {
  const { right, up, fwd } = axes(view);
  const c: Vec3 = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
  const r = Math.max(
    1e-6,
    Math.hypot(bounds.max[0] - c[0], bounds.max[1] - c[1], bounds.max[2] - c[2]),
  );
  const scale = (size * 0.47) / r;
  const project = (p: Vec3): [number, number, number] => {
    const d: Vec3 = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
    return [
      size / 2 + (d[0] * right[0] + d[1] * right[1] + d[2] * right[2]) * scale,
      size / 2 - (d[0] * up[0] + d[1] * up[1] + d[2] * up[2]) * scale,
      d[0] * fwd[0] + d[1] * fwd[1] + d[2] * fwd[2],
    ];
  };
  const rgba = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) rgba.set([238, 240, 243, 255], i * 4);
  const zbuf = new Float32Array(size * size).fill(Infinity);
  const light: Vec3 = [
    0.35 * right[0] + 0.6 * up[0] - 0.7 * fwd[0],
    0.35 * right[1] + 0.6 * up[1] - 0.7 * fwd[1],
    0.35 * right[2] + 0.6 * up[2] - 0.7 * fwd[2],
  ];
  const ll = Math.hypot(...light);
  for (const m of meshes) {
    const P = m.positions;
    const C = m.colors;
    const I = m.indices;
    for (let t = 0; t < I.length; t += 3) {
      const ia = I[t] ?? 0;
      const ib = I[t + 1] ?? 0;
      const ic = I[t + 2] ?? 0;
      const w = (i: number): Vec3 => [P[i * 3] ?? 0, P[i * 3 + 1] ?? 0, P[i * 3 + 2] ?? 0];
      const [A, B, Cc] = [w(ia), w(ib), w(ic)];
      const u: Vec3 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
      const v: Vec3 = [Cc[0] - A[0], Cc[1] - A[1], Cc[2] - A[2]];
      const n: Vec3 = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ];
      const nl = Math.hypot(...n) || 1;
      const lit = Math.abs(n[0] * light[0] + n[1] * light[1] + n[2] * light[2]) / (nl * ll);
      const shade = 0.35 + 0.65 * lit;
      const col = [0, 1, 2].map((k) =>
        Math.round(
          255 *
            Math.min(
              1,
              Math.sqrt(
                ((C[ia * 3 + k] ?? 0.6) + (C[ib * 3 + k] ?? 0.6) + (C[ic * 3 + k] ?? 0.6)) / 3,
              ) * shade,
            ),
        ),
      );
      fill(project(A), project(B), project(Cc), size, zbuf, rgba, col);
    }
  }
  const depthAt = (x: number, y: number): number => {
    const px = Math.round(x);
    const py = Math.round(y);
    return px < 0 || py < 0 || px >= size || py >= size
      ? Infinity
      : (zbuf[py * size + px] ?? Infinity);
  };
  return { size, rgba, project, scale, depthAt };
}

function fill(
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
  size: number,
  zbuf: Float32Array,
  rgba: Uint8Array,
  col: readonly number[],
): void {
  const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (Math.abs(area) < 1e-9) return;
  const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
  const x1 = Math.min(size - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
  const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
  const y1 = Math.min(size - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const w0 = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) / area;
      const w1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = w0 * a[2] + w1 * b[2] + w2 * c[2];
      const k = y * size + x;
      if (z >= (zbuf[k] ?? Infinity)) continue;
      zbuf[k] = z;
      rgba[k * 4] = col[0] ?? 0;
      rgba[k * 4 + 1] = col[1] ?? 0;
      rgba[k * 4 + 2] = col[2] ?? 0;
    }
}

/** A ring of `width` px around (cx, cy). */
export function ring(
  f: Frame,
  cx: number,
  cy: number,
  r: number,
  rgb: readonly number[],
  width = 2,
): void {
  const steps = Math.max(32, Math.ceil(r * 8));
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    for (let w = 0; w < width; w++) {
      const x = Math.round(cx + Math.cos(t) * (r + w));
      const y = Math.round(cy + Math.sin(t) * (r + w));
      if (x < 0 || y < 0 || x >= f.size || y >= f.size) continue;
      f.rgba.set([rgb[0] ?? 0, rgb[1] ?? 0, rgb[2] ?? 0, 255], (y * f.size + x) * 4);
    }
  }
}
