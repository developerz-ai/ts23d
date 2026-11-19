// The blueprint's legend strip: every spec measure as model / spec / Δ% with its verdict colour,
// then every declared joint with its QA verdict — the numbers in one readable list, whatever the
// dimension lines in the views overlap.

import { TOLERANCE } from '../core/index.ts';
import { type Canvas, fillRect } from './blueprint-draw.ts';
import { BAD, fmtM, type MeasureResult, OK, shortLabel } from './blueprint-measures.ts';
import { INK, type JointMark } from './blueprint-panel.ts';
import { drawText } from './font.ts';

const ROW = 16;
const COL = 520;

/** Signed % off spec to one decimal, never '-0.0'. */
const pctOf = (got: number, want: number): string => {
  const p = ((got - want) / want) * 100;
  return Math.abs(p) < 0.05 ? '0.0' : `${p > 0 ? '+' : ''}${p.toFixed(1)}`;
};

/** A tolerance as a true percentage: 2 → '2', 0.5 → '0.5', 0.25 → '0.25' (never rounded to 0 or 1). */
export const tolText = (fraction: number): string => `${+(fraction * 100).toFixed(2)}`;

const JOINT_X = 80;
const PAD = 12;
/** Width of one joint entry: swatch, name, gap to the next. */
const jointWidth = (name: string): number => 16 + name.length * 8 + 24;

/**
 * Where each joint's entry goes, in rows of a `width`-px legend, and how many rows that takes.
 * `legendHeight` (the space) and `legend` (the drawing) both read this, so no row falls off.
 */
export function jointRows(
  names: readonly string[],
  width: number,
): { readonly at: readonly (readonly [x: number, row: number])[]; readonly rows: number } {
  const at: [number, number][] = [];
  let x = JOINT_X;
  let row = 0;
  for (const name of names) {
    // A name that would cross the right edge starts the next row (unless it has a row to itself).
    if (x > JOINT_X && x + 16 + name.length * 8 > width - PAD) {
      x = JOINT_X;
      row++;
    }
    at.push([x, row]);
    x += jointWidth(name);
    if (x > width - 160) {
      x = JOINT_X;
      row++;
    }
  }
  return { at, rows: at.length ? (at[at.length - 1]?.[1] ?? 0) + 1 : 0 };
}

export function legendHeight(measures: number, joints: readonly string[], width: number): number {
  const cols = Math.max(1, Math.floor((width - 24) / COL));
  // Never fewer than two rows under JOINTS: the heading's gap and a foot margin.
  const rows = joints.length ? Math.max(2, jointRows(joints, width).rows) : 0;
  return 18 + (Math.ceil(measures / cols) + rows + 1) * ROW + 10;
}

export function legend(
  c: Canvas,
  top: number,
  ms: readonly MeasureResult[],
  joints: readonly JointMark[],
): void {
  const cols = Math.max(1, Math.floor((c.width - 24) / COL));
  let y = top + 12;
  drawText(
    c.px,
    c.width,
    12,
    y,
    ms.length ? 'MEASURES  MODEL / SPEC  (TOLERANCE)' : 'NO REAL.MEASURES DECLARED',
    2,
    INK,
  );
  y += ROW;
  ms.forEach((r, i) => {
    const x = 12 + (i % cols) * COL;
    const yy = y + Math.floor(i / cols) * ROW;
    const tol = tolText(r.measure.tolerance ?? TOLERANCE.measure);
    const rgb = r.ok ? OK : BAD;
    const delta =
      r.value === null
        ? 'NO PARTS'
        : r.missing.length
          ? 'MISSING PART'
          : `${pctOf(r.value, r.measure.value)}%`;
    fillRect(c, x, yy, x + 10, yy + 10, rgb);
    const text = `${shortLabel(r.measure.label)}  ${r.value === null ? '-' : fmtM(r.value)} / ${fmtM(r.measure.value)} M  ${delta} (${tol}%)`;
    drawText(c.px, c.width, x + 16, yy, text, 2, rgb);
  });
  y += Math.ceil(ms.length / cols) * ROW + 4;
  if (!joints.length) return;
  drawText(c.px, c.width, PAD, y, 'JOINTS', 2, INK);
  const { at } = jointRows(
    joints.map((j) => j.name),
    c.width,
  );
  joints.forEach((j, i) => {
    const [x, row] = at[i] ?? [JOINT_X, 0];
    fillRect(c, x, y + row * ROW, x + 10, y + row * ROW + 10, j.rgb);
    drawText(c.px, c.width, x + 16, y + row * ROW, j.name, 2, j.rgb);
  });
}
