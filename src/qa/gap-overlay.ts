// The `gaps` gate made visible: the axis depth views it scanned, shaded by relief with part
// outlines, every undeclared slit painted red and ringed, declared/exempt ones blue. `gapOverlay`
// is the whole asset from six sides; `gapZoom` is one slit up close. PNGs an agent Reads.

import { encodePng } from '../core/index.ts';
import type { DepthView } from './depth-views.ts';
import type { Gap, GapScan } from './gaps.ts';

const RED: readonly [number, number, number] = [230, 30, 30];
const BLUE: readonly [number, number, number] = [40, 110, 230];

type Set = (x: number, y: number, c: readonly number[]) => void;

/** A window of a view (columns c0…, rows r0… with +v up) drawn at `s` px per pixel at (ox, oy). */
interface Frame {
  readonly c0: number;
  readonly r0: number;
  readonly cols: number;
  readonly rows: number;
  readonly s: number;
  readonly ox: number;
  readonly oy: number;
}

function canvas(W: number, H: number): { img: Uint8Array; set: Set } {
  const img = new Uint8Array(W * H * 4).fill(255);
  return {
    img,
    set: (x, y, c) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      img.set([c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, 255], (y * W + x) * 4);
    },
  };
}

/** View pixel index → canvas coordinates of its top-left corner. */
const place = (v: DepthView, f: Frame, p: number): [number, number] => [
  Math.floor(f.ox + ((p % v.width) - f.c0) * f.s),
  Math.floor(f.oy + (f.r0 + f.rows - 1 - Math.floor(p / v.width)) * f.s),
];

function paint(v: DepthView, f: Frame, gaps: readonly Gap[], set: Set, ring: number): void {
  let near = Infinity;
  let far = -Infinity;
  for (const d of v.depth)
    if (Number.isFinite(d)) {
      near = Math.min(near, d);
      far = Math.max(far, d);
    }
  const range = Math.max(1e-6, far - near);
  const depthAt = (c: number, r: number, fallback: number): number => {
    const q =
      v.depth[
        Math.min(v.height - 1, Math.max(0, r)) * v.width + Math.min(v.width - 1, Math.max(0, c))
      ];
    return q !== undefined && Number.isFinite(q) ? q : fallback;
  };
  const W = Math.ceil(f.cols * f.s);
  const H = Math.ceil(f.rows * f.s);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const col = f.c0 + Math.floor(x / f.s);
      const row = f.r0 + f.rows - 1 - Math.floor(y / f.s);
      if (col < 0 || row < 0 || col >= v.width || row >= v.height) continue;
      const k = row * v.width + col;
      const d = v.depth[k] ?? Infinity;
      if (!Number.isFinite(d)) {
        set(f.ox + x, f.oy + y, [236, 238, 241]);
        continue;
      }
      // Relief from the depth gradient (light from upper left) plus a gentle near→far fade.
      const gx = (depthAt(col + 1, row, d) - depthAt(col - 1, row, d)) / (2 * v.px);
      const gy = (depthAt(col, row + 1, d) - depthAt(col, row - 1, d)) / (2 * v.px);
      const lit = Math.max(0, Math.min(1, 0.6 + (0.25 * (gx - gy)) / Math.hypot(1, gx, gy)));
      const g = Math.round(70 + lit * 170 - ((d - near) / range) * 60);
      const edge =
        (col > 0 && v.part[k - 1] !== v.part[k]) || (row > 0 && v.part[k - v.width] !== v.part[k]);
      set(f.ox + x, f.oy + y, edge ? [60, 64, 70] : [g, g, g + 6]);
    }
  const dot = Math.max(3, Math.ceil(f.s));
  for (const g of gaps) {
    const c = g.allowed ? BLUE : RED;
    let cx = 0;
    let cy = 0;
    for (const p of g.pixels) {
      const [x, y] = place(v, f, p);
      cx += x;
      cy += y;
      // At least a 3 × 3 dot per slit pixel, so thin slits survive a downscale.
      for (let dy = 0; dy < dot; dy++)
        for (let dx = 0; dx < dot; dx++) set(x + dx - (dot >> 2), y + dy - (dot >> 2), c);
    }
    if (g.allowed || g.pixels.length === 0) continue;
    cx = Math.round(cx / g.pixels.length);
    cy = Math.round(cy / g.pixels.length);
    for (let a = 0; a < 128; a++) {
      const t = (a / 128) * Math.PI * 2;
      for (const rr of [ring, ring + 1])
        set(Math.round(cx + Math.cos(t) * rr), Math.round(cy + Math.sin(t) * rr), RED);
    }
  }
}

/** Contact-sheet layout (3 × 2 cells, `cell` px each, VIEW_NAMES order) with slits marked. */
export function gapOverlay(scan: GapScan, cell = 400): Uint8Array {
  const { img, set } = canvas(cell * 3, cell * 2);
  // One scale for every view, so sizes compare across cells.
  const longest = Math.max(1, ...scan.views.map((v) => Math.max(v.width, v.height)));
  const s = (cell - 16) / longest;
  scan.views.forEach((v, vi) => {
    const frame: Frame = {
      c0: 0,
      r0: 0,
      cols: v.width,
      rows: v.height,
      s,
      ox: (vi % 3) * cell + 8 + Math.floor((cell - 16 - v.width * s) / 2),
      oy: Math.floor(vi / 3) * cell + 8 + Math.floor((cell - 16 - v.height * s) / 2),
    };
    paint(
      v,
      frame,
      scan.gaps.filter((g) => g.viewIndex === vi),
      set,
      14,
    );
  });
  return encodePng(cell * 3, cell * 2, img);
}

/** One slit up close: a `size`² crop of its view, `span` metres across, centred on the slit. */
export function gapZoom(scan: GapScan, gap: Gap, size = 400, span = 0.6): Uint8Array {
  const v = scan.views[gap.viewIndex];
  const { img, set } = canvas(size, size);
  if (!v) return encodePng(size, size, img);
  const n = Math.max(8, Math.round(span / v.px));
  const mid = gap.pixels[gap.pixels.length >> 1] ?? 0;
  const frame: Frame = {
    c0: (mid % v.width) - (n >> 1),
    r0: Math.floor(mid / v.width) - (n >> 1),
    cols: n,
    rows: n,
    s: size / n,
    ox: 0,
    oy: 0,
  };
  paint(
    v,
    frame,
    scan.gaps.filter((g) => g.viewIndex === gap.viewIndex),
    set,
    Math.round(size / 8),
  );
  return encodePng(size, size, img);
}
