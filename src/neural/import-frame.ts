// The one transform an imported model goes through, shared by its meshes, bones and clip keys:
// file axes → ts23d (x = p·front, y = p·left, z = p·up), × unit scale, × fit, then placement.
// A similarity (rotation, uniform scale, offset), so points, offsets and directions each have
// their own map. The same rules as importGlb (`up`, `front`, `scale`, `height`, `fit`, `place`).

import { type Bounds, Ts23dError, type Vec3 } from '../core/index.ts';
import type { ImportOptions } from './import-glb.ts';

type Axis = NonNullable<ImportOptions['up']>;

const VEC: Record<Axis, Vec3> = {
  '+x': [1, 0, 0],
  '-x': [-1, 0, 0],
  '+y': [0, 1, 0],
  '-y': [0, -1, 0],
  '+z': [0, 0, 1],
  '-z': [0, 0, -1],
};

export interface ImportFrame {
  /** Rows of the rotation: the file's front, left and up axes. */
  readonly rows: readonly [Vec3, Vec3, Vec3];
  /** File units → metres actually applied (unit scale × fit). */
  readonly scale: number;
  /** Added after rotation and scale (metres). */
  readonly offset: Vec3;
}

const unsupported = (cause: string, fix: string): never => {
  throw new Ts23dError('T3D_IMPORT_UNSUPPORTED', { cause, fix });
};

/** Axes and unit scale only (no fit, no placement): what bounds are measured in. */
export function axesFrame(o: ImportOptions): ImportFrame {
  const sizes: [string, number | undefined][] = [
    ['scale', o.scale],
    ['height', o.height],
    ...(o.fit ?? []).map((v, k): [string, number] => [`fit[${k}]`, v]),
  ];
  for (const [name, v] of sizes)
    if (v !== undefined && !(Number.isFinite(v) && v > 0))
      unsupported(
        `${name} is ${v}; import sizes must be finite and > 0`,
        'pass a positive size; to mirror, import as-is and place with `place({ scale: [-1, 1, 1] })`, which flips winding',
      );
  const U = VEC[o.up ?? '+y'];
  const F = VEC[o.front ?? '+z'];
  if (!U || !F || Math.abs(U[0] * F[0] + U[1] * F[1] + U[2] * F[2]) > 0)
    return unsupported(
      `up '${o.up}' and front '${o.front}' are not two perpendicular axes`,
      "glTF files are up '+y', front '+z' (the defaults); Z-up exporters: up '+z', front '+x' or '-y'",
    );
  const L: Vec3 = [U[1] * F[2] - U[2] * F[1], U[2] * F[0] - U[0] * F[2], U[0] * F[1] - U[1] * F[0]];
  return { rows: [F, L, U], scale: o.scale ?? 1, offset: [0, 0, 0] };
}

/** `axes` completed with the fit and placement of `bounds` (measured after `axes`). */
export function fitFrame(axes: ImportFrame, bounds: Bounds, o: ImportOptions): ImportFrame {
  const { min, max } = bounds;
  const size = [0, 1, 2].map((k) => (max[k] ?? 0) - (min[k] ?? 0));
  const fit =
    o.height !== undefined
      ? o.height / Math.max(size[2] ?? 0, 1e-12)
      : o.fit
        ? Math.min(...o.fit.map((v, k) => v / Math.max(size[k] ?? 0, 1e-12)))
        : 1;
  const place = o.place ?? 'ground';
  const c: Vec3 =
    place === 'origin'
      ? [0, 0, 0]
      : [
          (min[0] + max[0]) / 2,
          (min[1] + max[1]) / 2,
          place === 'ground' ? min[2] : (min[2] + max[2]) / 2,
        ];
  return {
    rows: axes.rows,
    scale: axes.scale * fit,
    offset: [-c[0] * fit, -c[1] * fit, -c[2] * fit],
  };
}

/** A direction (normal, rotation axis): rotated only. */
export function frameDir(f: ImportFrame, v: Vec3): Vec3 {
  const [F, L, U] = f.rows;
  return [
    v[0] * F[0] + v[1] * F[1] + v[2] * F[2],
    v[0] * L[0] + v[1] * L[1] + v[2] * L[2],
    v[0] * U[0] + v[1] * U[1] + v[2] * U[2],
  ];
}

/** An offset (a clip translation, a bone vector): rotated and scaled. */
export function frameVec(f: ImportFrame, v: Vec3): Vec3 {
  const d = frameDir(f, v);
  return [d[0] * f.scale, d[1] * f.scale, d[2] * f.scale];
}

/** A point: rotated, scaled and placed. */
export function framePoint(f: ImportFrame, p: Vec3): Vec3 {
  const d = frameVec(f, p);
  return [d[0] + f.offset[0], d[1] + f.offset[1], d[2] + f.offset[2]];
}

/** Packed xyz triples mapped as points (`normals`: as unit directions). */
export function frameArray(f: ImportFrame, src: Float32Array, normals = false): Float32Array {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 3) {
    const v: Vec3 = [src[i] ?? 0, src[i + 1] ?? 0, src[i + 2] ?? 0];
    out.set(normals ? frameDir(f, v) : framePoint(f, v), i);
  }
  return out;
}
