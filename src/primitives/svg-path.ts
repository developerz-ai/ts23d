// Parse an SVG path `d` string (M L H V C S Q T A Z, absolute and relative, implicit repeats,
// compact numbers like "1.5.5" and arc flags like "a1 1 0 011 1") into flattened polylines in SVG
// user units. Curves flatten within `tol` units (svg-curves.ts). Malformed input throws
// T3D_SVG_INVALID with the offending position.

import { Ts23dError, type Vec2 } from '../core/index.ts';
import { flattenArc, flattenCubic, flattenQuad } from './svg-curves.ts';

/** One subpath: its points (first point once, even when closed) and whether `Z` closed it. */
export interface SvgContour {
  readonly points: Vec2[];
  readonly closed: boolean;
}

export function svgInvalid(cause: string, fix: string): never {
  throw new Ts23dError('T3D_SVG_INVALID', { cause, fix });
}

const ARGS: Readonly<Record<string, number>> = {
  m: 2,
  l: 2,
  h: 1,
  v: 1,
  c: 6,
  s: 4,
  q: 4,
  t: 2,
  a: 7,
  z: 0,
};
const NUM = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;

/** Tokenise into commands with their numeric arguments (arc flags read as single digits). */
function tokens(d: string): { cmd: string; args: number[]; at: number }[] {
  const out: { cmd: string; args: number[]; at: number }[] = [];
  let i = 0;
  let cur: { cmd: string; args: number[]; at: number } | null = null;
  while (i < d.length) {
    const ch = d[i] ?? '';
    if (/[\s,]/.test(ch)) {
      i++;
      continue;
    }
    if (/[a-zA-Z]/.test(ch)) {
      if (ARGS[ch.toLowerCase()] === undefined)
        svgInvalid(
          `path command "${ch}" at ${i} is not SVG`,
          'use only M L H V C S Q T A Z (any case)',
        );
      cur = { cmd: ch, args: [], at: i };
      out.push(cur);
      i++;
      continue;
    }
    if (!cur)
      svgInvalid(
        `path data starts with "${d.slice(0, 12)}", not a command`,
        'begin the path with M x y',
      );
    // Arc flags (4th and 5th of each 7) are one character, maybe with no separator after.
    const k = cur.args.length % 7;
    if (cur.cmd.toLowerCase() === 'a' && (k === 3 || k === 4)) {
      if (ch !== '0' && ch !== '1')
        svgInvalid(
          `arc flag "${ch}" at ${i} is not 0 or 1`,
          'write arcs as A rx ry rotation large-arc(0|1) sweep(0|1) x y',
        );
      cur.args.push(ch === '1' ? 1 : 0);
      i++;
      continue;
    }
    const m = NUM.exec(d.slice(i));
    if (!m)
      svgInvalid(
        `unexpected "${ch}" at ${i} in path data`,
        'separate numbers with spaces or commas; use . for decimals',
      );
    cur.args.push(Number(m[0]));
    i += m[0].length;
  }
  return out;
}

