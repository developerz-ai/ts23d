// Draw → turned solid: half a profile drawn in SVG, spun by `lathe`. Draw the axis on the paper's
// left edge (default origin 'bottom-left'): x = radius, up = height. An open path is the profile
// as drawn; a closed shape drops its edges on the axis (x ≈ 0) and keeps the outside run. The
// profile is ordered bottom → top; ends off the axis get caps.

import type { Mesh, Vec2 } from '../core/index.ts';
import { invalid } from './check.ts';
import { type LatheOptions, lathe } from './lathe.ts';
import { type SvgOptions, svgShape } from './svg-doc.ts';

export interface LatheSvgOptions extends SvgOptions, Omit<LatheOptions, 'profile' | 'caps'> {
  /** Close the ends with fans. Default: when an end stops off the axis. */
  readonly caps?: boolean;
}

/** The longest run of a closed loop that stays off the axis, endpoints included. */
function offAxis(points: readonly Vec2[], eps: number): Vec2[] {
  const n = points.length;
  const on = points.map((p) => p[0] <= eps);
  const first = on.indexOf(true);
  if (first < 0) return [...points, points[0] ?? [0, 0]];
  let best: Vec2[] = [];
  let run: Vec2[] = [];
  for (let k = 1; k <= n; k++) {
    const i = (first + k) % n;
    const p = points[i] ?? [0, 0];
    if (on[i]) {
      if (run.length > 0) {
        run.push(p);
        if (run.length > best.length) best = run;
      }
      run = [p];
    } else run.push(p);
  }
  return best;
}

export function latheSvg(svg: string, o: LatheSvgOptions): Mesh {
  const shape = svgShape(svg, { origin: 'bottom-left', ...o });
  const c = shape.contours[0];
  if (!c) invalid('latheSvg drawing has no path', 'draw the half profile as one path');
  const eps = Math.max(1e-6, (shape.max[0] - shape.min[0]) * 1e-4);
  let prof = c.closed ? offAxis(c.points, eps) : [...c.points];
  if (prof.some((p) => p[0] < -eps))
    invalid(
      'latheSvg profile crosses the axis (negative radius)',
      'keep the profile right of the origin (origin: bottom-left = paper left edge is the axis)',
    );
  if (prof.length < 2)
    invalid(
      'latheSvg profile has fewer than 2 points off the axis',
      'draw the outside of the half profile',
    );
  if ((prof[0]?.[1] ?? 0) > (prof[prof.length - 1]?.[1] ?? 0)) prof = prof.reverse();
  prof = prof.map((p): Vec2 => [Math.max(0, p[0]), p[1]]);
  const open = (prof[0]?.[0] ?? 0) > eps || (prof[prof.length - 1]?.[0] ?? 0) > eps;
  return lathe({ ...o, profile: prof, caps: o.caps ?? open });
}
