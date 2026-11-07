// KHR_lights_punctual from light sockets: `ctx.socket('headlamp_l', { kind: 'light', dir,
// data: { light: 'spot', color: '#ffe8c0', intensity: 200, range: 30, cone: 25 } })` becomes a
// real light every engine and viewer can switch on. The socket node stays as authored; the light
// rides a child node `<socket>_light` rotated so its −Z (the glTF light direction) is `dir`.

import type { Part, Quat, Vec3 } from '../core/index.ts';
import { hex } from '../material/index.ts';
import type { Json } from './bin-writer.ts';

export const LIGHTS = 'KHR_lights_punctual';

/** Shortest rotation taking unit `a` onto unit `b`. */
function between(a: Vec3, b: Vec3): Quat {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (d < -0.999999) return [1, 0, 0, 0]; // opposite: half turn about X (⊥ to −Z)
  const c: Vec3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const w = 1 + d;
  const n = Math.hypot(c[0], c[1], c[2], w);
  return [c[0] / n, c[1] / n, c[2] / n, w / n];
}

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

/** The glTF light for a light socket, or null for any other part. */
export function lightOf(part: Part): { light: Json; rotation: Quat } | null {
  const s = part.socket;
  if (s?.kind !== 'light') return null;
  const d = s.data ?? {};
  const type = d['light'] === 'point' || d['light'] === 'directional' ? d['light'] : 'spot';
  const color = typeof d['color'] === 'string' ? hex(d['color']) : [1, 1, 1];
  const dir = s.dir ?? [1, 0, 0];
  const len = Math.hypot(...dir) || 1;
  const outer = (Math.min(89, num(d['cone'], 30)) * Math.PI) / 180;
  const inner = Math.min(outer * 0.999, (num(d['inner'], 0) * Math.PI) / 180);
  const range = num(d['range'], 0);
  return {
    light: {
      name: part.name,
      type,
      color,
      // Spot/point: candela; directional: lux. Defaults suit a vehicle lamp / a sun.
      intensity: num(d['intensity'], type === 'directional' ? 3 : type === 'point' ? 20 : 100),
      ...(range > 0 && type !== 'directional' ? { range } : {}),
      ...(type === 'spot' ? { spot: { innerConeAngle: inner, outerConeAngle: outer } } : {}),
    },
    rotation: between([0, 0, -1], [dir[0] / len, dir[1] / len, dir[2] / len]),
  };
}
