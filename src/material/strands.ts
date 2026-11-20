// The strand atlas: cutout clump cells painted into ONE custom strip row (`fur_clumps`,
// `hair_clumps` in creature.ts), so every hair/fur card of an asset is one draw on the shared
// sheet. The row splits along U into `STRAND_CELLS` cells; each holds one clump of seeded tapered
// strands running root (low U) → tip (high U) across the inner V band. A clump is 1–3 sub-clumps:
// strands start spread (dense, near-opaque root) and converge on their sub-clump's tip, the
// outer strands shorter, so a card ends in pointed locks with alpha gaps, never a cut edge. Alpha =
// coverage, a root → tip tone ramp (vertex colour carries the hue), a per-strand height ridge for
// the normal map. The clump kinds are strand-clumps.ts. Cards map with `strandCells(strip, kind)`:
// the cell rects in sheet UV. Transparent texels carry their strands' tone (`bleed`, D460).

import { createRng, dmath, Ts23dError } from '../core/index.ts';
import type { MaterialPainter } from './paint/types.ts';
import { CLUMPS, type Clump, type StrandKind } from './strand-clumps.ts';
import { STRIP_H, type StripId, stripRect, type UvRect } from './trim-sheet.ts';

export type { StrandKind } from './strand-clumps.ts';
export type StrandStrip = 'fur_clumps' | 'hair_clumps' | 'hair_locks';

/** Cells per strand row (512 px each at the 4096² house size). */
export const STRAND_CELLS = 8;
/** Inner band of a cell the strands fill (fractions): the strip pad replicates the outer rows. */
const BAND_V = 0.14;
const BAND_U = 0.02;

/** What each cell of each strand strip holds, in U order. */
export const STRAND_LAYOUT: Readonly<Record<StrandStrip, readonly StrandKind[]>> = {
  fur_clumps: ['fur', 'fur', 'fur', 'fur', 'guard', 'guard', 'guard', 'guard'],
  hair_clumps: ['hair', 'hair', 'hair', 'wisp', 'wisp', 'beard', 'beard', 'beard'],
  // The opt-in lock style (kinds/head-cards.ts `locks`): under-layer mass, locks, strays, coarse.
  hair_locks: ['mass', 'mass', 'lock', 'lock', 'lock', 'fly', 'coarse', 'coarse'],
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
  return Math.sqrt(-2 * dmath.log(u)) * dmath.cos(2 * Math.PI * r());
};

/**
 * Give every transparent texel the coverage-weighted mean tone of its column within its cell
 * (the same point along the strands; an empty column takes its nearest painted one), so filtering
 * across an alpha edge — our bilinear, any engine's — mixes like with like (D460: a light fill
 * there outlined every strand in pale specks).
 */
