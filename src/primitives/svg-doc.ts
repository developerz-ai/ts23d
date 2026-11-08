// A drawing as text → contours in metres. Accepts a bare path `d` string or a small `<svg>` with
// `<path d>`, `<polygon|polyline points>`, `<rect>`, `<circle>`, `<ellipse>`; the viewBox is the
// paper. SVG Y points down; the result has Y UP, metres, origin at the paper's bottom centre by
// default. Size: `scale` metres per user unit, or `size` = paper width in metres. Curves flatten
// within `tolerance` metres, × LOD_COARSEN[lod] (coarser at LOD1/2).

import type { Vec2 } from '../core/index.ts';
import { parsePath, type SvgContour, svgInvalid } from './svg-path.ts';

export interface SvgOptions {
  /** Metres per SVG user unit. */
  readonly scale?: number;
  /** Paper width (viewBox, else drawing bounds) in metres; used when `scale` is absent. */
  readonly size?: number;
  /** Paper point that becomes (0, 0): a named anchor or [x, y] in user units. Default 'bottom'. */
  readonly origin?: 'bottom' | 'bottom-left' | 'centre' | 'top-left' | Vec2;
  /** Chord tolerance in metres. Default 0.002. */
  readonly tolerance?: number;
  /** 0 | 1 | 2: multiplies the tolerance by LOD_COARSEN. */
  readonly lod?: number;
}

/** A parsed drawing: contours in metres (Y up) and their bounds. */
export interface SvgShape {
  readonly contours: readonly SvgContour[];
  readonly min: Vec2;
  readonly max: Vec2;
}

export const LOD_COARSEN: readonly number[] = [1, 4, 12];

const attr = (tag: string, name: string): string | undefined =>
  new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`).exec(tag)?.[1];

const num = (tag: string, name: string, def?: number): number => {
  const v = attr(tag, name);
  if (v === undefined) {
    if (def !== undefined) return def;
    svgInvalid(`<${tag.slice(1, 12).trim()}…> has no ${name}`, `add ${name}="…" in user units`);
  }
  const n = Number.parseFloat(v);
  if (!Number.isFinite(n))
    svgInvalid(`${name}="${v}" is not a number`, 'use plain user-unit numbers (no %, no units)');
  return n;
};

/** Every element as path data in user units. */
function elements(svg: string): string[] {
  const out: string[] = [];
  for (const m of svg.matchAll(/<(path|polygon|polyline|rect|circle|ellipse)\b[^>]*>/g)) {
    const tag = m[0];
    if (/\stransform\s*=/.test(tag))
      svgInvalid(
        `${tag.slice(0, 40)}… has a transform`,
        'bake transforms into the coordinates; ts23d reads raw user units',
      );
    const kind = m[1];
    if (kind === 'path') out.push(attr(tag, 'd') ?? svgInvalid('<path> has no d', 'add d="M …"'));
    else if (kind === 'polygon' || kind === 'polyline') {
      const p =
        attr(tag, 'points') ?? svgInvalid(`<${kind}> has no points`, 'add points="x,y x,y …"');
      out.push(`M${p}${kind === 'polygon' ? 'Z' : ''}`);
    } else if (kind === 'rect') {
      const [x, y, w, h] = [
        num(tag, 'x', 0),
        num(tag, 'y', 0),
        num(tag, 'width'),
        num(tag, 'height'),
      ];
      out.push(`M${x} ${y}h${w}v${h}h${-w}Z`);
    } else {
      const [cx, cy] = [num(tag, 'cx', 0), num(tag, 'cy', 0)];
      const rx = kind === 'circle' ? num(tag, 'r') : num(tag, 'rx');
      const ry = kind === 'circle' ? rx : num(tag, 'ry');
      out.push(
        `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`,
      );
    }
  }
  if (out.length === 0)
    svgInvalid(
      '<svg> has no <path>, <polygon>, <rect>, <circle> or <ellipse>',
      'draw at least one closed shape',
    );
  return out;
}

function viewBox(svg: string): [number, number, number, number] | null {
  const head = /<svg\b[^>]*>/.exec(svg)?.[0];
  const vb = head && attr(head, 'viewBox');
  if (!vb) return null;
  const v = vb
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
  if (v.length !== 4 || !v.every(Number.isFinite) || (v[2] ?? 0) <= 0 || (v[3] ?? 0) <= 0)
    svgInvalid(
      `viewBox="${vb}" is not "x y width height"`,
      'write viewBox="0 0 100 100" (positive size)',
    );
  return [v[0] ?? 0, v[1] ?? 0, v[2] ?? 1, v[3] ?? 1];
}

const flatten = (ds: readonly string[], tol: number): SvgContour[] =>
  ds.flatMap((d) => parsePath(d, tol));

function bounds(cs: readonly SvgContour[]): [number, number, number, number] {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const c of cs)
    for (const [x, y] of c.points) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  return [x0, y0, x1 - x0, y1 - y0];
}

/** Parse a drawing (`<svg>…</svg>` or bare path data) into metres, Y up. */
export function svgShape(svg: string, o: SvgOptions = {}): SvgShape {
  const isDoc = /<svg\b/.test(svg);
  const ds = isDoc ? elements(svg) : [svg];
  const vb = isDoc ? viewBox(svg) : null;
  // Paper first (a fine pass sizes it when there is no viewBox), then the real flatten.
  const paper =
    vb ?? bounds(flatten(ds, 1e-3 * Math.max(1e-9, ...bounds(flatten(ds, 1)).slice(2))));
  let scale = o.scale;
  if (scale === undefined) {
    if (o.size === undefined)
      svgInvalid(
        'svg drawing has neither scale nor size',
        'pass scale (metres per user unit) or size (paper width, metres)',
      );
    scale = o.size / paper[2];
  }
  if (!(scale > 0) || !Number.isFinite(scale))
    svgInvalid(`svg scale is ${scale}`, 'use a positive scale or size in metres');
  const lod = Math.min(2, Math.max(0, Math.round(o.lod ?? 0)));
  const tolM = (o.tolerance ?? 0.002) * (LOD_COARSEN[lod] ?? 1);
  if (!(tolM > 0))
    svgInvalid(`svg tolerance is ${o.tolerance}`, 'use a tolerance > 0 m (0.002 = 2 mm)');
  const raw = flatten(ds, tolM / scale);
  const org = o.origin ?? 'bottom';
  const [px, py, pw, ph] = paper;
  const [ox, oy]: Vec2 =
    typeof org !== 'string'
      ? org
      : org === 'bottom'
        ? [px + pw / 2, py + ph]
        : org === 'bottom-left'
          ? [px, py + ph]
          : org === 'centre'
            ? [px + pw / 2, py + ph / 2]
            : [px, py];
  const s = scale;
  const contours = raw.map((c) => ({
    closed: c.closed,
    points: c.points.map((p): Vec2 => [(p[0] - ox) * s, (oy - p[1]) * s]),
  }));
  const [bx, by, bw, bh] = bounds(contours);
  return { contours, min: [bx, by], max: [bx + bw, by + bh] };
}
