// Part-id buffer for the art metrics: rasterise a compiled asset's world meshes through a camera
// (perspective = the beauty camera, so pixels line up with the render; or orthographic for
// silhouettes) and keep, per pixel, the owning part, the global triangle id, the interpolated
// shading normal and the world height. Pure CPU, deterministic (fixed order, strict depth test).

import { type CompiledAsset, worldMeshes } from '../core/index.ts';

type V3 = readonly [number, number, number];

/** Structurally the render module's PerspectiveCamera; `ortho` = `focal` is pixels per metre. */
export interface ViewCamera {
  readonly eye: V3;
  readonly r: V3;
  readonly u: V3;
  readonly f: V3;
  readonly focal: number;
  readonly cx: number;
  readonly cy: number;
  readonly width: number;
  readonly height: number;
  readonly ortho?: boolean;
}

export interface PartBuffer {
  readonly width: number;
  readonly height: number;
  /** Part names, index = value in `part`. */
  readonly names: readonly string[];
  /** Owning part per pixel, −1 = background. */
  readonly part: Int32Array;
  /** Global triangle id per pixel, −1 = background. */
  readonly tri: Int32Array;
  /** Interpolated unit shading normal (world), 3 floats per pixel. */
  readonly normal: Float32Array;
  /** World Z (height) per pixel. */
  readonly z: Float32Array;
}

export function partBuffer(asset: CompiledAsset, cam: ViewCamera): PartBuffer {
  const W = cam.width;
  const H = cam.height;
  const meshes = [...worldMeshes(asset.parts)];
  const names = meshes.map(([n]) => n);
  const key = new Float32Array(W * H).fill(-Infinity);
  const part = new Int32Array(W * H).fill(-1);
  const tri = new Int32Array(W * H).fill(-1);
  const bw = new Float32Array(W * H * 3);
  const base: number[] = [];
  let t0 = 0;
  meshes.forEach(([, m], pi) => {
    base.push(t0);
    const P = m.positions;
    const nv = P.length / 3;
    const sx = new Float32Array(nv);
    const sy = new Float32Array(nv);
    const sk = new Float32Array(nv);
    for (let v = 0; v < nv; v++) {
      const dx = (P[v * 3] ?? 0) - cam.eye[0];
      const dy = (P[v * 3 + 1] ?? 0) - cam.eye[1];
      const dz = (P[v * 3 + 2] ?? 0) - cam.eye[2];
      const w = dx * cam.f[0] + dy * cam.f[1] + dz * cam.f[2];
      const q = cam.ortho ? 1 : w > 1e-4 ? 1 / w : -1;
      sx[v] = cam.cx + (dx * cam.r[0] + dy * cam.r[1] + dz * cam.r[2]) * q * cam.focal;
      sy[v] = cam.cy - (dx * cam.u[0] + dy * cam.u[1] + dz * cam.u[2]) * q * cam.focal;
      // Depth key: larger = nearer (1/w for perspective, −w for orthographic).
      sk[v] = cam.ortho ? -w : q;
    }
    const I = m.indices;
    for (let t = 0; t < I.length / 3; t++) {
      const a = I[t * 3] ?? 0;
      const b = I[t * 3 + 1] ?? 0;
      const c = I[t * 3 + 2] ?? 0;
      const ka = sk[a] ?? -1;
      const kb = sk[b] ?? -1;
      const kc = sk[c] ?? -1;
      if (!cam.ortho && (ka < 0 || kb < 0 || kc < 0)) continue;
      const ax = sx[a] ?? 0;
      const ay = sy[a] ?? 0;
      const bx = sx[b] ?? 0;
      const by = sy[b] ?? 0;
      const cx = sx[c] ?? 0;
      const cy = sy[c] ?? 0;
      const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (Math.abs(area) < 1e-12) continue;
      const x0 = Math.max(0, Math.ceil(Math.min(ax, bx, cx) - 0.5));
      const x1 = Math.min(W - 1, Math.floor(Math.max(ax, bx, cx) - 0.5));
      const y0 = Math.max(0, Math.ceil(Math.min(ay, by, cy) - 0.5));
      const y1 = Math.min(H - 1, Math.floor(Math.max(ay, by, cy) - 0.5));
      const inv = 1 / area;
      for (let y = y0; y <= y1; y++) {
        const py = y + 0.5;
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5;
          const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) * inv;
          const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) * inv;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const k = w0 * ka + w1 * kb + w2 * kc;
          const i = y * W + x;
          if (k <= (key[i] ?? 0)) continue;
          key[i] = k;
          part[i] = pi;
          tri[i] = t0 + t;
          // Perspective-correct weights (orthographic keys are linear already).
          const p0 = cam.ortho ? w0 : (w0 * ka) / k;
          const p1 = cam.ortho ? w1 : (w1 * kb) / k;
          bw[i * 3] = p0;
          bw[i * 3 + 1] = p1;
          bw[i * 3 + 2] = 1 - p0 - p1;
        }
      }
    }
    t0 += I.length / 3;
  });
  const normal = new Float32Array(W * H * 3);
  const z = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const pi = part[i] ?? -1;
    const m = meshes[pi]?.[1];
    if (!m) continue;
    const t = (tri[i] ?? 0) - (base[pi] ?? 0);
    let nx = 0;
    let ny = 0;
    let nz = 0;
    let wz = 0;
    for (let k = 0; k < 3; k++) {
      const v = m.indices[t * 3 + k] ?? 0;
      const w = bw[i * 3 + k] ?? 0;
      nx += w * (m.normals[v * 3] ?? 0);
      ny += w * (m.normals[v * 3 + 1] ?? 0);
      nz += w * (m.normals[v * 3 + 2] ?? 0);
      wz += w * (m.positions[v * 3 + 2] ?? 0);
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    normal[i * 3] = nx / l;
    normal[i * 3 + 1] = ny / l;
    normal[i * 3 + 2] = nz / l;
    z[i] = wz;
  }
  return { width: W, height: H, names, part, tri, normal, z };
}

