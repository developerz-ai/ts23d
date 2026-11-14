// Minimal vector math. Units are metres, Z is up, +X is an asset's "front" (docs/idea/03-ir.md).

export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number];

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a: Vec3): Vec3 => {
  const l = length(a);
  return l === 0 ? [0, 0, 0] : scale(a, 1 / l);
};

export function quatFromAxisAngle(axis: Vec3, radians: number): Quat {
  const [x, y, z] = normalize(axis);
  const s = Math.sin(radians / 2);
  return [x * s, y * s, z * s, Math.cos(radians / 2)];
}

/** `v` turned by unit quaternion `q` [x, y, z, w]; by its inverse (conjugate) when `inverse`. */
export function quatRotate(q: Quat, v: Vec3, inverse = false): Vec3 {
  const [x, y, z] = inverse ? [-q[0], -q[1], -q[2]] : [q[0], q[1], q[2]];
  const w = q[3];
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx),
  ];
}
