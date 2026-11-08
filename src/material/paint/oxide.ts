// Oxide on metal (rust, verdigris, white rust) as one sample: the coverage mask the metal painter
// blends to albedo2, plus — with `relief` — a crust height field: the crust stands proud with a
// sharp flaking edge where the noise front crosses, breaks into lifted cellular flakes, and is
// pitted where it ate into the metal. Without relief it is the v2 look (a slight, soft rise).

import { type Canvas, noiseAt, smooth } from './canvas.ts';
import { type Cell, isoNoise, worley } from './relief.ts';

export interface OxideSample {
  /** 0 = bare metal, 1 = full oxide. */
  mask: number;
  /** Metres to add to the height. */
  height: number;
  /** Tone multiplier (pits and flake gaps darken). */
  tone: number;
}

const out: OxideSample = { mask: 0, height: 0, tone: 1 };

/** Shared result object: read it before the next call. */
export function oxideAt(
  c: Canvas,
  xm: number,
  ym: number,
  oxide: number,
  relief: number,
  seed: number,
  cell: Cell,
): OxideSample {
  const blot = noiseAt(c, xm, ym, 0.18, 0.18, seed + 6, 5);
  const grain = noiseAt(c, xm, ym, 0.02, 0.02, seed + 7, 3);
  const front = blot * 0.5 + 0.5 + oxide - 0.5 + 0.15 * grain;
  const mask = smooth(0.45, 0.75, front);
  out.mask = mask;
  out.height = mask * 0.0004 * (1 + grain);
  out.tone = 1;
  if (relief <= 0 || mask <= 0) return out;
  // Crust: a hard step at the coverage edge, then cellular flakes with dark gaps between them.
  const crust = smooth(0.5, 0.56, front);
  let gap = 0;
  let lift = 0;
  if (crust > 0) {
    worley(c, xm, ym, 0.03, seed + 12, cell);
    gap = 1 - smooth(0.06, 0.3, cell.f2 - cell.f1);
    lift = (cell.id - 0.5) * 0.0004;
  }
  const rough = isoNoise(c, xm, ym, 0.006, seed + 13);
  const pit = smooth(0.35, 0.7, -isoNoise(c, xm, ym, 0.015, seed + 14)) * mask;
  out.height +=
    relief * (crust * (0.0009 + lift - 0.0006 * gap) + mask * 0.0004 * rough - 0.0012 * pit);
  out.tone = 1 - relief * (0.25 * pit + 0.2 * gap * crust - 0.05 * rough * mask);
  return out;
}
