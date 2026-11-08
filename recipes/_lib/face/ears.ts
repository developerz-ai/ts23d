// Ear reshaping on the warped base, ear vertices only: the thin-plate warp is too smooth to pull
// a point out of the helix, so the ears get their own deformer. A soft mask (1 on the ear, easing
// to 0 across its root on the side of the head — no seam) weights three moves, about the warped
// ear landmarks: swing the whole ear out from the head about its root axis, stretch it along its
// length, and pull the helix top into a tip (elf, goblin, orc points).

import type { Vec3 } from '@developerz.ai/ts23d';
import type { QuadMesh } from './base.ts';
import { BASE_H } from './landmarks.ts';

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Ear weight per base vertex (left and right): 1 on the ear, 0 off it, smooth over the root. */
export function earMask(base: QuadMesh): Float32Array {
  const V = base.p.length / 3;
  const w = new Float32Array(V);
  for (let v = 0; v < V; v++) {
    const x = base.p[v * 3] ?? 0;
    const y = Math.abs(base.p[v * 3 + 1] ?? 0);
    const z = base.p[v * 3 + 2] ?? 0;
    // Ear box on the base (side depth plot): x 0.02–0.075, z 0.675–0.75; the head's side there
    // sits at |y| ≈ 0.071, the auricle stands out past 0.076.
    const box =
      smooth(0.012, 0.024, x) *
      smooth(0.082, 0.07, x) *
      smooth(0.668, 0.68, z) *
      smooth(0.755, 0.742, z);
    w[v] = box * smooth(0.0705, 0.0765, y);
  }
  return w;
}

export interface EarShape {
  /** Length × along lobe → top. */
  readonly length: number;
  /** Tip pull at the helix top, ΔH (back, out, up). */
  readonly tip: Vec3;
  /** Swing out from the head, degrees. */
  readonly out: number;
}

export interface EarFrame {
  readonly top: Vec3;
  readonly lobe: Vec3;
  readonly tragion: Vec3;
}

/** Reshape both ears in place (`p` = warped positions; frames are the warped left landmarks,
 *  the right ear mirrors them). */
export function shapeEars(
  p: Float64Array,
  mask: Float32Array,
  s: EarShape,
  l: EarFrame,
  r: EarFrame,
): void {
  if (s.length === 1 && s.out === 0 && s.tip.every((t) => t === 0)) return;
  const V = p.length / 3;
  for (let v = 0; v < V; v++) {
    const w = mask[v] ?? 0;
    if (w <= 0) continue;
    const side = (p[v * 3 + 1] ?? 0) >= 0 ? 1 : -1;
    const f = side > 0 ? l : r;
    const u0: Vec3 = [f.top[0] - f.lobe[0], f.top[1] - f.lobe[1], f.top[2] - f.lobe[2]];
    const len = Math.hypot(...u0) || 1;
    const u: Vec3 = [u0[0] / len, u0[1] / len, u0[2] / len];
    let q: [number, number, number] = [p[v * 3] ?? 0, p[v * 3 + 1] ?? 0, p[v * 3 + 2] ?? 0];
    // Swing about the root axis (through the tragion along u): the back edge moves outward.
    const a = (-side * s.out * w * Math.PI) / 180;
    if (a !== 0) {
      const d: Vec3 = [q[0] - f.tragion[0], q[1] - f.tragion[1], q[2] - f.tragion[2]];
      const along = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
      const perp: Vec3 = [d[0] - u[0] * along, d[1] - u[1] * along, d[2] - u[2] * along];
      const c: Vec3 = [
        u[1] * perp[2] - u[2] * perp[1],
        u[2] * perp[0] - u[0] * perp[2],
        u[0] * perp[1] - u[1] * perp[0],
      ];
      const cs = Math.cos(a);
      const sn = Math.sin(a);
      q = [
        f.tragion[0] + u[0] * along + perp[0] * cs + c[0] * sn,
        f.tragion[1] + u[1] * along + perp[1] * cs + c[1] * sn,
        f.tragion[2] + u[2] * along + perp[2] * cs + c[2] * sn,
      ];
    }
    // Stretch along the ear's length, from the lobe.
    const t = (q[0] - f.lobe[0]) * u[0] + (q[1] - f.lobe[1]) * u[1] + (q[2] - f.lobe[2]) * u[2];
    const k = t * (s.length - 1) * w;
    q = [q[0] + u[0] * k, q[1] + u[1] * k, q[2] + u[2] * k];
    // Tip: pull the helix top, falling off over ~60 % of the ear.
    const dist = Math.hypot(
      q[0] - f.top[0] - u[0] * k,
      q[1] - f.top[1] - u[1] * k,
      q[2] - f.top[2] - u[2] * k,
    );
    const g = Math.max(0, 1 - dist / (len * 0.75)) ** 2 * w;
    q = [
      q[0] - s.tip[0] * BASE_H * g,
      q[1] + side * s.tip[1] * BASE_H * g,
      q[2] + s.tip[2] * BASE_H * g,
    ];
    p.set(q, v * 3);
  }
}
