// Grime: darken vertex colour near the ground and in named zones (soot, mud, dust). A pass over a
// finished mesh, so recipes stay about shape; wear is applied once, the same way everywhere.

import { type Mesh, Ts23dError, type Vec3 } from '../core/index.ts';

export interface GrimeZone {
  readonly at: Vec3;
  readonly radius: number;
  /** 0..1 darkening at the centre. */
  readonly strength: number;
}

export interface GrimeOptions {
  /** Height (m) below which mud/dust builds up toward the ground. */
  readonly ground?: number;
  /** Darkening at z = 0. */
  readonly groundStrength?: number;
  readonly zones?: readonly GrimeZone[];
}

/** Throws T3D_RECIPE_INVALID unless `v` is finite and within [min, max]. */
function inRange(what: string, v: number, min: number, max: number, eg: string): void {
  if (!(Number.isFinite(v) && v >= min && v <= max))
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `grime ${what} is ${v}`,
      fix: `use ${min}..${max}, e.g. ${eg}`,
    });
}

// Strengths in [0, 1] keep every darkening factor in [0, 1], so colours never go negative or
// brighten past their input: the colour range holds without a clamp.
function checkGrime(o: GrimeOptions): void {
  inRange('ground', o.ground ?? 0, 0, Number.MAX_VALUE, 'ground: 1.2');
  inRange('groundStrength', o.groundStrength ?? 0.3, 0, 1, 'groundStrength: 0.3');
  for (const z of o.zones ?? []) {
    if (!z.at.every(Number.isFinite) || !(Number.isFinite(z.radius) && z.radius > 0))
      throw new Ts23dError('T3D_RECIPE_INVALID', {
        cause: `grime zone at [${z.at.join(', ')}] radius ${z.radius} m is not a finite sphere`,
        fix: 'give a finite centre and a radius > 0 m, e.g. { at: [0, 0, 1], radius: 0.8, … }',
      });
    inRange('zone strength', z.strength, 0, 1, 'strength: 0.4');
  }
}

export function grime(mesh: Mesh, o: GrimeOptions): Mesh {
  checkGrime(o);
  const colors = new Float32Array(mesh.colors);
  const g = o.ground ?? 0;
  const gs = o.groundStrength ?? 0.3;
  for (let i = 0; i < mesh.positions.length / 3; i++) {
    const x = mesh.positions[i * 3] ?? 0;
    const y = mesh.positions[i * 3 + 1] ?? 0;
    const z = mesh.positions[i * 3 + 2] ?? 0;
    let f = g > 0 && z < g ? 1 - gs * (1 - Math.max(0, z) / g) : 1;
    for (const zone of o.zones ?? []) {
      const d = Math.hypot(x - zone.at[0], y - zone.at[1], z - zone.at[2]) / zone.radius;
      if (d < 1) f *= 1 - zone.strength * (1 - d);
    }
    for (let k = 0; k < 3; k++) colors[i * 3 + k] = (colors[i * 3 + k] ?? 1) * f;
  }
  return { ...mesh, colors };
}
