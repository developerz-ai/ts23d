// HOW (colour): one coverage effect laid into vertex colour. Select the eligible surface, score it
// (seeded world-space noise + what makes physical sense: sharp edges chip first, low surfaces get
// muddy first), cover exactly `amount` of it, move the colour toward the effect's look, trace rust
// streaks downhill, and measure what landed where physics forbids it.

import type { Vec3 } from '../core/index.ts';
import { cover, fbm, measured } from './weather-mask.ts';
import { type Scene, select } from './weather-select.ts';
import { traceStreaks } from './weather-streaks.ts';
import type { CoverEffect, CoverName, RustEffect } from './weather-types.ts';

interface Look {
  readonly color: Vec3;
  readonly strength: number;
  /** Noise feature size, metres; stretch makes scratches into lines. */
  readonly cell: number;
  readonly stretch?: readonly [number, number, number];
}

export const BARE_STEEL: Vec3 = [0.3, 0.3, 0.29];

const LOOKS: Readonly<Record<CoverName, Look>> = {
  chips: { color: BARE_STEEL, strength: 0.9, cell: 0.035 },
  scratches: { color: BARE_STEEL, strength: 0.55, cell: 0.03, stretch: [0.25, 0.25, 6] },
  rust: { color: [0.2, 0.065, 0.02], strength: 0.85, cell: 0.03 },
  moss: { color: [0.06, 0.1, 0.02], strength: 0.85, cell: 0.1 },
  mud: { color: [0.09, 0.06, 0.03], strength: 0.85, cell: 0.07 },
  dust: { color: [0.5, 0.44, 0.35], strength: 0.5, cell: 0.2 },
  bleach: { color: [1, 1, 1], strength: 0.6, cell: 0.35 },
};

const STREAK: Vec3 = [0.34, 0.12, 0.03];

export interface PaintResult {
  readonly where: string;
  readonly amount: number;
  readonly actual: number;
  readonly area: number;
  readonly misplaced: number;
  readonly streaks?: number;
  readonly upward?: number;
}

const lum = (c: Vec3): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

export function paintEffect(
  sc: Scene,
  colors: Float32Array,
  name: CoverName,
  eff: CoverEffect,
  where: string,
  amount: number,
  seed: number,
  under: Vec3,
): PaintResult {
  const s = sc.s;
  const m = s.mesh;
  const look = LOOKS[name];
  const target = eff.color ?? (name === 'chips' || name === 'scratches' ? under : look.color);
  const strength = eff.strength ?? look.strength;
  const weight = select(sc, where);
  const score = new Float32Array(s.vertices);
  const jitter = new Float32Array(s.vertices);
  for (let v = 0; v < s.vertices; v++) {
    const g = s.group[v] ?? 0;
    const p: [number, number, number] = [
      s.gp[g * 3] ?? 0,
      s.gp[g * 3 + 1] ?? 0,
      s.gp[g * 3 + 2] ?? 0,
    ];
    const n = fbm(seed, p, look.cell, look.stretch);
    const bias =
      name === 'chips'
        ? 1.5 * -(s.convex[g] ?? 0)
        : name === 'mud'
          ? 1.2 * (1 - (p[2] - sc.ground) / Math.max(1e-3, sc.band))
          : name === 'moss'
            ? 0.8 * Math.max(0, 1 - (p[2] - sc.ground) / Math.max(1e-3, sc.band * 3))
            : name === 'dust'
              ? 0.3 * (m.normals[v * 3 + 2] ?? 0)
              : 0.3 * (weight[v] ?? 0);
    score[v] = n + bias;
    jitter[v] = fbm(seed + 101, p, look.cell * 0.5);
  }
  const cov = cover(weight, score, s.area, amount);
  const mix = (v: number, to: Vec3, k: number): void => {
    for (let c = 0; c < 3; c++) {
      const i = v * 3 + c;
      colors[i] = (colors[i] ?? 0) + ((to[c] ?? 0) - (colors[i] ?? 0)) * k;
    }
  };
  for (let v = 0; v < s.vertices; v++) {
    const k = (cov.mask[v] ?? 0) * strength * (0.75 + 0.5 * ((jitter[v] ?? 0.5) - 0.5));
    if (k <= 0) continue;
    if (name === 'bleach') {
      const c: Vec3 = [colors[v * 3] ?? 0, colors[v * 3 + 1] ?? 0, colors[v * 3 + 2] ?? 0];
      const l = lum(c);
      mix(
        v,
        [(c[0] * 0.3 + l * 0.7) * 1.3, (c[1] * 0.3 + l * 0.7) * 1.3, (c[2] * 0.3 + l * 0.7) * 1.3],
        k,
      );
    } else mix(v, target, k);
  }
  const res: PaintResult = {
    where,
    amount,
    actual: measured(cov.mask, weight, s.area),
    area: cov.eligibleArea,
    misplaced: misplacedOf(sc, name, cov.mask),
  };
  const rust = eff as RustEffect;
  if (name !== 'rust' || !rust.streaks) return res;
  const sources = new Float32Array(s.groups);
  for (let v = 0; v < s.vertices; v++) if ((cov.mask[v] ?? 0) >= 0.5) sources[s.group[v] ?? 0] = 1;
  const meander = (g: number): number =>
    fbm(seed + 7, [s.gp[g * 3] ?? 0, s.gp[g * 3 + 1] ?? 0, s.gp[g * 3 + 2] ?? 0], 0.05);
  const st = traceStreaks(s, sources, rust.streakLength ?? 0.35, meander);
  for (let v = 0; v < s.vertices; v++) {
    const lv = st.level[s.group[v] ?? 0] ?? 0;
    if (lv > 0) mix(v, STREAK, lv * 0.95 * (0.75 + 0.5 * ((jitter[v] ?? 0.5) - 0.5)));
  }
  return { ...res, streaks: st.segments, upward: st.upward };
}

/** Covered area fraction sitting where the effect cannot physically be. */
function misplacedOf(sc: Scene, name: CoverName, mask: Float32Array): number {
  const s = sc.s;
  const m = s.mesh;
  let bad = 0;
  let all = 0;
  for (let v = 0; v < s.vertices; v++) {
    const a = (s.area[v] ?? 0) * (mask[v] ?? 0);
    if (a <= 0) continue;
    all += a;
    const nz = m.normals[v * 3 + 2] ?? 0;
    const h = (s.gp[(s.group[v] ?? 0) * 3 + 2] ?? 0) - sc.ground;
    const wrong =
      name === 'dust' || name === 'bleach'
        ? nz < -0.3 // settles and fades only where it faces the sky
        : name === 'moss'
          ? nz < -0.6 && h > sc.band // a dry underside, off the ground
          : name === 'mud'
            ? h > Math.max(1, sc.band * 3) // splash never climbs that high
            : false;
    if (wrong) bad += a;
  }
  return all > 0 ? bad / all : 0;
}