/** Orthographic camera looking at `asset` from azimuth/elevation (degrees, camera.ts convention:
 * az 0 = front +X, −90 = the −Y side), framing its world bounds in a square `size` image. */
export function orthoCamera(
  asset: CompiledAsset,
  azDeg: number,
  elDeg: number,
  size: number,
): ViewCamera {
  const az = (azDeg * Math.PI) / 180;
  const el = (elDeg * Math.PI) / 180;
  const f: V3 = [-Math.cos(el) * Math.cos(az), -Math.cos(el) * Math.sin(az), -Math.sin(el)];
  const rl = Math.hypot(f[1], f[0]) || 1;
  const r: V3 = [f[1] / rl, -f[0] / rl, 0];
  const u: V3 = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  let s0 = Infinity;
  let s1 = -Infinity;
  let t0 = Infinity;
  let t1 = -Infinity;
  for (const m of worldMeshes(asset.parts).values())
    for (let v = 0; v < m.positions.length; v += 3) {
      const x = m.positions[v] ?? 0;
      const y = m.positions[v + 1] ?? 0;
      const z = m.positions[v + 2] ?? 0;
      const s = x * r[0] + y * r[1];
      const t = x * u[0] + y * u[1] + z * u[2];
      s0 = Math.min(s0, s);
      s1 = Math.max(s1, s);
      t0 = Math.min(t0, t);
      t1 = Math.max(t1, t);
    }
  if (!Number.isFinite(s0)) [s0, s1, t0, t1] = [-0.5, 0.5, -0.5, 0.5];
  const cs = (s0 + s1) / 2;
  const ct = (t0 + t1) / 2;
  const span = Math.max(s1 - s0, t1 - t0, 1e-6) * 1.08;
  const focal = size / span;
  // Eye = the frame centre (on the r/u plane through the origin) pulled back along −f; ortho depth
  // only orders, so any distance past the bounds works.
  const back = 1e4;
  const eye: V3 = [
    cs * r[0] + ct * u[0] - f[0] * back,
    cs * r[1] + ct * u[1] - f[1] * back,
    ct * u[2] - f[2] * back,
  ];
  return {
    eye,
    r,
    u,
    f,
    focal,
    cx: size / 2,
    cy: size / 2,
    width: size,
    height: size,
    ortho: true,
  };
}
