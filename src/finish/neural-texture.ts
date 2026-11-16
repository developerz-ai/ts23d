// A model's texture onto our surface, under our colours. Two sources: (1) a model's textured mesh
// (its albedo already in vertex colour, e.g. importGlb) → each target point takes the colour at
// its closest source point (barycentric); (2) multi-view projection — images with cameras
// (default: 12 views round the turnaround) → each target vertex averages the views that see it,
// weighted by how squarely it faces each one (z-buffer visibility, a per-part mask optional).
// Then de-light (divide by baked AO / irradiance: a photo's shadows are not albedo) and keep only
// the HIGH-PASS over the recipe's own colours: target = recipe + strength · (source − smooth
// source), smoothing over the target mesh's neighbours, so the mean colour per region (what the
// palette QA reads) stays the recipe's and the model adds grain, streaks and mottling.

import type { Mesh, Vec3 } from '../core/index.ts';
import type { Rgba } from '../material/index.ts';
import { sampleRgba, toLinear } from '../neural/index.ts';
import { triBvh } from '../primitives/index.ts';
import type { RasterCamera as Camera } from '../render/index.ts';

/** The closest source triangle to p: its corner vertices and the barycentrics of the closest
 *  point (areas of the sub-triangles). */
function closestOn(source: Mesh): (p: Vec3) => { readonly v: readonly number[]; readonly w: Vec3 } {
  const bvh = triBvh(source);
  const P = source.positions;
  const I = source.indices;
  const q: [number, number, number] = [0, 0, 0];
  return (p) => {
    const t = bvh.nearestTriangle(p);
    bvh.closest(p, q);
    const v = [I[t * 3] ?? 0, I[t * 3 + 1] ?? 0, I[t * 3 + 2] ?? 0];
    const at = (k: number, a: number): number => P[(v[k] ?? 0) * 3 + a] ?? 0;
    const e = (a: number, b: number): number => {
      const u = [0, 1, 2].map((x) => at(a, x) - (q[x] ?? 0));
      const w = [0, 1, 2].map((x) => at(b, x) - (q[x] ?? 0));
      return Math.hypot(
        (u[1] ?? 0) * (w[2] ?? 0) - (u[2] ?? 0) * (w[1] ?? 0),
        (u[2] ?? 0) * (w[0] ?? 0) - (u[0] ?? 0) * (w[2] ?? 0),
        (u[0] ?? 0) * (w[1] ?? 0) - (u[1] ?? 0) * (w[0] ?? 0),
      );
    };
    const [w0, w1, w2] = [e(1, 2), e(2, 0), e(0, 1)];
    const s = w0 + w1 + w2 || 1;
    return { v, w: [w0 / s, w1 / s, w2 / s] };
  };
}

/** Closest-point colour of a source mesh (vertex colours, linear RGB). */
export function closestColour(source: Mesh): (p: Vec3) => Vec3 {
  const on = closestOn(source);
  const C = source.colors;
  return (p) => {
    const { v, w } = on(p);
    const c = (a: number): number =>
      (C[(v[0] ?? 0) * 3 + a] ?? 0) * w[0] +
      (C[(v[1] ?? 0) * 3 + a] ?? 0) * w[1] +
      (C[(v[2] ?? 0) * 3 + a] ?? 0) * w[2];
    return [c(0), c(1), c(2)];
  };
}

/** Closest-point colour read from the source's own texture (its UVs at the closest point,
 *  bilinear, sRGB → linear): the full image resolution, not the per-vertex samples. */
export function closestTexture(source: Mesh, albedo: Rgba): (p: Vec3) => Vec3 {
  const on = closestOn(source);
  const U = source.uvs;
  const s = [0, 0, 0, 0];
  return (p) => {
    const { v, w } = on(p);
    const uv = (a: number): number =>
      (U[(v[0] ?? 0) * 2 + a] ?? 0) * w[0] +
      (U[(v[1] ?? 0) * 2 + a] ?? 0) * w[1] +
      (U[(v[2] ?? 0) * 2 + a] ?? 0) * w[2];
    sampleRgba(albedo, uv(0), uv(1), s);
    return [toLinear(s[0] ?? 0), toLinear(s[1] ?? 0), toLinear(s[2] ?? 0)];
  };
}

/** Per-vertex colours of `target` sampled from `sample` (closestColour, projectViews…). */
export function transferColours(target: Mesh, sample: (p: Vec3) => Vec3): Float32Array {
  const P = target.positions;
  const out = new Float32Array(P.length);
  for (let i = 0; i < P.length; i += 3)
    out.set(sample([P[i] ?? 0, P[i + 1] ?? 0, P[i + 2] ?? 0]), i);
  return out;
}

