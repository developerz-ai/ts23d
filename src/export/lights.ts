// KHR_lights_punctual from light sockets: `ctx.socket('headlamp_l', { kind: 'light', dir,
// data: { light: 'spot', color: '#ffe8c0', intensity: 200, range: 30, cone: 25 } })` becomes a
// real light every engine and viewer can switch on. The socket node stays as authored; the light
// rides a child node `<socket>_light` rotated so its −Z (the glTF light direction) is `dir`.

import { type Part, type Quat, Ts23dError, type Vec3 } from '../core/index.ts';
import { hex } from '../material/index.ts';
import type { Json } from './bin-writer.ts';

export const LIGHTS = 'KHR_lights_punctual';

/**
 * Defaults in the extension's physical units, so engines with physical light units (Unreal,
 * Godot, Babylon, three.js ≥ r155) light a scene plausibly without per-engine tuning:
 * directional = lux (clear-sky sun ≈ 100 000 lx); point/spot = candela from a ~1000 lm lamp
 * (a 75 W incandescent / 10 W LED bulb) spread over 4π sr, or concentrated into the spot's cone.
 */
export const DEFAULT_SUN_LUX = 100_000;
export const DEFAULT_LAMP_LUMENS = 1000;
/**
 * Solid angle of a cone with half-angle `outer` (radians), steradians: 2π(1 − cos θ) written as
 * 4π sin²(θ/2), which keeps its precision for narrow beams where cos θ rounds to 1.
 */
const coneSr = (outer: number): number => 4 * Math.PI * Math.sin(outer / 2) ** 2;

/** Shortest rotation taking unit `a` onto unit `b`. */
function between(a: Vec3, b: Vec3): Quat {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (d < -0.999999) return [1, 0, 0, 0]; // opposite: half turn about X (⊥ to −Z)
  const c: Vec3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const w = 1 + d;
  const n = Math.hypot(c[0], c[1], c[2], w);
  return [c[0] / n, c[1] / n, c[2] / n, w / n];
}

type Data = NonNullable<NonNullable<Part['socket']>['data']>;

/** Widest spot half-angle, degrees: glTF needs outerConeAngle < π/2. */
const MAX_CONE = 89;
/**
 * Narrowest spot half-angle, degrees: a 1° beam, about the tightest real searchlight or pin-spot
 * optics. A default 1000 lm lamp in it is ~4.2 Mcd; narrower cones only push the default toward
 * absurd (and, below ~1e-6°, infinite) candela, which a file writes as `null`.
 */
export const MIN_CONE = 0.5;

/**
 * `data[key]` as a number in [min, max], or `fallback` when the key is absent. Anything else
 * would reach the file as `null`, a negative angle or a light no engine can evaluate.
 */
function num(
  part: string,
  data: Data,
  key: string,
  fallback: number,
  range: { min: number; max?: number; unit: string; eg: number },
): number {
  const v = data[key];
  if (v === undefined) return fallback;
  const max = range.max ?? Infinity;
  const low = typeof v === 'number' && v >= range.min;
  if (typeof v === 'number' && Number.isFinite(v) && low && v <= max) return v;
  const span = `at least ${range.min}${range.max === undefined ? '' : ` and at most ${max}`}`;
  throw new Ts23dError('T3D_RECIPE_INVALID', {
    cause: `light socket '${part}': ${key} ${String(v)} is not a number ${span} (${range.unit})`,
    fix: `pass data: { ${key}: ${range.eg} } on the socket, or drop '${key}' for the default`,
  });
}

/** The glTF light for a light socket, or null for any other part. */
export function lightOf(part: Part): { light: Json; rotation: Quat } | null {
  const s = part.socket;
  if (s?.kind !== 'light') return null;
  const d = s.data ?? {};
  const type = d['light'] === 'point' || d['light'] === 'directional' ? d['light'] : 'spot';
  const color = typeof d['color'] === 'string' ? hex(d['color']) : [1, 1, 1];
  const dir = s.dir ?? [1, 0, 0];
  const len = Math.hypot(...dir) || 1;
  const spot = type === 'spot';
  const cone = { max: MAX_CONE, unit: 'degrees, the half-angle of the beam' };
  const outerDeg = spot ? num(part.name, d, 'cone', 30, { ...cone, min: MIN_CONE, eg: 25 }) : 30;
  const innerDeg = spot ? num(part.name, d, 'inner', 0, { ...cone, min: 0, eg: 12 }) : 0;
  const outer = (outerDeg * Math.PI) / 180;
  // glTF requires inner < outer: an inner cone as wide as the beam stops just inside it.
  const inner = Math.min(outer * 0.999, (innerDeg * Math.PI) / 180);
  const fallback =
    type === 'directional'
      ? DEFAULT_SUN_LUX
      : DEFAULT_LAMP_LUMENS / (type === 'point' ? 4 * Math.PI : coneSr(outer));
  const unit = type === 'directional' ? 'lux' : 'candela';
  const intensity = num(part.name, d, 'intensity', fallback, { min: 0, unit, eg: 200 });
  const range = num(part.name, d, 'range', 0, { min: 0, unit: 'metres; 0 = unlimited', eg: 30 });
  return {
    light: {
      name: part.name,
      type,
      color,
      // Spot/point: candela; directional: lux (DEFAULT_* above).
      intensity,
      ...(range > 0 && type !== 'directional' ? { range } : {}),
      ...(spot ? { spot: { innerConeAngle: inner, outerConeAngle: outer } } : {}),
    },
    rotation: between([0, 0, -1], [dir[0] / len, dir[1] / len, dir[2] / len]),
  };
}
