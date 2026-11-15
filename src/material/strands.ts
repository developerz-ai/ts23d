// The strand atlas: cutout clump cells painted into ONE custom strip row (`fur_clumps`,
// `hair_clumps` in creature.ts), so every hair/fur card of an asset is one draw on the shared
// sheet. The row splits along U into `STRAND_CELLS` cells; each holds one clump of seeded tapered
// strands running root (low U) → tip (high U) across the inner V band, with alpha = coverage,
// a root → tip tone ramp (vertex colour carries the hue) and a per-strand height ridge for the
// normal map. Variants: fur (dense short), guard (sparse, dark-tipped), hair (long, fine), beard
// (wiry). Cards map with `strandCells(strip, kind)`: the cell rects in sheet UV.

import { createRng, Ts23dError } from '../core/index.ts';
import type { MaterialPainter } from './paint/types.ts';
import { STRIP_H, type StripId, stripRect, type UvRect } from './trim-sheet.ts';

export type StrandKind = 'fur' | 'guard' | 'hair' | 'beard';
export type StrandStrip = 'fur_clumps' | 'hair_clumps';

/** Cells per strand row (512 px each at the 4096² house size). */
export const STRAND_CELLS = 8;
/** Inner band of a cell the strands fill (fractions): the strip pad replicates the outer rows. */
const BAND_V = 0.14;
const BAND_U = 0.02;

/** What each cell of each strand strip holds, in U order. */
export const STRAND_LAYOUT: Readonly<Record<StrandStrip, readonly StrandKind[]>> = {
  fur_clumps: ['fur', 'fur', 'fur', 'fur', 'guard', 'guard', 'guard', 'guard'],
  hair_clumps: ['hair', 'hair', 'hair', 'hair', 'hair', 'beard', 'beard', 'beard'],
};

interface Clump {
  /** Strands per cell (15–40: a card shows a clump, not one hair). */
  readonly count: number;
  /** Root radius as a share of the band (≥ 0.035: thinner strands vanish in the alpha mips). */
  readonly width: number;
  /** Roots spread over this share of the band; pull toward the clump axis at the tip (0..1). */
  readonly spread: number;
  readonly clump: number;
  /** Where a strand starts (share of the cell, staggered) and its length range. */
  readonly start: number;
  readonly length: readonly [number, number];
  /** Sideways wave amplitude (share of the band) and waves per cell. */
  readonly wave: number;
  readonly waves: number;
  /** Tone along the strand, [t, linear grey] stops (vertex colour multiplies it). */
  readonly tone: readonly (readonly [number, number])[];
}

const CLUMPS: Readonly<Record<StrandKind, Clump>> = {
  // Undercoat: soft, pale, wavy, short strands.
  fur: {
    count: 20,
    width: 0.04,
    spread: 0.8,
    clump: 0.45,
    start: 0.25,
    length: [0.45, 0.75],
    wave: 0.04,
    waves: 2,
    tone: [
      [0, 0.62],
      [0.5, 0.86],
      [1, 0.95],
    ],
  },
  // Agouti guard hair (wolf, many canids and rodents): grey base, pale band, dark tip.
  guard: {
    count: 16,
    width: 0.042,
    spread: 0.7,
    clump: 0.7,
    start: 0.15,
    length: [0.7, 1],
    wave: 0.015,
    waves: 1,
    tone: [
      [0, 0.55],
      [0.3, 0.7],
      [0.4, 1.05],
      [0.52, 1],
      [0.62, 0.3],
      [1, 0.14],
    ],
  },
  hair: {
    count: 26,
    width: 0.036,
    spread: 0.8,
    clump: 0.5,
    start: 0.12,
    length: [0.65, 0.88],
    wave: 0.035,
    waves: 1.5,
    tone: [
      [0, 0.6],
      [0.5, 0.9],
      [1, 1.05],
    ],
  },
  beard: {
    count: 22,
    width: 0.04,
    spread: 0.85,
    clump: 0.3,
    start: 0.2,
    length: [0.45, 0.8],
    wave: 0.08,
    waves: 3,
    tone: [
      [0, 0.55],
      [0.6, 0.85],
      [1, 0.95],
    ],
  },
};

const ramp = (stops: Clump['tone'], t: number): number => {
  let prev = stops[0] ?? [0, 1];
  for (const st of stops) {
    if (t <= st[0]) {
      const f = st[0] > prev[0] ? (t - prev[0]) / (st[0] - prev[0]) : 0;
      return prev[1] + (st[1] - prev[1]) * f;
    }
    prev = st;
  }
  return prev[1];
};

