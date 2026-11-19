// Makes a track belt run in the baked `run` clip of any glTF reader, with morph targets: a belt
// looks the same after one link pitch of travel, so K poses of that one pitch are enough. Target 0
// is the whole pitch (every vertex onto its twin, passes/belt-run.ts). The others refine it level
// by level: the pose at 1/2 minus the mean of its two neighbours, then at 1/4 and 3/4, then the
// odd eighths. Each is weighted by a hat round its phase, so LINEAR keys at the K phases give the
// exact pose there, and a refinement is zero wherever the coarser keys already follow the path
// (straight runs, gentle sag): stored sparsely, the fine levels hold only the links rounding
// sprocket, idler and end wheels (tread-write.ts puts targets and keys in the GLB). K is the smallest power of two that
// keeps a vertex between two keys within the LOD's tolerance of its true pose (LINEAR keys cut
// the chord of the arc). Speed is the wheels' rim speed (tread-speed.ts) rounded to whole pitches
// per loop, so the clip closes.

import type { Mesh, Part } from '../core/index.ts';
import { LOOP_SECONDS } from '../core/index.ts';
import { BeltLoop, beltRun } from '../passes/index.ts';
import { beltSpeed } from './tread-speed.ts';

/** Worst deviation between two keys a belt may show, metres, per LOD. */
export const TREAD_TOLERANCE = [0.003, 0.006, 0.02] as const;
/** Phases per pitch tried in turn; the last is used when even it is over tolerance. */
const PHASES = [2, 4, 8] as const;
/** A refinement smaller than this share of the tolerance is not stored. */
const STILL_SHARE = 0.1;
/** A normal that changes less than this (about 1°) is not stored. */
const STILL_NORMAL = 0.02;

export interface TreadTarget {
  /** Phase of the pitch (0..1] this target is fully on at, and how far its hat reaches. */
  readonly phase: number;
  readonly reach: number;
  /** Delta per vertex: position (metres) and normal. */
  readonly positions: Float32Array;
  readonly normals: Float32Array;
}

export interface TreadMorphs {
  /** [0] the whole pitch, then the refinements, coarse to fine; its length is K. */
  readonly targets: readonly TreadTarget[];
  /** Whole pitches travelled per loop of the clip (≥ 1). */
  readonly cycles: number;
  /** Belt speed in the clip along the path's winding, m/s (negative = against it). */
  readonly speed: number;
  /** Worst deviation of a vertex halfway between two keys from its true pose, metres. */
  readonly error: number;
  /** Refinements below this were dropped (metres): the most a key itself is off. */
  readonly still: number;
}

// Built once per belt mesh AND everything else a build reads: the centre line, the pitch, the
// wheels' rim speed (its sign is the direction) and the LOD's tolerance. One mesh under reversed
// wheels or at another LOD is another belt.
const cache = new WeakMap<Mesh, Map<string, TreadMorphs | null>>();

/**
 * The morph targets that run `belt` (a part with a `tread` motion and a mesh) in the `run` clip;
 * null when the belt cannot loop: it does not repeat every pitch (the `treads` gate says so) or
 * its mesh already has morph targets of its own.
 */
export function treadMorphs(parts: readonly Part[], belt: Part, lod: number): TreadMorphs | null {
  const mesh = belt.mesh;
  if (belt.motion?.kind !== 'tread' || !mesh || mesh.indices.length === 0) return null;
  if (mesh.morphs?.length) return null;
  const { path, pitch } = belt.motion;
  const wheels = beltSpeed(parts, belt, new BeltLoop(path));
  const tolerance = TREAD_TOLERANCE[Math.min(Math.max(0, lod), 2)] ?? TREAD_TOLERANCE[0];
  const key = `${tolerance}|${pitch}|${wheels}|${path.map((p) => p.join(',')).join(';')}`;
  const built = cache.get(mesh) ?? new Map<string, TreadMorphs | null>();
  cache.set(mesh, built);
  const known = built.get(key);
  if (known !== undefined) return known;
  const made = build(path, pitch, mesh, wheels, tolerance);
  built.set(key, made);
  return made;
}

