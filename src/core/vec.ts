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
