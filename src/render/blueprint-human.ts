// The scale figure: a 1.8 m adult drawn beside the asset in each orthographic blueprint view, so a
// reader sees at a glance whether a door, a cockpit or a sword is human-sized. Proportions from
// the 8-heads canon (head 0.225 m, shoulders 0.46 m wide, hips at 0.95 m, torso 0.26 m deep).

import { type Canvas, disc, fillPoly, label, type Rgb, seg } from './blueprint-draw.ts';

export type FigureView = 'front' | 'side' | 'top';

/** Metres in the view plane (h right, v up) → canvas px. */
export type ToPx = (h: number, v: number) => [number, number];

export const HUMAN_HEIGHT = 1.8;
/** Half the figure's width in each view, metres (for placing it clear of the asset). */
export const HUMAN_HALF: Record<FigureView, number> = { front: 0.25, side: 0.15, top: 0.25 };

const FILL: Rgb = [128, 140, 156];

export function human(c: Canvas, to: ToPx, view: FigureView, h0: number, v0: number): void {
  const poly = (pts: readonly (readonly [number, number])[]): void =>
    fillPoly(
      c,
      pts.map(([h, v]) => to(h0 + h, v0 + v)),
      FILL,
      0.55,
    );
  const circle = (h: number, v: number, r: number, ry = r): void => {
    const [x, y] = to(h0 + h, v0 + v);
    const [x1, y1] = to(h0 + h + r, v0 + v + ry);
    disc(c, x, y, Math.abs(x1 - x), FILL, 0.55, Math.abs(y1 - y));
  };
  if (view === 'top') {
    circle(0, 0, 0.23, 0.13);
    circle(0, 0, 0.1, 0.11);
    return;
  }
  const w = view === 'front' ? 1 : 0.55;
  circle(0, 1.688, 0.095 * (view === 'front' ? 1 : 1.1), 0.112);
  poly([
    [-0.05 * w, 1.56],
    [0.05 * w, 1.56],
    [0.05 * w, 1.6],
    [-0.05 * w, 1.6],
  ]);
  // Torso: shoulders → waist → hips.
  poly([
    [-0.23 * w, 1.5],
    [0.23 * w, 1.5],
    [0.2 * w, 1.42],
    [0.15 * w, 1.1],
    [0.17 * w, 0.92],
    [-0.17 * w, 0.92],
    [-0.15 * w, 1.1],
    [-0.2 * w, 1.42],
  ]);
  if (view === 'front') {
    // Legs and arms.
    for (const s of [-1, 1]) {
      poly([
        [0.02 * s, 0.94],
        [0.16 * s, 0.94],
        [0.12 * s, 0.05],
        [0.05 * s, 0.05],
      ]);
      poly([
        [0.05 * s, 0.05],
        [0.13 * s, 0.05],
        [0.14 * s, 0],
        [0.04 * s, 0],
      ]);
      poly([
        [0.19 * s, 1.48],
        [0.25 * s, 1.44],
        [0.26 * s, 0.82],
        [0.2 * s, 0.82],
      ]);
    }
  } else {
    poly([
      [-0.08, 0.94],
      [0.09, 0.94],
      [0.06, 0.05],
      [-0.06, 0.05],
    ]);
    poly([
      [-0.07, 0.05],
      [0.16, 0.05],
      [0.16, 0],
      [-0.07, 0],
    ]);
    poly([
      [-0.05, 1.47],
      [0.05, 1.47],
      [0.06, 0.82],
      [-0.02, 0.82],
    ]);
  }
  const [x0, y0] = to(h0 + HUMAN_HALF[view] + 0.08, v0 + HUMAN_HEIGHT);
  const [, y1] = to(h0, v0);
  seg(c, x0, y0, x0, y1, FILL, 1, [2, 2]);
  label(c, x0, y0 - 9, '1.8 M', [70, 80, 94]);
}