function bleed(cov: Float32Array, tone: Float32Array, w: number, h: number, cells: number): void {
  for (let cell = 0; cell < cells; cell++) {
    const x0 = Math.floor((w * cell) / cells);
    const x1 = Math.floor((w * (cell + 1)) / cells);
    const mean = new Float32Array(x1 - x0).fill(-1);
    for (let x = x0; x < x1; x++) {
      let s = 0;
      let n = 0;
      for (let y = 0; y < h; y++) {
        const a = cov[y * w + x] ?? 0;
        s += a * (tone[y * w + x] ?? 0);
        n += a;
      }
      if (n > 0) mean[x - x0] = s / n;
    }
    const near = (i: number): number => {
      for (let d = 1; d < mean.length; d++) {
        const l = mean[i - d] ?? -1;
        if (l >= 0) return l;
        const r = mean[i + d] ?? -1;
        if (r >= 0) return r;
      }
      return 0.8;
    };
    for (let x = x0; x < x1; x++) {
      const m = mean[x - x0] ?? -1;
      const t = m >= 0 ? m : near(x - x0);
      for (let y = 0; y < h; y++) if ((cov[y * w + x] ?? 0) <= 0) tone[y * w + x] = t;
    }
  }
  // Then the texels right beside a strand take its own tone (two rings of dilation), so the
  // filter footprint at the edge sees that strand, not its column's mean.
  let src = Uint8Array.from(cov, (a) => (a > 0 ? 1 : 0));
  for (let ring = 0; ring < 2; ring++) {
    const next = src.slice();
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const j = y * w + x;
        if (src[j]) continue;
        let s = 0;
        let n = 0;
        for (const k of [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, j - w, j + w])
          if (k >= 0 && k < w * h && src[k]) {
            s += tone[k] ?? 0;
            n++;
          }
        if (n > 0) {
          tone[j] = s / n;
          next[j] = 1;
        }
      }
    src = next;
  }
}

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
      // Sub-clump centres across the spread, each with its own tip.
      const subs = Array.from({ length: c.subs }, (_, i) => {
        const at = 0.5 + c.spread * ((i + 0.5) / c.subs - 0.5) + gauss(r) * 0.03;
        return { at, tip: at + (0.5 - at) * 0.35 + gauss(r) * 0.04 };
      });
      const half = c.spread / c.subs / 2;
      for (let k = 0; k < c.count; k++) {
        // Stratified roots across the band (gaps between strands), staggered along the cell.
        const root = 0.5 + c.spread * ((k + 0.2 + 0.6 * r()) / c.count - 0.5);
        let sub = subs[0] ?? { at: 0.5, tip: 0.5 };
        for (const q of subs) if (Math.abs(q.at - root) < Math.abs(sub.at - root)) sub = q;
        // Outer strands of a lock are shorter: the lock ends in a point.
        const e = Math.min(1, Math.abs(root - sub.at) / half);
        const tip = root + (sub.tip - root) * c.clump + gauss(r) * 0.02;
        const t0 = c.start * r();
        const reach = c.length[0] + (c.length[1] - c.length[0]) * r();
        const L = len * Math.min(1 - t0, reach * (1 - c.point * e * e));
        const phase = r() * Math.PI * 2;
        const rw = band * c.width * (0.75 + 0.5 * r());
        const [s0, s1] = c.shade ?? [0.72, 0.5];
        const shade = s0 + s1 * r();
        const steps = Math.ceil(L / 0.5);
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          // Taper to a texel-wide core: a thinner strand would fall under the alpha cut and the
          // lock would stop short. The point of a lock comes from its staggered lengths.
          const rad = Math.max(0.6, rw * dmath.pow(1 - t, 0.7));
          const fade = t > 0.97 ? 0.6 : 1;
          const yv =
            root + (tip - root) * t * t + c.wave * dmath.sin(phase + t * c.waves * Math.PI * 2) * t;
          const px = x0 + len * t0 + L * t;
          const py = y0 + band * Math.max(0.03, Math.min(0.97, yv));
          const tn = ramp(c.tone, t) * shade;
          for (let y = Math.floor(py - rad - 1); y <= Math.ceil(py + rad + 1); y++) {
            if (y < 0 || y >= h) continue;
            for (let x = Math.floor(px - rad - 1); x <= Math.ceil(px + rad + 1); x++) {
              if (x < 0 || x >= w) continue;
              const d = dmath.hypot(x + 0.5 - px, y + 0.5 - py);
              const a = Math.min(1, Math.max(0, rad + 0.5 - d)) * fade;
              const j = y * w + x;
              if (a >= (cov[j] ?? 0)) tone[j] = tn;
              cov[j] = Math.max(cov[j] ?? 0, a);
            }
          }
        }
      }
    });
    bleed(cov, tone, w, h, layout.length);
    const rgba = new Uint8Array(w * h * 4);
    for (let j = 0; j < w * h; j++) {
      const a = cov[j] ?? 0;
      const g = Math.round(255 * dmath.pow(Math.min(1, tone[j] ?? 0.8), 1 / 2.2));
      rgba.set([g, g, g, Math.round(a * 255)], j * 4);
      s.height[j] = a * 0.0004;
      s.rough[j] = 0.5;
    }
    s.rgba = rgba;
  };
}
