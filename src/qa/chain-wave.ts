// What a swimming clip does, read off the posed skeleton with no bone-name assumptions. The body is
// the longest root-to-leaf bone path (a trunk is authored head → tail); each clip is sampled at
// 30 fps or its key rate if higher, root travel taken out, and every station of the body is
// projected on the axis the tail beats along (any plane: a shark sideways, a whale up and down).
// The beat is the strongest harmonic of the tail's signal, and the phase of that harmonic along the
// body gives the travelling wave.

import type { Armature, Bone, Clip, Vec3 } from '../core/index.ts';
import { dmath } from '../core/index.ts';
import { bodyPath, boneEnd, boneLength, childMap, reach } from './chain-bones.ts';
import { harmonicPowers } from './chain-fft.ts';
import { clipPose, type JointWorld, jointWorlds } from './clip-pose.ts';

export const SWIM_FPS = 30;
/** A side branch this share of the body long makes a radial plan (arms, necks), not a swimmer's
 *  fin: an octopus's jet has no tail beat to measure. */
export const SIDE_BRANCH_SHARE = 0.5;
/** Links sloping less than this share of the steepest have no readable phase. */
const PHASE_SHARE = 0.2;
/** Under this tail excursion, as a share of L, the tail is not beating. */
const STILL_TAIL = 1e-4;
/** Fewer waves than this along the body is every station moving together. */
const STANDING_WAVES = 0.15;
/** Largest backward phase step between stations that is still a wave heading tailward, radians. */
const PHASE_SLACK = 0.15;

export interface BodyChain {
  readonly bones: readonly Bone[];
  /** Arc position of each station (bone heads, then the last bone's tail): 0 head, 1 tip. */
  readonly s: readonly number[];
  readonly length: number;
}

export type WaveHeading = 'tailward' | 'headward' | 'standing';

export interface ClipWave {
  readonly clip: string;
  /** Root speed along the net travel, m/s. */
  readonly speed: number;
  /** Tail-beat frequency, Hz; 0 when the tail does not beat. */
  readonly frequency: number;
  /** Peak-to-peak excursion of each station, metres (last = the tail tip). */
  readonly excursion: readonly number[];
  /** Wavelength from the phase lag along the body, metres (Infinity when there is no lag). */
  readonly wavelength: number;
  readonly heading: WaveHeading;
  /** Peak-to-peak lateral swing of the body's centre of mass (uniform mass per length), metres. */
  readonly recoil: number;
}

