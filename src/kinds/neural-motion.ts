// A motion model's output (text- or video-to-motion, `motion` task) as a baked clip on OUR
// skeleton (ADR 013: keys, never a runtime solver). The model returns `t3d-motion/1` JSON —
// fps, a root offset per frame, local rotations per bone and frame — which is (1) resampled to a
// whole number of cycles at 30 fps so the loop closes, (2) foot-locked: a foot whose tip is in
// contact (within `contact` of the clip's lowest tip) on two frames in a row must not move, so the
// root takes back the planted feet's mean slip (the classic neural root drift), and (3) written as
// rotation + root translation tracks. Bones the skeleton lacks are refused, not guessed.

import {
  type Bone,
  type Clip,
  dmath,
  type Quat,
  type Track,
  Ts23dError,
  type Vec3,
} from '../core/index.ts';
import { forward, IDENTITY, tailOf } from './pose.ts';

export interface MotionTracks {
  readonly fps: number;
  /** Root offset per frame, metres (asset frame). */
  readonly root: readonly Vec3[];
  /** Local rotation (xyzw) per bone per frame. */
  readonly rotations: ReadonlyMap<string, readonly Quat[]>;
}

const bad = (cause: string, fix: string): never => {
  throw new Ts23dError('T3D_NEURAL_OUTPUT_INVALID', { cause: `motion: ${cause}`, fix });
};

/** Keys this close to unit length are normalised; further off is not a rotation (Euler, zero). */
const UNIT_SLACK = 1e-3;

const isKey = (v: unknown, n: number): boolean =>
  Array.isArray(v) && v.length === n && v.every(Number.isFinite);

/** One rotation key, checked (4 finite numbers, unit within `UNIT_SLACK`) and normalised. */
function unitKey(bone: string, frame: number, q: unknown): Quat {
  if (!isKey(q, 4))
    bad(
      `bone '${bone}' frame ${frame} is ${JSON.stringify(q)}, not 4 numbers`,
      'bake rotations as quaternions [x, y, z, w], not Euler angles',
    );
  const [x, y, z, w] = q as Quat;
  const l = dmath.hypot(x, y, z, w);
  if (!(Math.abs(l - 1) <= UNIT_SLACK))
    bad(
      `bone '${bone}' frame ${frame} has length ${l.toFixed(4)}, not a unit quaternion`,
      'bake unit quaternions [x, y, z, w] (the rest pose is [0, 0, 0, 1])',
    );
  return [x / l, y / l, z / l, w / l];
}

/** Parse `t3d-motion/1`: { fps, root: [[x,y,z]…], bones: { name: [[x,y,z,w]…] } }. */
export function parseMotion(bytes: Uint8Array, bones: readonly Bone[]): MotionTracks {
  let j: { fps?: unknown; root?: unknown; bones?: unknown };
  try {
    j = JSON.parse(new TextDecoder().decode(bytes)) as typeof j;
  } catch (e) {
    return bad(
      `not JSON (${e instanceof Error ? e.message : String(e)})`,
      'return t3d-motion/1 JSON',
    );
  }
  const fps = Number(j.fps);
  if (!(fps > 0)) bad(`fps is ${String(j.fps)}`, 'give fps > 0');
  const root = Array.isArray(j.root)
    ? (j.root as Vec3[])
    : bad('no root track', 'give root: [[x,y,z]…]');
  const n = root.length;
  if (n < 2) bad(`${n} frame(s)`, 'return at least 2 frames');
  root.forEach((v, f) => {
    if (!isKey(v, 3))
      bad(
        `root frame ${f} is ${JSON.stringify(v)}, not 3 numbers`,
        'give root: [[x,y,z]…] in metres',
      );
  });
  const names = new Set(bones.map((b) => b.name));
  const rotations = new Map<string, Quat[]>();
  for (const [name, keys] of Object.entries((j.bones ?? {}) as Record<string, Quat[]>)) {
    if (!names.has(name))
      bad(`bone '${name}' is not in the skeleton`, 'retarget the motion to the asset’s bone names');
    if (!Array.isArray(keys) || keys.length !== n)
      bad(`bone '${name}' has ${String(keys?.length)} keys for ${n} frames`, 'one key per frame');
    rotations.set(
      name,
      keys.map((q, f) => unitKey(name, f, q)),
    );
  }
  return { fps, root, rotations };
}

