// mockFinish: a deterministic procedural stand-in for an image model, for tests, demos and CI. It
// "paints" each view from the control maps alone — unlit base colour plus grime pooling low, soot
// and dirt in creases, worn convex edges, rust streaks running down vertical faces, moss on top
// faces, a per-part tint — all noise in WORLD space, so every view agrees and the bake is clean.
// Keywords in the prompt pick the effects: rust, soot/grime/dirt, moss, worn/chipped, clean.

import { encodePng } from '../core/index.ts';
import type { ControlView, FinishModel, FinishRequest } from './types.ts';

function hash3(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x9e3779b1) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth 3D value noise in 0..1. */
export function noise3(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const s = (t: number): number => t * t * (3 - 2 * t);
  const fx = s(x - ix);
  const fy = s(y - iy);
  const fz = s(z - iz);
  let acc = 0;
  for (let k = 0; k < 8; k++) {
    const dx = k & 1;
    const dy = (k >> 1) & 1;
    const dz = (k >> 2) & 1;
    const w = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
    acc += w * hash3(ix + dx, iy + dy, iz + dz, seed);
  }
  return acc;
}

const fbm = (x: number, y: number, z: number, seed: number): number =>
  0.55 * noise3(x, y, z, seed) +
  0.3 * noise3(x * 2.1, y * 2.1, z * 2.1, seed + 1) +
  0.15 * noise3(x * 4.3, y * 4.3, z * 4.3, seed + 2);

const nameHash = (s: string, seed: number): number => {
  let h = 0x811c9dc5 ^ seed;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h / 4294967296;
};

interface Effects {
  readonly grime: number;
  readonly rust: number;
  readonly moss: number;
  readonly wear: number;
}

export function effectsOf(prompt: string): Effects {
  const p = prompt.toLowerCase();
  const has = (...w: string[]): boolean => w.some((x) => p.includes(x));
  const clean = has('clean', 'new', 'pristine');
  return {
    grime: has('soot', 'grime', 'dirt', 'mud') ? 1 : clean ? 0.15 : 0.6,
    rust: has('rust', 'corro') ? 1 : clean ? 0 : 0.35,
    moss: has('moss', 'overgrown', 'lichen') ? 1 : 0,
    wear: has('worn', 'chip', 'scratch', 'old') ? 1 : clean ? 0.1 : 0.5,
  };
}

const mix = (a: number, b: number, t: number): number => a + (b - a) * Math.max(0, Math.min(1, t));

function paintView(
  v: ControlView,
  parts: readonly string[],
  fx: Effects,
  seed: number,
  zmin: number,
  zspan: number,
): Uint8Array {
  const W = v.width;
  const out = new Uint8Array(W * v.height * 4);
  for (let i = 0; i < W * v.height; i++) {
    const part = v.part[i] ?? -1;
    if (part < 0) continue;
    const [x, y, z] = [
      v.position[i * 3] ?? 0,
      v.position[i * 3 + 1] ?? 0,
      v.position[i * 3 + 2] ?? 0,
    ];
    const nz = v.normal[i * 3 + 2] ?? 0;
    // Convexity from neighbours: a neighbour behind this pixel's tangent plane = a convex edge.
    let convex = 0;
    let concave = 0;
    for (const j of [i - 1, i + 1, i - W, i + W]) {
      if (j < 0 || j >= W * v.height || v.part[j] !== part) continue;
      // A depth jump is an occlusion edge (something in front), not a crease or a corner.
      if (Math.abs((v.depth[j] ?? 0) - (v.depth[i] ?? 0)) > 0.02 * (v.depth[i] ?? 1)) continue;
      const d = [0, 1, 2].map((k) => (v.position[j * 3 + k] ?? 0) - (v.position[i * 3 + k] ?? 0));
      const nd = [0, 1, 2].reduce((s, k) => s + (v.normal[i * 3 + k] ?? 0) * (d[k] ?? 0), 0);
      const len = Math.hypot(d[0] ?? 0, d[1] ?? 0, d[2] ?? 0) || 1;
      const c = nd / len;
      if (c < -0.25) convex = Math.max(convex, Math.min(1, -c));
      if (c > 0.25) concave = Math.max(concave, Math.min(1, c));
    }
    let [r, g, b] = [v.albedo[i * 4] ?? 0, v.albedo[i * 4 + 1] ?? 0, v.albedo[i * 4 + 2] ?? 0];
    const tint = 0.94 + 0.12 * nameHash(parts[part] ?? '', seed);
    [r, g, b] = [r * tint, g * tint, b * tint];
    const n = fbm(x * 3, y * 3, z * 3, seed);
    // Grime pools low and in creases.
    const low = Math.max(0, 1 - (z - zmin) / (0.4 * zspan));
    const grime = fx.grime * Math.min(1, 0.65 * low * (0.6 + 0.8 * n) + 0.8 * concave);
    [r, g, b] = [mix(r, 48, grime * 0.55), mix(g, 40, grime * 0.55), mix(b, 32, grime * 0.55)];
    // Rust: patches plus streaks running down vertical faces.
    const streak = fbm(x * 9, y * 9, z * 1.4, seed + 7) * (1 - Math.abs(nz));
    const rust =
      fx.rust * Math.max(0, Math.max(n - 0.58, 0) * 3 + Math.max(streak - 0.45, 0) * 2.2);
    [r, g, b] = [mix(r, 118, rust), mix(g, 62, rust), mix(b, 34, rust)];
    // Moss on up-facing surfaces.
    const moss =
      fx.moss *
      Math.max(0, nz - 0.6) *
      2.5 *
      Math.max(0, fbm(x * 5, y * 5, z * 5, seed + 3) - 0.35) *
      2;
    [r, g, b] = [mix(r, 70, moss), mix(g, 92, moss), mix(b, 38, moss)];
    // Worn convex edges show lighter bare material.
    const wear = fx.wear * convex * (0.5 + noise3(x * 20, y * 20, z * 20, seed + 5));
    [r, g, b] = [mix(r, 170, wear * 0.45), mix(g, 165, wear * 0.45), mix(b, 155, wear * 0.45)];
    out.set(
      [r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c)))),
      i * 4,
    );
    out[i * 4 + 3] = 255;
  }
  return out;
}

export const MOCK_MODEL_ID = 'mock-weathering-v1';

/** The procedural "AI": same request → same PNG bytes. */
export function mockFinish(): FinishModel {
  return {
    id: MOCK_MODEL_ID,
    licence: 'generated by ts23d mockFinish (procedural, no model): same licence as the asset',
    run(req: FinishRequest): Promise<Uint8Array[]> {
      const fx = effectsOf(req.prompt);
      let zmin = Infinity;
      let zmax = -Infinity;
      for (const v of req.views.views)
        for (let i = 0; i < v.part.length; i++)
          if ((v.part[i] ?? -1) >= 0) {
            const z = v.position[i * 3 + 2] ?? 0;
            zmin = Math.min(zmin, z);
            zmax = Math.max(zmax, z);
          }
      const span = Math.max(zmax - zmin, 1e-3);
      return Promise.resolve(
        req.views.views.map((v) =>
          encodePng(v.width, v.height, paintView(v, req.views.parts, fx, req.seed | 0, zmin, span)),
        ),
      );
    },
  };
}
