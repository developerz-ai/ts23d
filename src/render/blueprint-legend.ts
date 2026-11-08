// The blueprint's legend strip: every spec measure as model / spec / Δ% with its verdict colour,
// then every declared joint with its QA verdict — the numbers in one readable list, whatever the
// dimension lines in the views overlap.

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

export function legendHeight(measures: number, joints: number, width: number): number {
  const cols = Math.max(1, Math.floor((width - 24) / COL));
  return 18 + (Math.ceil(measures / cols) + (joints ? 2 : 0) + 1) * ROW + 10;
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
    const tol = (r.measure.tolerance ?? 0.02) * 100;
    const rgb = r.ok ? OK : BAD;
    const delta = r.value === null ? 'NO PARTS' : `${pctOf(r.value, r.measure.value)}%`;
    fillRect(c, x, yy, x + 10, yy + 10, rgb);
    const text = `${shortLabel(r.measure.label)}  ${r.value === null ? '-' : fmtM(r.value)} / ${fmtM(r.measure.value)} M  ${delta} (${tol.toFixed(0)}%)`;
    drawText(c.px, c.width, x + 16, yy, text, 2, rgb);
  });
  y += Math.ceil(ms.length / cols) * ROW + 4;
  if (!joints.length) return;
  drawText(c.px, c.width, 12, y, 'JOINTS', 2, INK);
  let x = 80;
  for (const j of joints) {
    fillRect(c, x, y, x + 10, y + 10, j.rgb);
    drawText(c.px, c.width, x + 16, y, j.name, 2, j.rgb);
    x += 16 + j.name.length * 8 + 24;
    if (x > c.width - 160) {
      x = 80;
      y += ROW;
    }
  }
}