function build(
  path: readonly (readonly number[])[],
  pitch: number,
  mesh: Mesh,
  wheels: number,
  tolerance: number,
): TreadMorphs | null {
  const dir = wheels < 0 ? -1 : 1;
  const run = beltRun(path, dir * pitch, mesh);
  if (run.unmatched > 0) return null;
  const cycles = Math.max(1, Math.round((Math.abs(wheels) * LOOP_SECONDS) / pitch));
  const size = mesh.positions.length;
  const poses = new Map<number, { p: Float64Array; n: Float64Array }>();
  const pose = (f: number): { p: Float64Array; n: Float64Array } => {
    let at = poses.get(f);
    if (!at) {
      at = { p: new Float64Array(size), n: new Float64Array(size) };
      run.pose(f, at.p, at.n);
      poses.set(f, at);
    }
    return at;
  };
  /** Worst distance of the blend halfway between keys from the pose there. */
  const errorOf = (k: number): number => {
    let worst = 0;
    for (let j = 0; j < k; j++) {
      const a = pose(j / k).p;
      const b = pose((j + 1) / k).p;
      const mid = pose((2 * j + 1) / (2 * k)).p;
      for (let i = 0; i < size; i += 3) {
        const d =
          (((a[i] ?? 0) + (b[i] ?? 0)) / 2 - (mid[i] ?? 0)) ** 2 +
          (((a[i + 1] ?? 0) + (b[i + 1] ?? 0)) / 2 - (mid[i + 1] ?? 0)) ** 2 +
          (((a[i + 2] ?? 0) + (b[i + 2] ?? 0)) / 2 - (mid[i + 2] ?? 0)) ** 2;
        if (d > worst) worst = d;
      }
    }
    return Math.sqrt(worst);
  };
  let phases: number = PHASES[0];
  let error = Infinity;
  for (const k of PHASES) {
    [phases, error] = [k, errorOf(k)];
    if (error <= tolerance) break;
  }
  const still = tolerance * STILL_SHARE;
  const rest = { p: Float64Array.from(mesh.positions), n: Float64Array.from(mesh.normals) };
  // What the keys reproduce at each phase so far: a refinement is measured against it, so a
  // dropped one never adds to the next level's error.
  const shown = new Map<number, { p: Float64Array; n: Float64Array }>([
    [0, rest],
    [1, pose(1)],
  ]);
  // Deltas snap to a micrometre: the left and right belts then agree to the bit (tread-write.ts
  // stores equal deltas once) instead of differing in the last float32 digit.
  const delta = (from: Float64Array, to: Float64Array, drop: number): Float32Array => {
    const out = new Float32Array(size);
    for (let i = 0; i < size; i += 3) {
      const d = [0, 1, 2].map(
        (k) => Math.round(((to[i + k] ?? 0) - (from[i + k] ?? 0)) * 1e6) / 1e6,
      );
      if (Math.max(...d.map(Math.abs)) > drop) out.set(d, i);
    }
    return out;
  };
  const targets: TreadTarget[] = [
    {
      phase: 1,
      reach: 1,
      positions: delta(rest.p, pose(1).p, 0),
      normals: delta(rest.n, pose(1).n, STILL_NORMAL),
    },
  ];
  for (let reach = 0.5; reach >= 1 / phases; reach /= 2)
    for (let phase = reach; phase < 1; phase += 2 * reach) {
      const [a, b] = [shown.get(phase - reach) ?? rest, shown.get(phase + reach) ?? rest];
      const mean = {
        p: a.p.map((v, i) => (v + (b.p[i] ?? 0)) / 2),
        n: a.n.map((v, i) => (v + (b.n[i] ?? 0)) / 2),
      };
      const positions = delta(mean.p, pose(phase).p, still);
      const normals = delta(mean.n, pose(phase).n, STILL_NORMAL);
      shown.set(phase, {
        p: mean.p.map((v, i) => v + (positions[i] ?? 0)),
        n: mean.n.map((v, i) => v + (normals[i] ?? 0)),
      });
      targets.push({ phase, reach, positions, normals });
    }
  return { targets, cycles, speed: (dir * cycles * pitch) / LOOP_SECONDS, error, still };
}
