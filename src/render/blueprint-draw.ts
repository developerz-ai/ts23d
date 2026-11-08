// 2D drafting primitives for the blueprint: thick and dashed lines, arrowheads, dimension lines
// with extension lines and a boxed label, filled polygons and discs, and the 1.8 m human figure.
// Everything draws straight into an RGBA canvas (no depth test): overlays on the rendered views.

import { drawText, textWidth } from './font.ts';

export type Rgb = readonly [number, number, number];

export interface Canvas {
  readonly px: Uint8Array;
  readonly width: number;
  readonly height: number;
  /** Label boxes already placed; new labels step aside instead of overprinting them. */
  readonly taken?: [number, number, number, number][];
}

type Box = [number, number, number, number];
const overlaps = (a: Box, b: Box): boolean =>
  a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

export function dot(c: Canvas, x: number, y: number, rgb: Rgb, alpha = 1): void {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= c.width || yi >= c.height) return;
  const o = (yi * c.width + xi) * 4;
  for (let k = 0; k < 3; k++) {
    const was = c.px[o + k] ?? 0;
    c.px[o + k] = Math.round(was + ((rgb[k] ?? 0) - was) * alpha);
  }
  c.px[o + 3] = 255;
}

/** A line `thick` px wide; `dash` = [on, off] px for dashed lines. */
export function seg(
  c: Canvas,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rgb: Rgb,
  thick = 1,
  dash?: readonly [number, number],
): void {
  const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1));
  const r = (thick - 1) / 2;
  for (let s = 0; s <= n; s++) {
    if (dash && s % (dash[0] + dash[1]) >= dash[0]) continue;
    const x = x0 + ((x1 - x0) * s) / n;
    const y = y0 + ((y1 - y0) * s) / n;
    for (let dy = -Math.floor(r); dy <= Math.ceil(r); dy++)
      for (let dx = -Math.floor(r); dx <= Math.ceil(r); dx++) dot(c, x + dx, y + dy, rgb);
  }
}

/** Arrowhead at (x, y) pointing along (dx, dy). */
export function arrow(
  c: Canvas,
  x: number,
  y: number,
  dx: number,
  dy: number,
  rgb: Rgb,
  size = 7,
): void {
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l;
  const uy = dy / l;
  for (const s of [-1, 1]) {
    const a = 0.42 * s;
    const bx = -(ux * Math.cos(a) - uy * Math.sin(a)) * size;
    const by = -(ux * Math.sin(a) + uy * Math.cos(a)) * size;
    seg(c, x, y, x + bx, y + by, rgb, 1.6);
  }
}

/** Text on a filled box, centred on (cx, cy). Returns the box [x0, y0, x1, y1]. */
export function label(
  c: Canvas,
  cx: number,
  cy: number,
  text: string,
  rgb: Rgb,
  bg: Rgb = [255, 255, 255],
  scale = 2,
): [number, number, number, number] {
  const w = textWidth(text, scale);
  const h = 5 * scale;
  const at = (dx: number, dy: number): Box => {
    const x0 = Math.round(Math.min(Math.max(cx + dx - w / 2, 3), c.width - w - 3));
    const y0 = Math.round(Math.min(Math.max(cy + dy - h / 2, 3), c.height - h - 3));
    return [x0 - 3, y0 - 3, x0 + w + 3, y0 + h + 3];
  };
  const step = h + 8;
  const tries: [number, number][] = [[0, 0]];
  for (let i = 1; i <= 6; i++) tries.push([0, -step * i], [0, step * i]);
  const taken = c.taken ?? [];
  const box =
    tries.map(([dx, dy]) => at(dx, dy)).find((b) => !taken.some((t) => overlaps(b, t))) ?? at(0, 0);
  taken.push(box);
  fillRect(c, box[0], box[1], box[2], box[3], bg, 0.92);
  drawText(c.px, c.width, box[0] + 3, box[1] + 3, text, scale, rgb);
  return box;
}

export function fillRect(
  c: Canvas,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rgb: Rgb,
  alpha = 1,
): void {
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(c.height, Math.ceil(y1)); y++)
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(c.width, Math.ceil(x1)); x++)
      dot(c, x, y, rgb, alpha);
}

/** Filled polygon (even-odd), points in px. */
export function fillPoly(
  c: Canvas,
  pts: readonly (readonly [number, number])[],
  rgb: Rgb,
  alpha = 1,
): void {
  const ys = pts.map((p) => p[1]);
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const y1 = Math.min(c.height - 1, Math.ceil(Math.max(...ys)));
  for (let y = y0; y <= y1; y++) {
    const py = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i] ?? [0, 0];
      const b = pts[(i + 1) % pts.length] ?? [0, 0];
      if (a[1] <= py === b[1] <= py) continue;
      xs.push(a[0] + ((py - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2)
      for (let x = Math.ceil((xs[i] ?? 0) - 0.5); x <= Math.floor((xs[i + 1] ?? 0) - 0.5); x++)
        dot(c, x, y, rgb, alpha);
  }
}

export function disc(
  c: Canvas,
  cx: number,
  cy: number,
  rx: number,
  rgb: Rgb,
  alpha = 1,
  ry = rx,
): void {
  const n = Math.max(12, Math.ceil(Math.max(rx, ry) * 2));
  fillPoly(
    c,
    Array.from({ length: n }, (_, i): [number, number] => [
      cx + rx * Math.cos((i / n) * Math.PI * 2),
      cy + ry * Math.sin((i / n) * Math.PI * 2),
    ]),
    rgb,
    alpha,
  );
}

export function ring(c: Canvas, cx: number, cy: number, r: number, rgb: Rgb, thick = 2): void {
  const n = Math.max(16, Math.ceil(r * 4));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const b = ((i + 1) / n) * Math.PI * 2;
    seg(
      c,
      cx + r * Math.cos(a),
      cy + r * Math.sin(a),
      cx + r * Math.cos(b),
      cy + r * Math.sin(b),
      rgb,
      thick,
    );
  }
}

/**
 * A dimension between screen points a and b, drawn `off` px out along the normal (sign picks
 * the side): extension lines from the object, the line with arrows, the value boxed mid-line.
 */
export function dimension(
  c: Canvas,
  a: readonly [number, number],
  b: readonly [number, number],
  off: readonly [number, number],
  text: string,
  rgb: Rgb,
): void {
  const [ax, ay] = [a[0] + off[0], a[1] + off[1]];
  const [bx, by] = [b[0] + off[0], b[1] + off[1]];
  const ol = Math.hypot(off[0], off[1]) || 1;
  const [ex, ey] = [(off[0] / ol) * 5, (off[1] / ol) * 5];
  seg(c, a[0], a[1], ax + ex, ay + ey, rgb, 1, [3, 2]);
  seg(c, b[0], b[1], bx + ex, by + ey, rgb, 1, [3, 2]);
  seg(c, ax, ay, bx, by, rgb, 1.6);
  arrow(c, ax, ay, ax - bx, ay - by, rgb);
  arrow(c, bx, by, bx - ax, by - ay, rgb);
  // Vertical dimensions carry their text beside the line, clear of the model.
  const vertical = Math.abs(ax - bx) < 0.5;
  const w = textWidth(text, 2);
  label(c, (ax + bx) / 2 + (vertical ? w / 2 + 8 : 0), (ay + by) / 2, text, rgb);
}
