// Perspective rasteriser for the finish layer: per pixel the nearest (part, triangle) and its
// perspective-correct barycentrics, from world-space meshes and a render camera. The beauty
// renderer's vis-buffer does the same over a flattened scene; this one keeps part identity, which
// the part-id control map and the part-masked bake need. Strict depth test, fixed order: deterministic.

import type { Mesh } from '../core/index.ts';
import type { PerspectiveCamera } from '../render/index.ts';

export interface PartRaster {
  readonly width: number;
  readonly height: number;
  readonly part: Int32Array;
  readonly tri: Int32Array;
  readonly b1: Float32Array;
  readonly b2: Float32Array;
  /** 1 / view depth; 0 = background. */
  readonly invw: Float32Array;
}

/** Screen x, y and 1/depth (−1 behind the eye) of world point (x, y, z). */
export function toScreen(
  c: PerspectiveCamera,
  x: number,
  y: number,
  z: number,
): [number, number, number] {
  const dx = x - c.eye[0];
  const dy = y - c.eye[1];
  const dz = z - c.eye[2];
  const w = dx * c.f[0] + dy * c.f[1] + dz * c.f[2];
  const q = w > 1e-4 ? 1 / w : -1;
  return [
    c.cx + (dx * c.r[0] + dy * c.r[1] + dz * c.r[2]) * q * c.focal,
    c.cy - (dx * c.u[0] + dy * c.u[1] + dz * c.u[2]) * q * c.focal,
    q,
  ];
}

export function rasteriseParts(
  meshes: readonly (Mesh | null)[],
  cam: PerspectiveCamera,
): PartRaster {
  const W = cam.width;
  const H = cam.height;
  const part = new Int32Array(W * H).fill(-1);
  const tri = new Int32Array(W * H).fill(-1);
  const b1 = new Float32Array(W * H);
  const b2 = new Float32Array(W * H);
  const invw = new Float32Array(W * H);
  meshes.forEach((m, pi) => {
    if (!m) return;
    const nv = m.positions.length / 3;
    const sx = new Float32Array(nv);
    const sy = new Float32Array(nv);
    const iw = new Float32Array(nv);
    for (let v = 0; v < nv; v++) {
      const s = toScreen(
        cam,
        m.positions[v * 3] ?? 0,
        m.positions[v * 3 + 1] ?? 0,
        m.positions[v * 3 + 2] ?? 0,
      );
      sx[v] = s[0];
      sy[v] = s[1];
      iw[v] = s[2];
    }
    const I = m.indices;
    for (let t = 0; t < I.length / 3; t++) {
      const a = I[t * 3] ?? 0;
      const b = I[t * 3 + 1] ?? 0;
      const c = I[t * 3 + 2] ?? 0;
      const qa = iw[a] ?? -1;
      const qb = iw[b] ?? -1;
      const qc = iw[c] ?? -1;
      if (qa < 0 || qb < 0 || qc < 0) continue;
      const ax = sx[a] ?? 0;
      const ay = sy[a] ?? 0;
      const bx = sx[b] ?? 0;
      const by = sy[b] ?? 0;
      const cx = sx[c] ?? 0;
      const cy = sy[c] ?? 0;
      const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (Math.abs(area) < 1e-12) continue;
      const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
      const maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
      const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
      const maxY = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
      const inv = 1 / area;
      for (let y = minY; y <= maxY; y++) {
        const py = y + 0.5;
        for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5;
          const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) * inv;
          const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) * inv;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const z = w0 * qa + w1 * qb + w2 * qc;
          const i = y * W + x;
          if (z <= (invw[i] ?? 0)) continue;
          invw[i] = z;
          part[i] = pi;
          tri[i] = t;
          b1[i] = (w1 * qb) / z;
          b2[i] = (w2 * qc) / z;
        }
      }
    }
  });
  return { width: W, height: H, part, tri, b1, b2, invw };
}
