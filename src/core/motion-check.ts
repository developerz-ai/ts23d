// Validates a part's Motion at the DSL boundary: finite numbers, real axes, and linkages that can
// actually turn (a rod longer than its crank's reach off the slide line, a slide line across the
// axle). Bad input throws T3D_RECIPE_INVALID with a fix, never a NaN keyframe in the GLB.

import { Ts23dError } from './errors.ts';
import type { Motion } from './motion.ts';
import { across } from './motion-pose.ts';
import { cross, dot, length, normalize, sub, type Vec3 } from './vec.ts';

const EPS = 1e-6;

function fail(part: string, cause: string, fix: string): never {
  throw new Ts23dError('T3D_RECIPE_INVALID', { cause: `part '${part}' motion: ${cause}`, fix });
}

function finite(part: string, what: string, v: number | Vec3): void {
  const all = typeof v === 'number' ? [v] : v;
  if (!all.every(Number.isFinite))
    fail(part, `${what} is not finite (${String(v)})`, `give ${what} real numbers`);
}

function axisOf(part: string, v: Vec3, what = 'axis'): Vec3 {
  finite(part, what, v);
  if (length(v) < EPS)
    fail(part, `${what} is zero`, `point ${what} along the hinge or axle, e.g. [0, 1, 0]`);
  return normalize(v);
}

/** Throws T3D_RECIPE_INVALID when `m` cannot be baked into a clean, closed loop. */
export function checkMotion(part: string, m: Motion): void {
  if (m.kind === 'tread') return;
  finite(part, m.kind === 'spin' ? 'rps' : 'hz', m.kind === 'spin' ? m.rps : m.hz);
  switch (m.kind) {
    case 'spin':
      axisOf(part, m.axis);
      return;
    case 'sway':
      axisOf(part, m.axis);
      finite(part, 'degrees', m.degrees);
      return;
    case 'slide':
      finite(part, 'offset', m.offset);
      return;
    case 'orbit': {
      const u = axisOf(part, m.axis);
      finite(part, 'arm', m.arm);
      if (length(across(m.arm, u)) < EPS)
        fail(
          part,
          'orbit arm has no length across the axis',
          'arm = crank pin − axle centre at rest',
        );
      return;
    }
    case 'crank':
    case 'piston': {
      const u = axisOf(part, m.axis);
      const l = axisOf(part, m.line, 'line');
      finite(part, 'centre', m.centre);
      finite(part, 'pin', m.pin);
      if (Math.abs(dot(u, l)) > 1e-3)
        fail(
          part,
          'line is not normal to the crank axis',
          'slide the small end in the plane the crank turns in',
        );
      const arm = across(sub(m.pin, m.centre), u);
      const r = length(arm);
      if (r < EPS)
        fail(
          part,
          'pin sits on the axle (zero throw)',
          'put pin on the crank pin, centre on the axle',
        );
      if (Math.abs(dot(m.pin, l)) < EPS)
        fail(
          part,
          'the rod stands square to its line at rest',
          'the pivot is the small end; pin is the big end along the line',
        );
      // Off the line: the axial offset is fixed; across it the pin swings ± r about the centre.
      const w = cross(u, l);
      const reach = Math.hypot(dot(m.pin, u), Math.abs(dot(sub(m.pin, arm), w)) + r);
      if (reach >= length(m.pin) - EPS)
        fail(
          part,
          `rod ${length(m.pin).toFixed(3)} m cannot reach a crank swinging ${reach.toFixed(3)} m off its line`,
          'lengthen the rod (pivot further from the pin) or shorten the throw',
        );
      return;
    }
  }
}