const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Normalised lerp the short way (keys are a frame apart: nlerp ≈ slerp). */
function nlerp(a: Quat, b: Quat, t: number): Quat {
  const s = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
  const q: Quat = [0, 1, 2, 3].map(
    (k) => (a[k] ?? 0) * (1 - t) + (b[k] ?? 0) * s * t,
  ) as unknown as Quat;
  const l = dmath.norm(q) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

export const MOTION_FPS = 30;

/** Resample to a whole number of `period`-second cycles at 30 fps; under one cycle is refused. */
export function resampleCycles(m: MotionTracks, period: number): MotionTracks {
  if (!(period > 0)) bad(`cycle period ${period}`, 'give the cycle length in seconds');
  const dur = (m.root.length - 1) / m.fps;
  const cycles = Math.floor(dur / period + 1e-6);
  // Padding a short motion out to the period would freeze its last frame for the rest of the loop.
  if (cycles < 1)
    bad(
      `${dur.toFixed(3)} s of motion is shorter than one ${period} s cycle`,
      'generate at least one whole cycle, or pass a period no longer than the motion',
    );
  const frames = Math.round(cycles * period * MOTION_FPS);
  const at = <T>(keys: readonly T[], f: number, mix: (a: T, b: T, t: number) => T): T => {
    const src = Math.min(keys.length - 1, (f / MOTION_FPS) * m.fps);
    const i = Math.min(keys.length - 2, Math.floor(src));
    return mix(keys[i] as T, keys[i + 1] as T, src - i);
  };
  const idx = Array.from({ length: frames + 1 }, (_, f) => f);
  const rotations = new Map<string, Quat[]>();
  for (const [b, keys] of m.rotations)
    rotations.set(
      b,
      idx.map((f) => at(keys, f, nlerp)),
    );
  return { fps: MOTION_FPS, root: idx.map((f) => at(m.root, f, lerp)), rotations };
}

/** World tips of `feet` per frame under the motion. */
function tips(m: MotionTracks, bones: readonly Bone[], feet: readonly string[]): Vec3[][] {
  const byName = new Map(bones.map((b) => [b.name, b]));
  return m.root.map((root, f) => {
    const rotation = new Map<string, Quat>();
    for (const [b, keys] of m.rotations) rotation.set(b, keys[f] ?? IDENTITY);
    const w = forward(bones, { rotation, root });
    return feet.map((name) => {
      const b = byName.get(name);
      const bw = w.get(name);
      return b && bw
        ? tailOf(b, bw)
        : bad(`foot bone '${name}' is not in the skeleton`, 'name the paw / toe bones');
    });
  });
}

/** Largest horizontal move of a foot tip between two frames it is planted on, metres. */
export function plantedSlide(
  m: MotionTracks,
  bones: readonly Bone[],
  feet: readonly string[],
  contact = 0.02,
  floor?: number,
): number {
  const t = tips(m, bones, feet);
  const z0 = floor ?? Math.min(...t.flat().map((p) => p[2]));
  const on = (f: number, k: number): boolean => (t[f]?.[k]?.[2] ?? Infinity) < z0 + contact;
  let slide = 0;
  for (let f = 1; f < t.length; f++)
    feet.forEach((_, k) => {
      if (!(on(f, k) && on(f - 1, k))) return;
      const a = t[f]?.[k] ?? [0, 0, 0];
      const b = t[f - 1]?.[k] ?? [0, 0, 0];
      slide = Math.max(slide, dmath.hypot(a[0] - b[0], a[1] - b[1]));
    });
  return slide;
}

/** Foot-lock by root correction; returns the motion and its largest remaining planted slip. */
export function footLock(
  m: MotionTracks,
  bones: readonly Bone[],
  feet: readonly string[],
  contact = 0.02,
): { readonly motion: MotionTracks; readonly slide: number } {
  const raw = tips(m, bones, feet);
  const floor = Math.min(...raw.flat().map((p) => p[2]));
  const planted = (f: number, k: number): boolean =>
    (raw[f]?.[k]?.[2] ?? Infinity) < floor + contact;
  const fix: Vec3[] = [[0, 0, 0]];
  for (let f = 1; f < raw.length; f++) {
    const prev = fix[f - 1] ?? [0, 0, 0];
    const slips = feet.flatMap((_, k) =>
      planted(f, k) && planted(f - 1, k)
        ? [[0, 1].map((a) => (raw[f]?.[k]?.[a] ?? 0) - (raw[f - 1]?.[k]?.[a] ?? 0))]
        : [],
    );
    const mean = (a: number): number =>
      slips.reduce((s, d) => s + (d[a] ?? 0), 0) / (slips.length || 1);
    fix.push(slips.length ? [prev[0] - mean(0), prev[1] - mean(1), prev[2]] : prev);
  }
  const motion: MotionTracks = {
    ...m,
    root: m.root.map((r, f): Vec3 => [r[0] + (fix[f]?.[0] ?? 0), r[1] + (fix[f]?.[1] ?? 0), r[2]]),
  };
  const slide = plantedSlide(motion, bones, feet, contact, floor);
  return { motion, slide };
}

/** The motion as a looping clip: root translation offsets on `rootBone`, rotations per bone. */
export function motionClip(name: string, m: MotionTracks, rootBone: string): Clip {
  const n = m.root.length;
  const times = Float32Array.from({ length: n }, (_, f) => f / m.fps);
  const tracks: Track[] = [
    { bone: rootBone, path: 'translation', times, values: Float32Array.from(m.root.flat()) },
  ];
  for (const [bone, keys] of [...m.rotations].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const values = new Float32Array(n * 4);
    let prev: Quat = IDENTITY;
    keys.forEach((q, i) => {
      const s = q[0] * prev[0] + q[1] * prev[1] + q[2] * prev[2] + q[3] * prev[3] < 0 ? -1 : 1;
      prev = [q[0] * s, q[1] * s, q[2] * s, q[3] * s];
      values.set(prev, i * 4);
    });
    tracks.push({ bone, path: 'rotation', times, values });
  }
  return { name, seconds: (n - 1) / m.fps, loop: true, tracks };
}

/** Model JSON → resampled, foot-locked clip (the whole pipeline). */
export function neuralMotionClip(o: {
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly bones: readonly Bone[];
  readonly rootBone: string;
  readonly feet: readonly string[];
  readonly period: number;
  readonly contact?: number;
}): { readonly clip: Clip; readonly slide: number } {
  const parsed = resampleCycles(parseMotion(o.bytes, o.bones), o.period);
  const { motion, slide } = footLock(parsed, o.bones, o.feet, o.contact);
  return { clip: motionClip(o.name, motion, o.rootBone), slide };
}