/** The swimming body, or null when the skeleton is a radial plan or has no length. */
export function bodyChain(sk: Armature): BodyChain | null {
  const bones = bodyPath(sk);
  const stations = [...bones.map((b) => b.head), bones.at(-1)?.tail ?? [0, 0, 0]];
  const arcs = [0];
  for (let i = 1; i < stations.length; i++) {
    const a = stations[i - 1] ?? [0, 0, 0];
    const b = stations[i] ?? [0, 0, 0];
    arcs.push((arcs[i - 1] ?? 0) + dmath.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }
  const length = arcs.at(-1) ?? 0;
  if (bones.length < 2 || length <= 0) return null;
  const on = new Set(bones.map((b) => b.name));
  const kids = childMap(sk);
  for (const b of bones)
    for (const c of kids.get(b.name) ?? [])
      if (!on.has(c.name) && boneLength(c) + reach(c, kids) >= SIDE_BRANCH_SHARE * length)
        return null;
  return { bones, s: arcs.map((a) => a / length), length };
}

const unit = (v: Vec3): Vec3 => {
  const l = dmath.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** World position of each body station in the clip at `time`. */
function stationsAt(sk: Armature, body: BodyChain, clip: Clip, time: number): Vec3[] {
  const w = jointWorlds(sk, clipPose(clip, time));
  const rest: JointWorld = { head: [0, 0, 0], rot: [0, 0, 0, 1] };
  const heads = body.bones.map((b) => (w.get(b.name) ?? rest).head);
  const last = body.bones.at(-1);
  return last ? [...heads, boneEnd(last, w.get(last.name) ?? rest)] : heads;
}

/** The axis across `d` along which the points of `plane` spread most. */
function beatAxis(d: Vec3, plane: readonly Vec3[]): Vec3 {
  const seed: Vec3 = Math.abs(d[2]) > 0.9 ? [0, 1, 0] : [0, 0, 1];
  const e1 = unit(cross(seed, d));
  const e2 = cross(d, e1);
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const p of plane) {
    const x = dot(p, e1);
    const y = dot(p, e2);
    xx += x * x;
    yy += y * y;
    xy += x * y;
  }
  const a = dmath.atan2(2 * xy, xx - yy) / 2;
  const [c, s] = [dmath.cos(a), dmath.sin(a)];
  return [c * e1[0] + s * e2[0], c * e1[1] + s * e2[1], c * e1[2] + s * e2[2]];
}

/** Complex amplitude of harmonic `m` of a periodic signal: [re, im], scaled to its half-swing. */
function harmonic(y: readonly number[], m: number): readonly [number, number] {
  let re = 0;
  let im = 0;
  y.forEach((v, k) => {
    const a = (-2 * Math.PI * m * k) / y.length;
    re += v * dmath.cos(a);
    im += v * dmath.sin(a);
  });
  return [(2 * re) / y.length, (2 * im) / y.length];
}

const swing = (y: readonly number[]): number => Math.max(...y) - Math.min(...y);

/** The strongest harmonic of `y` (1 = once per clip), its mean taken out. */
function strongest(y: readonly number[]): number {
  const mean = y.reduce((a, v) => a + v, 0) / y.length;
  const powers = harmonicPowers(y.map((v) => v - mean));
  let best = 1;
  let power = -1;
  for (let m = 1; m < powers.length; m++) {
    const p = powers[m] ?? 0;
    if (p > power + 1e-12) [best, power] = [m, p];
  }
  return best;
}

/** Wavelength and heading from the phase of harmonic `m` along the stations that really move. */
function phaseWave(
  body: BodyChain,
  y: readonly (readonly number[])[],
  m: number,
): Pick<ClipWave, 'wavelength' | 'heading'> {
  // Link slopes, not station offsets: recoil shifts every station alike and cancels here.
  const c = y.map((v) => harmonic(v, m));
  const slopes = c.slice(1).map(([re, im], i) => {
    const [r0, i0] = c[i] ?? [0, 0];
    const ds = (body.s[i + 1] ?? 0) - (body.s[i] ?? 0) || 1;
    return {
      re: (re - r0) / ds,
      im: (im - i0) / ds,
      s: ((body.s[i + 1] ?? 0) + (body.s[i] ?? 0)) / 2,
    };
  });
  const size = slopes.map((d) => dmath.hypot(d.re, d.im));
  const floor = PHASE_SHARE * Math.max(...size);
  // A wave crest heading tailward: phase falls with s. Unwrapped link to link.
  const pts: { s: number; phase: number; w: number }[] = [];
  slopes.forEach((d, i) => {
    const amp = size[i] ?? 0;
    if (amp < floor || amp === 0) return;
    let phase = dmath.atan2(d.im, d.re);
    const before = pts.at(-1);
    if (before) phase += 2 * Math.PI * Math.round((before.phase - phase) / (2 * Math.PI));
    pts.push({ s: d.s * body.length, phase, w: amp * amp });
  });
  if (pts.length < 2) return { wavelength: Infinity, heading: 'standing' };
  const W = pts.reduce((t, p) => t + p.w, 0);
  const ms = pts.reduce((t, p) => t + p.w * p.s, 0) / W;
  const mp = pts.reduce((t, p) => t + p.w * p.phase, 0) / W;
  const den = pts.reduce((t, p) => t + p.w * dmath.pow(p.s - ms, 2), 0);
  const slope = den > 0 ? pts.reduce((t, p) => t + p.w * (p.s - ms) * (p.phase - mp), 0) / den : 0;
  const waves = (Math.abs(slope) * body.length) / (2 * Math.PI);
  const wavelength = slope === 0 ? Infinity : (2 * Math.PI) / Math.abs(slope);
  if (waves < STANDING_WAVES) return { wavelength, heading: 'standing' };
  const steady = pts.every((p, i) => {
    const q = pts[i - 1];
    return !q || p.phase - q.phase <= PHASE_SLACK;
  });
  return { wavelength, heading: slope < 0 && steady ? 'tailward' : 'headward' };
}

/** Frames to read: 30 fps, or every key of the body when it is keyed denser, so a beat above 15 Hz
 *  (a small fish's burst) is not aliased. */
function sampleCount(body: BodyChain, clip: Clip): number {
  const on = new Set(body.bones.map((b) => b.name));
  const keys = clip.tracks.map((t) => ('bone' in t && on.has(t.bone) ? t.times.length - 1 : 0));
  return Math.max(8, Math.round(clip.seconds * SWIM_FPS), ...keys);
}

/** Measures one clip, or null when its root does not travel. */
export function measureWave(sk: Armature, body: BodyChain, clip: Clip): ClipWave | null {
  const start = stationsAt(sk, body, clip, 0)[0] ?? [0, 0, 0];
  const end = stationsAt(sk, body, clip, clip.seconds)[0] ?? [0, 0, 0];
  const D: Vec3 = [end[0] - start[0], end[1] - start[1], end[2] - start[2]];
  const travel = dmath.hypot(D[0], D[1], D[2]);
  if (!(travel > 1e-6)) return null;
  const d = unit(D);
  const frames = sampleCount(body, clip);
  // Positions with the travel taken out, frame by frame, station by station.
  const track: Vec3[][] = [];
  for (let k = 0; k < frames; k++) {
    const u = k / frames;
    track.push(
      stationsAt(sk, body, clip, u * clip.seconds).map((p) => {
        const q: Vec3 = [p[0] - D[0] * u, p[1] - D[1] * u, p[2] - D[2] * u];
        const along = dot(q, d);
        return [q[0] - d[0] * along, q[1] - d[1] * along, q[2] - d[2] * along];
      }),
    );
  }
  const tip = body.s.length - 1;
  const tipPath = track.map((f) => f[tip] ?? [0, 0, 0]);
  const sum = tipPath.reduce<Vec3>((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]);
  const axis = beatAxis(
    d,
    tipPath.map((p) => [p[0] - sum[0] / frames, p[1] - sum[1] / frames, p[2] - sum[2] / frames]),
  );
  const y = body.s.map((_, i) => track.map((f) => dot(f[i] ?? [0, 0, 0], axis)));
  const excursion = y.map(swing);
  const tail = y[tip] ?? [];
  const beating = (excursion[tip] ?? 0) > STILL_TAIL * body.length;
  const m = beating ? strongest(tail) : 0;
  // Uniform mass per length: each station carries half of the two links beside it.
  const weights = body.s.map((s, i) => ((body.s[i + 1] ?? s) - (body.s[i - 1] ?? s)) / 2);
  const com = track.map((_, k) => y.reduce((t, v, i) => t + (weights[i] ?? 0) * (v[k] ?? 0), 0));
  return {
    clip: clip.name,
    speed: travel / clip.seconds,
    frequency: m / clip.seconds,
    excursion,
    recoil: swing(com),
    ...(beating
      ? phaseWave(body, y, m)
      : { wavelength: Infinity, heading: 'standing' as WaveHeading }),
  };
}
