// The Amur winter ruff (head-local frame): the long white cheek fur that flares out and back
// below the ears into "side-burns", the fuller nape, the chin beard — the subspecies' winter
// signature (Geptner & Sludskij 1972: head fur "markedly longer … almost covering the ears").
// Masses first (the lobes), then clumps: tufts that point back and out along the fur's lie,
// sized big → medium → small so the edge breaks into locks rather than a smooth shell.

import type { SculptEdit, Vec3 } from '@developerz.ai/ts23d';
import { hash } from './stripes.ts';

/** A tuft cone from `at` along `dir` (need not be unit). */
export function tuftEdit(at: Vec3, dir: Vec3, len: number, r: number, blend: number): SculptEdit {
  return {
    shape: 'cone',
    at,
    size: [r, r * 0.12, len],
    rotate: [
      0,
      (Math.atan2(Math.hypot(dir[0], dir[1]), dir[2]) * 180) / Math.PI,
      (Math.atan2(dir[1], dir[0]) * 180) / Math.PI,
    ],
    blend,
  };
}

/** Ruff masses: the cheek lobes below/behind the eyes and the throat under the jaw. */
export function ruffMasses(): SculptEdit[] {
  return [
    // Cheek lobe: from behind the eye down past the jaw corner, flaring sideways.
    {
      shape: 'ellipsoid',
      at: [0.07, 0.1, -0.035],
      size: [0.09, 0.056, 0.095],
      rotate: [0, 18, 0],
      blend: 0.04,
    },
    // Back of the cheek, merging into the neck's mane.
    { shape: 'ellipsoid', at: [0.01, 0.085, 0.0], size: [0.07, 0.07, 0.1], blend: 0.05 },
    // Under the jaw (the throat fur), behind the chin.
    { shape: 'ellipsoid', at: [0.08, 0, -0.1], size: [0.09, 0.07, 0.05], blend: 0.05 },
  ];
}

/** Ruff clumps along the lobe's outer edge (left; mirrored), and a few on the crown. */
export function ruffTufts(lod: number): SculptEdit[] {
  if (lod === 2) return [];
  const out: SculptEdit[] = [];
  const n = lod === 0 ? 11 : 6;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    // Along an arc from below the ear (top) round the cheek to under the jaw (bottom).
    const a = (-70 + t * 150) * (Math.PI / 180);
    const at: Vec3 = [
      0.07 - 0.05 * Math.cos(a) + 0.01,
      0.13 - 0.012 * Math.abs(Math.sin(a)),
      0.05 * Math.sin(-a) - 0.03,
    ];
    const dir: Vec3 = [-0.55 + 0.25 * t, 0.75, -0.25 - 0.55 * t];
    // Big → small rhythm: every third tuft long, others medium/short.
    const big = i % 3 === 1 ? 1.35 : 0.8 + 0.3 * hash(i, 71);
    out.push(tuftEdit(at, dir, 0.045 * big, 0.024 * big, 0.016));
  }
  return out;
}
