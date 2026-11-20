// Places a unit piece on a skin point: its local +Z along `axis`, uniformly scaled. A rotation frame
// instead of `place`'s Euler angles, because every sucker and papilla stands on its own normal.

import type { Mesh, Vec3 } from '@developerz.ai/ts23d';
import { dmath } from '@developerz.ai/ts23d';

const norm = (a: Vec3): Vec3 => {
  const l = dmath.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export function stamp(unit: Mesh, at: Vec3, axis: Vec3, scale: number, spin = 0): Mesh {
  const z = norm(axis);
  const ref: Vec3 = Math.abs(z[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
  const x0 = norm(cross(ref, z));
  const y0 = cross(z, x0);
  const [c, s] = [dmath.cos(spin), dmath.sin(spin)];
  const x: Vec3 = [x0[0] * c + y0[0] * s, x0[1] * c + y0[1] * s, x0[2] * c + y0[2] * s];
  const y = cross(z, x);
  const positions = new Float32Array(unit.positions.length);
  const normals = new Float32Array(unit.normals.length);
  for (let i = 0; i < positions.length; i += 3) {
    const [a, b, d] = [
      unit.positions[i] ?? 0,
      unit.positions[i + 1] ?? 0,
      unit.positions[i + 2] ?? 0,
    ];
    const [e, f, g] = [unit.normals[i] ?? 0, unit.normals[i + 1] ?? 0, unit.normals[i + 2] ?? 1];
    for (const k of [0, 1, 2] as const) {
      positions[i + k] = at[k] + (x[k] * a + y[k] * b + z[k] * d) * scale;
      normals[i + k] = x[k] * e + y[k] * f + z[k] * g;
    }
  }
  return { ...unit, positions, normals };
}
