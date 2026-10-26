// Grime: darken vertex colour near the ground and in named zones (soot, mud, dust). A pass over a
// finished mesh, so recipes stay about shape; wear is applied once, the same way everywhere.

import type { Mesh, Vec3 } from '../core/index.ts';

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

export function grime(mesh: Mesh, o: GrimeOptions): Mesh {
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