/** UV rects (sheet space) of the cells of `strip` that hold `kind`; the strip must be defined. */
export function strandCells(strip: StrandStrip, kind: StrandKind): UvRect[] {
  // Strand strips are project materials (`defineMaterial(CREATURE_MATERIALS[strip])`).
  const row = stripRect(strip as StripId);
  const cells = STRAND_LAYOUT[strip].map((k, i) => (k === kind ? i : -1)).filter((i) => i >= 0);
  if (cells.length === 0)
    throw new Ts23dError('T3D_MATERIAL_UNKNOWN', {
      cause: `strand strip '${strip}' has no '${kind}' cells`,
      fix: `use ${Object.entries(STRAND_LAYOUT)
        .map(([s, l]) => `${s}: ${[...new Set(l)].join('/')}`)
        .join('; ')}`,
    });
  const cw = (row.u1 - row.u0) / STRAND_CELLS;
  return cells.map((i) => ({
    u0: row.u0 + (i + BAND_U) * cw,
    u1: row.u0 + (i + 1 - BAND_U) * cw,
    v0: row.v0 + BAND_V * STRIP_H,
    v1: row.v1 - BAND_V * STRIP_H,
    metres: (row.metres * (1 - 2 * BAND_U)) / STRAND_CELLS,
  }));
}

const gauss = (r: () => number): number => {
  const u = Math.max(1e-9, r());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
};

/** A painter for a strand strip: clumps per `layout`, deterministic from the sheet seed. */
export function strandPainter(layout: readonly StrandKind[]): MaterialPainter {
  return (s, kit) => {
    const { w, h } = s;
    const cov = new Float32Array(w * h);
    const tone = new Float32Array(w * h).fill(0.8);
    const cw = w / layout.length;
    const y0 = BAND_V * h;
    const band = h * (1 - 2 * BAND_V);
    layout.forEach((kind, cell) => {
      const c = CLUMPS[kind];
      const rng = createRng(kit.seed + cell * 7919);
      const r = (): number => rng.next();
      const x0 = cw * (cell + BAND_U);
      const len = cw * (1 - 2 * BAND_U);
      const axis = 0.5 + gauss(r) * 0.04;
      for (let k = 0; k < c.count; k++) {
        // Stratified roots across the band (gaps between strands), staggered along the cell.
        const root = 0.5 + c.spread * ((k + 0.2 + 0.6 * r()) / c.count - 0.5);
        const tip = root + (axis - root) * c.clump + gauss(r) * 0.03;
        const t0 = c.start * r();
        const L = len * Math.min(1 - t0, c.length[0] + (c.length[1] - c.length[0]) * r());
        const phase = r() * Math.PI * 2;
        const rw = band * c.width * (0.75 + 0.5 * r());
        const shade = 0.72 + 0.5 * r();
        const steps = Math.ceil(L / 0.5);
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          // Taper to nothing: the tip is a point, never a cut edge.
          const rad = rw * (1 - t) ** 0.8;
          if (rad < 0.15) break;
          const yv =
            root + (tip - root) * t * t + c.wave * Math.sin(phase + t * c.waves * Math.PI * 2) * t;
          const px = x0 + len * t0 + L * t;
          const py = y0 + band * Math.max(0.03, Math.min(0.97, yv));
          const tn = ramp(c.tone, t) * shade;
          for (let y = Math.floor(py - rad - 1); y <= Math.ceil(py + rad + 1); y++) {
            if (y < 0 || y >= h) continue;
            for (let x = Math.floor(px - rad - 1); x <= Math.ceil(px + rad + 1); x++) {
              if (x < 0 || x >= w) continue;
              const d = Math.hypot(x + 0.5 - px, y + 0.5 - py);
              const a = Math.min(1, Math.max(0, rad + 0.5 - d));
              const j = y * w + x;
              if (a >= (cov[j] ?? 0)) tone[j] = tn;
              cov[j] = Math.max(cov[j] ?? 0, a);
            }
          }
        }
      }
    });
    const rgba = new Uint8Array(w * h * 4);
    for (let j = 0; j < w * h; j++) {
      const a = cov[j] ?? 0;
      const g = Math.round(255 * Math.min(1, tone[j] ?? 0.8) ** (1 / 2.2));
      rgba.set([g, g, g, Math.round(a * 255)], j * 4);
      s.height[j] = a * 0.0004;
      s.rough[j] = 0.5;
    }
    s.rgba = rgba;
  };
}