/** One image with the camera that took it (pixels: x right, y down; z = depth along the view). */
export interface View {
  readonly rgba: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly camera: Camera;
  /** Optional mask (≠ 0 = use this pixel), e.g. one part's id from render/part-masks.ts. */
  readonly mask?: Uint8Array;
}

const linear = (v: number): number => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** Multi-view projection onto the target's vertices: visibility-tested, facing-weighted blend.
 *  Vertices no view sees keep NaN (the caller falls back to its own colour there). */
export function projectViews(
  target: Mesh,
  views: readonly View[],
  o: { readonly slack?: number; readonly eps?: number } = {},
): Float32Array {
  const eps = o.eps ?? 1e-3;
  const slack = o.slack ?? 0.005;
  const P = target.positions;
  const N = target.normals;
  const I = target.indices;
  const acc = new Float64Array((P.length / 3) * 4);
  for (const v of views) {
    const depth = new Float32Array(v.width * v.height).fill(Infinity);
    const proj = (k: number): Vec3 =>
      v.camera.project([P[k * 3] ?? 0, P[k * 3 + 1] ?? 0, P[k * 3 + 2] ?? 0]);
    const pts = Array.from({ length: P.length / 3 }, (_, k) => proj(k));
    for (let t = 0; t < I.length; t += 3) {
      const [a, b, c] = [pts[I[t] ?? 0], pts[I[t + 1] ?? 0], pts[I[t + 2] ?? 0]] as [
        Vec3,
        Vec3,
        Vec3,
      ];
      const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (Math.abs(area) < 1e-12) continue;
      const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
      const x1 = Math.min(v.width - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
      const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
      const y1 = Math.min(v.height - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const w0 =
            ((b[0] - x - 0.5) * (c[1] - y - 0.5) - (b[1] - y - 0.5) * (c[0] - x - 0.5)) / area;
          const w1 =
            ((c[0] - x - 0.5) * (a[1] - y - 0.5) - (c[1] - y - 0.5) * (a[0] - x - 0.5)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const z = w0 * a[2] + w1 * b[2] + w2 * c[2];
          const k = y * v.width + x;
          if (z < (depth[k] ?? Infinity)) depth[k] = z;
        }
    }
    pts.forEach((s, k) => {
      const x = Math.floor(s[0]);
      const y = Math.floor(s[1]);
      if (x < 0 || y < 0 || x >= v.width || y >= v.height) return;
      const px = y * v.width + x;
      if (v.mask && !v.mask[px]) return;
      // Visible: no surface more than `slack` (depth units) in front of it in its pixel ring.
      let near = Infinity;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = Math.min(v.width - 1, Math.max(0, x + dx));
          const yy = Math.min(v.height - 1, Math.max(0, y + dy));
          near = Math.min(near, depth[yy * v.width + xx] ?? Infinity);
        }
      if (s[2] > near + slack) return;
      // Facing: moving along the normal brings the point toward the camera (depth falls).
      const n: Vec3 = [N[k * 3] ?? 0, N[k * 3 + 1] ?? 0, N[k * 3 + 2] ?? 0];
      const ahead = v.camera.project([
        (P[k * 3] ?? 0) + n[0] * eps,
        (P[k * 3 + 1] ?? 0) + n[1] * eps,
        (P[k * 3 + 2] ?? 0) + n[2] * eps,
      ]);
      const facing = (s[2] - ahead[2]) / eps;
      if (!(facing > 0)) return;
      const w = facing * facing;
      for (let c = 0; c < 3; c++)
        acc[k * 4 + c] = (acc[k * 4 + c] ?? 0) + w * linear(v.rgba[px * 4 + c] ?? 0);
      acc[k * 4 + 3] = (acc[k * 4 + 3] ?? 0) + w;
    });
  }
  const out = new Float32Array(P.length);
  for (let k = 0; k < P.length / 3; k++) {
    const w = acc[k * 4 + 3] ?? 0;
    for (let c = 0; c < 3; c++) out[k * 3 + c] = w > 0 ? (acc[k * 4 + c] ?? 0) / w : Number.NaN;
  }
  return out;
}

/** De-light: divide out baked occlusion / irradiance (per vertex, 0..1), floored at `floor`. */
export function delight(
  colours: Float32Array,
  irradiance: Float32Array,
  floor = 0.25,
): Float32Array {
  return colours.map((c, i) =>
    Math.min(1, c / Math.max(floor, irradiance[Math.floor(i / 3)] ?? 1)),
  );
}

/** Vertex neighbours of a mesh, positions welded (seams share their neighbours). */
function neighbours(m: Mesh): { of: Int32Array; adj: number[][] } {
  const P = m.positions;
  const key = new Map<string, number>();
  const of = new Int32Array(P.length / 3);
  for (let v = 0; v < of.length; v++) {
    const k = `${P[v * 3]},${P[v * 3 + 1]},${P[v * 3 + 2]}`;
    const id = key.get(k) ?? key.size;
    key.set(k, id);
    of[v] = id;
  }
  const adj: Set<number>[] = Array.from({ length: key.size }, () => new Set<number>());
  const I = m.indices;
  for (let t = 0; t < I.length; t += 3)
    for (let e = 0; e < 3; e++) {
      const a = of[I[t + e] ?? 0] ?? 0;
      const b = of[I[t + ((e + 1) % 3)] ?? 0] ?? 0;
      adj[a]?.add(b);
      adj[b]?.add(a);
    }
  return { of, adj: adj.map((s) => [...s].sort((x, y) => x - y)) };
}

/**
 * recipe + strength · (source − smooth(source)), per vertex, linear RGB in [0, 1]. `iterations`
 * of neighbour averaging set the cut-off (more = broader detail kept). NaN source = recipe colour.
 */
export function highPassOver(
  target: Mesh,
  source: Float32Array,
  o: { readonly iterations?: number; readonly strength?: number } = {},
): Float32Array {
  const { of, adj } = neighbours(target);
  const base = target.colors;
  let s = new Float64Array(adj.length * 3);
  const n = new Float64Array(adj.length);
  for (let v = 0; v < of.length; v++) {
    const id = of[v] ?? 0;
    for (let c = 0; c < 3; c++) {
      const x = source[v * 3 + c] ?? Number.NaN;
      s[id * 3 + c] = (s[id * 3 + c] ?? 0) + (Number.isNaN(x) ? (base[v * 3 + c] ?? 0) : x);
    }
    n[id] = (n[id] ?? 0) + 1;
  }
  for (let id = 0; id < adj.length; id++)
    for (let c = 0; c < 3; c++) s[id * 3 + c] = (s[id * 3 + c] ?? 0) / (n[id] || 1);
  const src = Float64Array.from(s);
  for (let it = 0; it < (o.iterations ?? 8); it++) {
    const next = new Float64Array(s.length);
    adj.forEach((nb, id) => {
      for (let c = 0; c < 3; c++) {
        let sum = s[id * 3 + c] ?? 0;
        for (const j of nb) sum += s[j * 3 + c] ?? 0;
        next[id * 3 + c] = sum / (nb.length + 1);
      }
    });
    s = next;
  }
  const k = o.strength ?? 1;
  const out = new Float32Array(base.length);
  for (let v = 0; v < of.length; v++) {
    const id = of[v] ?? 0;
    for (let c = 0; c < 3; c++) {
      const hp = (src[id * 3 + c] ?? 0) - (s[id * 3 + c] ?? 0);
      out[v * 3 + c] = Math.max(0, Math.min(1, (base[v * 3 + c] ?? 0) + k * hp));
    }
  }
  return out;
}

/** `n` orthographic cameras round +Z (azimuth 0 = looking at the front, +X), level, `size` px. */
export function turnaroundCameras(
  centre: Vec3,
  extent: number,
  size: number,
  n = 12,
): { readonly azDeg: number; readonly camera: Camera }[] {
  return Array.from({ length: n }, (_, i) => {
    const az = (360 * i) / n;
    const a = (az * Math.PI) / 180;
    // Looking toward the centre from direction (cos a, sin a, 0).
    const f: Vec3 = [-Math.cos(a), -Math.sin(a), 0];
    const r: Vec3 = [f[1], -f[0], 0];
    const k = size / (extent * 1.15);
    return {
      azDeg: az,
      camera: {
        project: (p: Vec3): Vec3 => {
          const d: Vec3 = [p[0] - centre[0], p[1] - centre[1], p[2] - centre[2]];
          return [
            size / 2 + (d[0] * r[0] + d[1] * r[1]) * k,
            size / 2 - d[2] * k,
            d[0] * f[0] + d[1] * f[1],
          ];
        },
      },
    };
  });
}
