// D60: the coat texture drew rings round the muzzle and wood grain down the flanks. A sculpt maps
// its strip by box projection (U/V along world axes), and `fur_neutral` held directional strands
// at 2:1 contrast, so wherever the projection axis crossed the hair's lie the strands became
// bands. Measured here as the strip texel's banding along the muzzle axis: the relative RMS of the
// texture term (sheet albedo at each surface point's UV), binned per millimetre from atlas to
// nose and detrended over ±10 mm. Pre-fix 0.050 at LOD1; the isotropic strip gives ~0.02.

import { describe, expect, it } from 'bun:test';
import {
  compile,
  creaturePlan,
  DEFAULT_SHEET,
  dmath,
  sheetFor,
  type Vec3,
  worldMeshes,
} from '@developerz.ai/ts23d';
import { WOLF, wolf } from './wolf.ts';

const SLOW = 120_000;

/** Relative RMS of the strip texel's luminance along the muzzle (atlas → nose, 50–92 %). */
function muzzleBanding(lod: 0 | 1): number {
  const a = compile(wolf, { lod });
  const sheet = sheetFor(a, { ...DEFAULT_SHEET, size: 1024 });
  const { bones } = creaturePlan(WOLF);
  const A = bones.head.atlas;
  const N = bones.nose;
  const len = dmath.hypot(N[0] - A[0], N[1] - A[1], N[2] - A[2]);
  const ax: Vec3 = [(N[0] - A[0]) / len, (N[1] - A[1]) / len, (N[2] - A[2]) / len];
  const along = (p: Vec3): number =>
    (p[0] - A[0]) * ax[0] + (p[1] - A[1]) * ax[1] + (p[2] - A[2]) * ax[2];
  const m = new Map(worldMeshes(a.parts)).get('head');
  expect(m).toBeDefined();
  if (!m) return Infinity;
  const n = sheet.size;
  const lin = (v: number): number => dmath.pow(v / 255, 2.2);
  const bins = new Float64Array(400);
  const count = new Float64Array(400);
  let seed = 1;
  const rnd = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296 /* 2^32 */;
  };
  const I = m.indices;
  for (let t = 0; t < I.length; t += 3) {
    const v = [I[t] ?? 0, I[t + 1] ?? 0, I[t + 2] ?? 0];
    const axis = (b: readonly number[], k: number): number =>
      v.reduce((s, vi, j) => s + (m.positions[vi * 3 + k] ?? 0) * (b[j] ?? 0), 0);
    const p = (b: readonly number[]): Vec3 => [axis(b, 0), axis(b, 1), axis(b, 2)];
    const c = along(p([1 / 3, 1 / 3, 1 / 3])) / len;
    if (c < 0.5 || c > 0.92) continue;
    for (let k = 0; k < 12; k++) {
      let b1 = rnd();
      let b2 = rnd();
      if (b1 + b2 > 1) [b1, b2] = [1 - b1, 1 - b2];
      const b = [1 - b1 - b2, b1, b2];
      const uv = [0, 1].map((q) =>
        v.reduce((s, vi, j) => s + (m.uvs[vi * 2 + q] ?? 0) * (b[j] ?? 0), 0),
      );
      const x = Math.min(n - 1, Math.max(0, Math.floor(((((uv[0] ?? 0) % 1) + 1) % 1) * n)));
      const y = Math.min(n - 1, Math.max(0, Math.floor((uv[1] ?? 0) * n)));
      const o = (y * n + x) * 4;
      const al = sheet.albedo;
      const lum =
        0.2126 * lin(al[o] ?? 0) + 0.7152 * lin(al[o + 1] ?? 0) + 0.0722 * lin(al[o + 2] ?? 0);
      const mm = Math.floor(along(p(b)) * 1000);
      if (mm >= 0 && mm < 400) {
        bins[mm] = (bins[mm] ?? 0) + lum;
        count[mm] = (count[mm] ?? 0) + 1;
      }
    }
  }
  const xs: number[] = [];
  for (let i = 0; i < 400; i++) if ((count[i] ?? 0) > 3) xs.push((bins[i] ?? 0) / (count[i] ?? 1));
  let sum = 0;
  for (let i = 0; i < xs.length; i++) {
    const win = xs.slice(Math.max(0, i - 10), i + 11);
    const mean = win.reduce((s, q) => s + q, 0) / win.length;
    sum += dmath.pow((xs[i] ?? 0) / mean - 1, 2);
  }
  expect(xs.length).toBeGreaterThan(60);
  return Math.sqrt(sum / xs.length);
}

describe('wolf coat albedo (D60)', () => {
  it(
    'fails on rings: the strip texture barely varies along the muzzle (relative RMS ≤ 0.03)',
    () => {
      expect(muzzleBanding(1)).toBeLessThanOrEqual(0.03);
    },
    SLOW,
  );
});
