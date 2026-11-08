// importGlb: a licensed GLB (a scan, a CC0 MakeHuman/MPFB export, a local generator's output) as
// a ts23d mesh. Bytes come from the offline cache by sha256 (or inline, hash-checked); the licence
// is gated; transforms are baked; the file's frame (glTF: Y up, +Z front) becomes ts23d's (Z up,
// +X front, metres); it is scaled to a target size, placed, cleaned, and a PNG baseColor is
// projected into vertex colour. Memoised by (sha256, options), so three LOD compiles parse once.

import { boundsOf, type Mesh, merge, Ts23dError, type Vec3 } from '../core/index.ts';
import type { Rgba } from '../material/index.ts';
import { readGlb } from './glb-read.ts';
import { scenePrimitives } from './glb-scene.ts';
import { projectAlbedo } from './import-albedo.ts';
import { importBytes } from './import-cache.ts';
import { type CleanOptions, type CleanReport, cleanMesh, smoothNormals } from './import-clean.ts';
import { checkLicence, type ImportCredit } from './import-licence.ts';
import { readPng } from './png-read.ts';

export interface ImportSource extends ImportCredit {
  /** Where the file lives, relative to the working directory (messages and the cache script). */
  readonly path: string;
  /** Lower-case hex sha256 of the file: the cache key and the integrity check. */
  readonly sha256: string;
  /** The file's bytes, when the caller already has them (checked against `sha256`). */
  readonly bytes?: Uint8Array;
  /** Accept a non-commercial licence for a private test; the result carries a warning. */
  readonly allowNonCommercial?: boolean;
}

type Axis = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';

export interface ImportOptions {
  /** The file's up axis (glTF: '+y', the default; Z-up exporters: '+z'). */
  readonly up?: Axis;
  /** The file's front axis (glTF: '+z', the default). */
  readonly front?: Axis;
  /** File units → metres before fitting (0.01 for centimetres). Default 1. */
  readonly scale?: number;
  /** Uniform fit: the height (Z extent) in metres. */
  readonly height?: number;
  /** Uniform fit: inside this box (X, Y, Z metres). Ignored when `height` is set. */
  readonly fit?: Vec3;
  /** 'ground' (default): centred on X/Y, base on z = 0. 'centre': bounds centred on the origin. */
  readonly place?: 'ground' | 'centre' | 'origin';
  /** Cleanup options, or false to keep the file's triangles untouched. */
  readonly clean?: CleanOptions | false;
}

export interface ImportedMesh {
  /** All primitives merged: Z up, metres, the file's UVs, vertex colour = albedo. */
  readonly mesh: Mesh;
  /** The decoded baseColor image (PNG only), for own-texture bakes; absent when none. */
  readonly albedo?: Rgba;
  readonly report: CleanReport | null;
  /** Credit line for `defineAsset({ sources })` / the GLB's XMP contributors. */
  readonly credit: string;
  readonly warnings: readonly string[];
  readonly sha256: string;
  /** File units → metres actually applied (scale × fit). */
  readonly scale: number;
}

const memo = new Map<string, ImportedMesh>();

const VEC: Record<Axis, Vec3> = {
  '+x': [1, 0, 0],
  '-x': [-1, 0, 0],
  '+y': [0, 1, 0],
  '-y': [0, -1, 0],
  '+z': [0, 0, 1],
  '-z': [0, 0, -1],
};

export function importGlb(source: ImportSource, o: ImportOptions = {}): ImportedMesh {
  const licence = checkLicence(source, source.allowNonCommercial === true);
  const bytes = importBytes(source);
  const key = JSON.stringify([source.sha256, o, licence.credit]);
  const hit = memo.get(key);
  if (hit) return hit;
  const U = VEC[o.up ?? '+y'];
  const F = VEC[o.front ?? '+z'];
  if (!U || !F || Math.abs(U[0] * F[0] + U[1] * F[1] + U[2] * F[2]) > 0)
    throw new Ts23dError('T3D_IMPORT_UNSUPPORTED', {
      cause: `up '${o.up}' and front '${o.front}' are not two perpendicular axes`,
      fix: "glTF files are up '+y', front '+z' (the defaults); Z-up exporters: up '+z', front '+x' or '-y'",
    });
  const prims = scenePrimitives(readGlb(bytes));
  const tris = prims.reduce((t, p) => t + p.mesh.indices.length, 0);
  if (!tris)
    throw new Ts23dError('T3D_IMPORT_EMPTY', {
      cause: `'${source.path}' has no triangles in its default scene`,
      fix: 'export the mesh (not only an armature or empties) with triangles, and include it in the scene',
    });
  const warnings: string[] = licence.warning ? [licence.warning] : [];
  let albedo: Rgba | undefined;
  const meshes = prims.map((p) => {
    let m = p.flatNormals ? smoothNormals(p.mesh) : p.mesh;
    if (p.image?.mime === 'image/png') {
      const img = readPng(p.image.bytes, p.name);
      albedo ??= img;
      m = projectAlbedo(m, img);
    } else if (p.image)
      warnings.push(
        `'${p.name}': ${p.image.mime || 'unknown'} baseColor not projected (PNG only); vertex colour = baseColorFactor`,
      );
    return m;
  });
  const L: Vec3 = [U[1] * F[2] - U[2] * F[1], U[2] * F[0] - U[0] * F[2], U[0] * F[1] - U[1] * F[0]];
  let mesh = reframe(merge(meshes), F, L, U, o.scale ?? 1);
  const b = boundsOf(mesh);
  const size = [0, 1, 2].map((k) => (b.max[k] ?? 0) - (b.min[k] ?? 0));
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
          (b.min[0] + b.max[0]) / 2,
          (b.min[1] + b.max[1]) / 2,
          place === 'ground' ? b.min[2] : (b.min[2] + b.max[2]) / 2,
        ];
  mesh = {
    ...mesh,
    positions: mesh.positions.map((v, i) => (v - (c[i % 3] ?? 0)) * fit),
  };
  const cleaned = o.clean === false ? null : cleanMesh(mesh, o.clean ?? {});
  const out: ImportedMesh = {
    mesh: cleaned?.mesh ?? mesh,
    ...(albedo ? { albedo } : {}),
    report: cleaned?.report ?? null,
    credit: licence.credit,
    warnings,
    sha256: source.sha256,
    scale: (o.scale ?? 1) * fit,
  };
  memo.set(key, out);
  return out;
}

/** File frame → ts23d: x = p·front, y = p·left, z = p·up (a rotation; scale applied). */
function reframe(m: Mesh, F: Vec3, L: Vec3, U: Vec3, s: number): Mesh {
  const map = (src: Float32Array, k: number): Float32Array => {
    const out = new Float32Array(src.length);
    for (let i = 0; i < src.length; i += 3) {
      const x = src[i] ?? 0;
      const y = src[i + 1] ?? 0;
      const z = src[i + 2] ?? 0;
      out[i] = (x * F[0] + y * F[1] + z * F[2]) * k;
      out[i + 1] = (x * L[0] + y * L[1] + z * L[2]) * k;
      out[i + 2] = (x * U[0] + y * U[1] + z * U[2]) * k;
    }
    return out;
  };
  return { ...m, positions: map(m.positions, s), normals: map(m.normals, 1) };
}
