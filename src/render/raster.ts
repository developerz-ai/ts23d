// CPU rasteriser: orthographic, z-buffered, Lambert-shaded triangles plus depth-tested lines.
// Slow by GPU standards and fast enough for 6 × 400² views of a game asset in well under a second.

import type { CompiledAsset, Vec3 } from '../core/index.ts';
import { cross, dot, normalize, rotateZ, sub, toWorld, worldTransforms } from '../core/index.ts';

export interface View {
  readonly label: string;
  /** Direction the camera looks along (world, Z up). */
  readonly dir: Vec3;
  readonly up: Vec3;
}

export interface Target {
  readonly px: Uint8Array;
  readonly depth: Float32Array;
  readonly width: number;
  readonly height: number;
}

export interface Camera {
  project(p: Vec3): Vec3;
}

export function orthoCamera(view: View, centre: Vec3, extent: number, size: number): Camera {
  const f = normalize(view.dir);
  const r = normalize(cross(f, view.up));
  const u = cross(r, f);
  const k = size / (extent * 1.15);
  return {
    project: (p) => {
      const d = sub(p, centre);
      return [size / 2 + dot(d, r) * k, size / 2 - dot(d, u) * k, dot(d, f)];
    },
  };
}

const LIGHT = normalize([0.4, -0.6, 0.8]);

export function worldParts(asset: CompiledAsset): {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}[] {
  const xf = worldTransforms(asset.parts);
  const out = [];
  for (const p of asset.parts) {
    const t = xf.get(p.name);
    if (!p.mesh || !t) continue;
    const positions = new Float32Array(p.mesh.positions.length);
    const normals = new Float32Array(p.mesh.normals.length);
    for (let i = 0; i < positions.length; i += 3) {
      positions.set(
        toWorld(t, [
          p.mesh.positions[i] ?? 0,
          p.mesh.positions[i + 1] ?? 0,
          p.mesh.positions[i + 2] ?? 0,
        ]),
        i,
      );
      normals.set(
        rotateZ(
          [p.mesh.normals[i] ?? 0, p.mesh.normals[i + 1] ?? 0, p.mesh.normals[i + 2] ?? 0],
          t.yaw,
        ),
        i,
      );
    }
    out.push({ positions, normals, colors: p.mesh.colors, indices: p.mesh.indices });
  }
  return out;
}

function tri(t: Target, a: Vec3, b: Vec3, c: Vec3, rgb: Vec3): void {
  const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
  const maxX = Math.min(t.width - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
  const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
  const maxY = Math.min(t.height - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
  const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (Math.abs(area) < 1e-9) return;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const w0 = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) / area;
      const w1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = w0 * a[2] + w1 * b[2] + w2 * c[2];
      const i = y * t.width + x;
      if (z >= (t.depth[i] ?? Infinity)) continue;
      t.depth[i] = z;
      t.px.set([rgb[0], rgb[1], rgb[2], 255], i * 4);
    }
  }
}

const toSrgb = (v: number): number =>
  Math.round(255 * Math.min(1, v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055));

export function drawAsset(t: Target, cam: Camera, asset: CompiledAsset): void {
  for (const m of worldParts(asset)) {
    for (let i = 0; i < m.indices.length; i += 3) {
      const ids = [m.indices[i] ?? 0, m.indices[i + 1] ?? 0, m.indices[i + 2] ?? 0];
      const pts = ids.map((v) =>
        cam.project([
          m.positions[v * 3] ?? 0,
          m.positions[v * 3 + 1] ?? 0,
          m.positions[v * 3 + 2] ?? 0,
        ]),
      );
      const v0 = ids[0] ?? 0;
      const n: Vec3 = [
        m.normals[v0 * 3] ?? 0,
        m.normals[v0 * 3 + 1] ?? 0,
        m.normals[v0 * 3 + 2] ?? 1,
      ];
      const shade = 0.35 + 0.65 * Math.max(0, dot(n, LIGHT));
      const rgb: Vec3 = [
        toSrgb((m.colors[v0 * 3] ?? 1) * shade),
        toSrgb((m.colors[v0 * 3 + 1] ?? 1) * shade),
        toSrgb((m.colors[v0 * 3 + 2] ?? 1) * shade),
      ];
      const [a, b, c] = pts;
      if (a && b && c) tri(t, a, b, c, rgb);
    }
  }
}

export function line(t: Target, a: Vec3, b: Vec3, rgb: Vec3): void {
  const steps = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), 1));
  for (let s = 0; s <= steps; s++) {
    const k = s / steps;
    const x = Math.round(a[0] + (b[0] - a[0]) * k);
    const y = Math.round(a[1] + (b[1] - a[1]) * k);
    if (x < 0 || y < 0 || x >= t.width || y >= t.height) continue;
    const z = a[2] + (b[2] - a[2]) * k;
    const i = y * t.width + x;
    if (z > (t.depth[i] ?? Infinity) + 1e-3) continue;
    t.px.set([rgb[0], rgb[1], rgb[2], 255], i * 4);
  }
}