/** Flatten `d` into contours; `tol` is the chord tolerance in user units. */
export function parsePath(d: string, tol: number): SvgContour[] {
  const contours: SvgContour[] = [];
  let pts: Vec2[] = [];
  let pos: Vec2 = [0, 0];
  let start: Vec2 = [0, 0];
  let lastCtrl: Vec2 | null = null;
  let lastKind = '';
  const flush = (closed: boolean): void => {
    if (pts.length > 1) contours.push({ points: dedupe(pts, closed), closed });
    pts = [];
  };
  const toks = tokens(d);
  if (toks[0] && toks[0].cmd.toLowerCase() !== 'm')
    svgInvalid(`path data starts with "${toks[0].cmd}", not M`, 'begin every path with M x y');
  for (const { cmd, args, at } of toks) {
    const lower = cmd.toLowerCase();
    const n = ARGS[lower] ?? 0;
    const rel = cmd === lower;
    if (n === 0) {
      if (args.length > 0)
        svgInvalid(`Z at ${at} has numbers after it`, 'start a new subpath with M after Z');
      if (pts.length) pos = [start[0], start[1]];
      flush(true);
      lastKind = 'z';
      continue;
    }
    if (args.length === 0 || args.length % n !== 0)
      svgInvalid(
        `"${cmd}" at ${at} has ${args.length} numbers; it takes groups of ${n}`,
        `give "${cmd}" exactly ${n} numbers per segment`,
      );
    for (let g = 0; g < args.length; g += n) {
      const a = args
        .slice(g, g + n)
        .map((v) =>
          Number.isFinite(v) ? v : svgInvalid(`non-finite number at ${at}`, 'use plain decimals'),
        );
      const ox = rel ? pos[0] : 0;
      const oy = rel ? pos[1] : 0;
      const pt = (k: number): Vec2 => [(a[k] ?? 0) + ox, (a[k + 1] ?? 0) + oy];
      // A moveto's extra pairs are implicit linetos.
      const kind = lower === 'm' && g > 0 ? 'l' : lower;
      if (kind !== 'm' && pts.length === 0) pts.push([pos[0], pos[1]]);
      if (kind !== 'm' && lastKind === 'z') start = [pos[0], pos[1]];
      let ctrl: Vec2 | null = null;
      if (kind === 'm') {
        flush(false);
        pos = pt(0);
        start = [pos[0], pos[1]];
        pts.push([pos[0], pos[1]]);
      } else if (kind === 'l' || kind === 't') {
        const end = pt(0);
        if (kind === 't') {
          const c: Vec2 =
            lastCtrl && (lastKind === 'q' || lastKind === 't') ? reflect(lastCtrl, pos) : pos;
          flattenQuad(pos, c, end, tol, pts);
          ctrl = c;
        } else pts.push(end);
        pos = end;
      } else if (kind === 'h' || kind === 'v') {
        const v = a[0] ?? 0;
        pos = kind === 'h' ? [rel ? pos[0] + v : v, pos[1]] : [pos[0], rel ? pos[1] + v : v];
        pts.push([pos[0], pos[1]]);
      } else if (kind === 'c' || kind === 's') {
        const c1: Vec2 =
          kind === 'c'
            ? pt(0)
            : lastCtrl && (lastKind === 'c' || lastKind === 's')
              ? reflect(lastCtrl, pos)
              : pos;
        const c2 = kind === 'c' ? pt(2) : pt(0);
        const end = kind === 'c' ? pt(4) : pt(2);
        flattenCubic(pos, c1, c2, end, tol, pts);
        ctrl = c2;
        pos = end;
      } else if (kind === 'q') {
        const c = pt(0);
        const end = pt(2);
        flattenQuad(pos, c, end, tol, pts);
        ctrl = c;
        pos = end;
      } else {
        const end = pt(5);
        flattenArc(pos, [a[0] ?? 0, a[1] ?? 0], a[2] ?? 0, a[3] === 1, a[4] === 1, end, tol, pts);
        pos = end;
      }
      lastCtrl = ctrl;
      lastKind = kind;
    }
  }
  flush(false);
  if (contours.length === 0)
    svgInvalid(
      'path has no drawable segment (needs M and at least one more point)',
      'write e.g. "M 0 0 L 10 0 L 10 10 Z"',
    );
  return contours;
}

const reflect = (c: Vec2, about: Vec2): Vec2 => [2 * about[0] - c[0], 2 * about[1] - c[1]];

/** Drop repeated points (and a closing point equal to the first). */
function dedupe(pts: readonly Vec2[], closed: boolean): Vec2[] {
  const out: Vec2[] = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.abs(q[0] - p[0]) > 1e-9 || Math.abs(q[1] - p[1]) > 1e-9) out.push(p);
  }
  const f = out[0];
  const l = out[out.length - 1];
  if (
    closed &&
    f &&
    l &&
    out.length > 1 &&
    Math.abs(f[0] - l[0]) < 1e-9 &&
    Math.abs(f[1] - l[1]) < 1e-9
  )
    out.pop();
  return out;
}
