// The per-asset presentation hint: where the beauty camera stands when nobody says otherwise.
// `hero: { azDeg: 145 }` turns the worn side to the lens; `hero: { eye, target }` is a fixed
// viewpoint (a valley from its overlook). Names, units and ranges are the beauty render's own
// (`BeautyOptions`, the CLI's --az / --el / --fov), so a hint is just a recorded default: `t3d
// hero`, the committed hero, the review and critique packs honour it, and a flag still wins.

import * as dmath from './dmath.ts';
import { Ts23dError } from './errors.ts';
import type { Vec3 } from './vec.ts';

export interface HeroView {
  /** Camera orbit about Z from the front (+X), degrees: −35 (default) front-left 3/4, 145 rear. */
  readonly azDeg?: number;
  /** Elevation above the horizon, degrees (−10…89). Default 18. */
  readonly elDeg?: number;
  /** Vertical field of view, degrees (5…120). Default 30. */
  readonly fovDeg?: number;
  /** A fixed viewpoint in the asset's frame, metres; needs `target`, excludes azDeg / elDeg. */
  readonly eye?: Vec3;
  /** What the fixed viewpoint looks at, metres. No auto-framing: the lens is `fovDeg`. */
  readonly target?: Vec3;
}

const KEYS = ['azDeg', 'elDeg', 'fovDeg', 'eye', 'target'];
/** Elevation and field-of-view ranges shared with the beauty render's option check. */
export const HERO_RANGE = { el: [-10, 89], fov: [5, 120] } as const;

const point = (v: unknown): v is Vec3 =>
  Array.isArray(v) && v.length === 3 && v.every((c) => typeof c === 'number' && Number.isFinite(c));

/**
 * Why `h` is not a usable view, as [cause, fix], or null. Shared by the definition check and the
 * beauty render's option check, which wrap it in their own error code.
 */
export function heroViewFault(h: HeroView): readonly [string, string] | null {
  const extra = Object.keys(h).filter((k) => !KEYS.includes(k));
  if (extra.length)
    return [`unknown key '${extra[0]}'`, `use ${KEYS.join(', ')} (degrees; eye and target metres)`];
  const num = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v);
  if (h.azDeg !== undefined && !num(h.azDeg))
    return [`azimuth ${h.azDeg} is not a number`, 'pass degrees, e.g. azDeg: -35 (145 = rear 3/4)'];
  const [e0, e1] = HERO_RANGE.el;
  if (h.elDeg !== undefined && !(num(h.elDeg) && h.elDeg >= e0 && h.elDeg <= e1))
    return [
      `elevation ${h.elDeg} is outside −10…89°`,
      'pass degrees above the horizon, e.g. elDeg: 18 (89 = straight down)',
    ];
  const [f0, f1] = HERO_RANGE.fov;
  if (h.fovDeg !== undefined && !(num(h.fovDeg) && h.fovDeg >= f0 && h.fovDeg <= f1))
    return [
      `field of view ${h.fovDeg} is outside 5…120°`,
      'pass a vertical FOV in degrees, e.g. fovDeg: 30',
    ];
  if (h.eye === undefined && h.target === undefined) return null;
  const fix = 'give both, in metres in the asset frame: eye: [x, y, z], target: [x, y, z]';
  if (!point(h.eye) || !point(h.target))
    return ['a fixed viewpoint needs eye and target, three finite numbers each', fix];
  if (h.azDeg !== undefined || h.elDeg !== undefined)
    return [
      'eye / target and azDeg / elDeg both set the view direction',
      'keep the fixed viewpoint (eye, target, fovDeg) or the orbit (azDeg, elDeg, fovDeg)',
    ];
  const d = [h.eye[0] - h.target[0], h.eye[1] - h.target[1], h.eye[2] - h.target[2]];
  const flat = dmath.hypot(d[0] ?? 0, d[1] ?? 0);
  // The same 89° ceiling as the orbit: straight up or down has no "up" to level the horizon.
  if (flat < 1e-9 || Math.abs(d[2] ?? 0) / flat > dmath.tan((e1 * Math.PI) / 180))
    return [
      'eye and target coincide or are stacked vertically (steeper than 89°)',
      'move the eye sideways from the target',
    ];
  return null;
}

/** Definition check: a bad `hero` fails at defineAsset with T3D_RECIPE_INVALID + fix. */
export function checkHeroView(asset: string, h: HeroView): void {
  const bad =
    h === null || typeof h !== 'object'
      ? (['it is not an object', 'use hero: { azDeg: 145, elDeg: 20 }'] as const)
      : heroViewFault(h);
  if (bad)
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `'${asset}' hero: ${bad[0]}`,
      fix: bad[1],
    });
}
