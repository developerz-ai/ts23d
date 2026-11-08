// The arm: shoulder ball, upper arm and forearm as lofts of ellipses along +X, tapering to the
// wrist. Returns where the wrist is and its section, so the hand module builds to fit it.

import { type BuildContext, hex, lathe, loft, type Vec3 } from '@developerz.ai/ts23d';

export const SKIN = hex('#c58c68');

/** An ellipse in the plane x = const, CCW seen from +X (rings run along +X). */
export const ringYZ = (x: number, ry: number, rz: number, z: number, n: number): Vec3[] =>
  Array.from({ length: n }, (_, k): Vec3 => {
    const a = (k / n) * Math.PI * 2;
    return [x, ry * Math.cos(a), z + rz * Math.sin(a)];
  });

/** A sphere's lathe profile: radius `r`, `steps` points pole to pole. */
export const ball = (r: number, steps: number): [number, number][] =>
  Array.from({ length: steps }, (_, i): [number, number] => {
    const a = -Math.PI / 2 + (i / (steps - 1)) * Math.PI;
    return [Math.max(1e-4, r * Math.cos(a)), r * Math.sin(a)];
  });

export interface ArmOptions {
  /** Shoulder centre. */
  readonly shoulder: Vec3;
  readonly upperLength: number;
  readonly forearmLength: number;
  /** Wrist half-breadth (Y) and half-depth (Z). */
  readonly wrist: readonly [number, number];
}

export interface Arm {
  readonly elbow: Vec3;
  readonly wrist: Vec3;
}

export function arm(ctx: BuildContext, o: ArmOptions): Arm {
  const n = ctx.pick([24, 12, 6]);
  const [sx, , sz] = o.shoulder;
  ctx.part(
    'shoulder',
    lathe({
      profile: ball(0.06, ctx.pick([9, 6, 4])),
      segments: n,
      color: SKIN,
      at: o.shoulder,
    }),
  );
  const x0 = sx + 0.03;
  const x1 = x0 + o.upperLength;
  const x2 = x1 + o.forearmLength;
  // Upper arm: deltoid bulge, narrowing to the elbow (4.2 × 4.0 cm half-axes).
  const upper: [number, number, number][] = [
    [x0, 0.052, 0.05],
    [x0 + 0.08, 0.05, 0.048],
    [x1, 0.042, 0.04],
  ];
  ctx.part(
    'upper_arm',
    loft({
      rings: upper.map(([x, ry, rz]) => ringYZ(x, ry, rz, sz, n)),
      color: SKIN,
      capStart: true,
      capEnd: true,
    }),
  );
  // Forearm: the muscle belly near the elbow, flattening to the wrist.
  const [wy, wz] = o.wrist;
  const fore: [number, number, number][] = [
    [x1, 0.042, 0.04],
    [x1 + 0.07, 0.044, 0.04],
    [x1 + 0.17, 0.034, 0.03],
    [x2, wy, wz],
  ];
  const keep = ctx.lod === 2 ? [fore[0], fore[3]] : fore;
  ctx.part(
    'forearm',
    loft({
      rings: keep.flatMap((r) => (r ? [ringYZ(r[0], r[1], r[2], sz, n)] : [])),
      color: SKIN,
      capStart: true,
      capEnd: true,
    }),
  );
  return { elbow: [x1, 0, sz], wrist: [x2, 0, sz] };
}
