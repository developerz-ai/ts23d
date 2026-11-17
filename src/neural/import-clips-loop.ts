// A cycle that arrives one frame short of its period, closed at import. Animation libraries bake a
// loop of N frames as keys 0 … N−1: the pose after the last key is key 0 again, one frame later,
// and that key is not in the file. Played as it is the clip either pops (an engine wraps from the
// last key straight to the first, with no time between them) or is read as a one-shot (first and
// last poses differ). `closeCycle` recognises it and appends key 0 one frame after the last key:
//   - every moving track is keyed from 0 to the clip's end, the keys one frame step apart (a
//     track that only holds a pose has no frames to count; it is extended with the rest);
//   - the last pose is not the first (else it already closes);
//   - velocity continuity: the jump from the last key back to the first is no longer than
//     GAP_RATIO × the smaller frame-to-frame motion next to the seam, and points the way that motion goes.
// A one-shot (a jump, a death) ends far from its start, or eases to a stop: neither passes.

import type { Clip, Track } from '../core/index.ts';

/** Largest seam jump, as a multiple of the smaller neighbouring frame step (a missing frame is
 *  about one step; measured on a hosted walk and run: 1.6 and 0.7). */
export const GAP_RATIO = 3;
/** A frame rate within this share of a whole number is that number (30 fps keyed in float32). */
const FPS_SNAP = 1e-3;
/** First and last key closer than this (quaternion components, metres) already close. */
const CLOSED = 1e-3;

export interface ClosedCycle {
  readonly clip: Clip;
  /** Seconds added (one frame step). */
  readonly step: number;
  /** Whole frames per second when the keys sit on one, else 1 / step. */
  readonly fps: number;
}

const strideOf = (t: Track): number => t.values.length / t.times.length;

/** Key `i` of a track; a rotation is taken on key 0's side of the double cover. */
function keyOf(t: Track, i: number): number[] {
  const s = strideOf(t);
  let dot = 0;
  for (let k = 0; k < s; k++) dot += (t.values[k] ?? 0) * (t.values[i * s + k] ?? 0);
  const sign = t.path === 'rotation' && dot < 0 ? -1 : 1;
  return Array.from({ length: s }, (_, k) => sign * (t.values[i * s + k] ?? 0));
}

/** True when every key of the track is its first: it holds a pose and has no frames to count. */
const held = (t: Track): boolean => {
  const s = strideOf(t);
  return t.values.every((v, i) => Math.abs(v - (t.values[i % s] ?? 0)) < CLOSED);
};

/** The frame step the keys sit on, or null when the moving tracks do not share one from 0 to
 *  the clip's end. */
function frameStep(c: Clip): { step: number; fps: number } | null {
  const moving = c.tracks.filter((t) => !held(t));
  const n = Math.max(0, ...moving.map((t) => t.times.length));
  const end = Math.max(0, ...moving.map((t) => t.times[t.times.length - 1] ?? 0));
  const raw = end / (n - 1);
  if (n < 3 || !(raw > 0) || Math.abs(c.seconds - end) > raw / 2) return null;
  for (const t of moving) {
    const m = t.times.length;
    if (m < 3 || (t.times[0] ?? 0) > raw / 4 || Math.abs((t.times[m - 1] ?? 0) - end) > raw / 4)
      return null;
    // The keys next to the seam are one frame apart (a sparse or eased track tells us nothing).
    for (const [a, b] of [
      [0, 1],
      [m - 2, m - 1],
    ] as const)
      if (Math.abs((t.times[b] ?? 0) - (t.times[a] ?? 0) - raw) > raw / 4) return null;
  }
  const whole = Math.round(1 / raw);
  const snapped = whole > 0 && Math.abs(1 / raw - whole) < FPS_SNAP * whole;
  return snapped ? { step: 1 / whole, fps: whole } : { step: raw, fps: 1 / raw };
}

/**
 * The clip with its closing key appended (key 0, one frame after the last key; `loop: true`), or
 * null when it is not a cycle one frame short of its period.
 */
export function closeCycle(c: Clip): ClosedCycle | null {
  const frame = frameStep(c);
  if (!frame) return null;
  let [wrap, before, after, along] = [0, 0, 0, 0];
  for (const t of c.tracks) {
    const n = t.times.length;
    if (n < 2) continue;
    const [prev, last, first, next] = [n - 2, n - 1, 0, 1].map((i) => keyOf(t, i));
    first?.forEach((x, k) => {
      const seam = x - (last?.[k] ?? 0);
      const b = (last?.[k] ?? 0) - (prev?.[k] ?? 0);
      const a = (next?.[k] ?? 0) - x;
      wrap += seam * seam;
      before += b * b;
      after += a * a;
      along += seam * (a + b);
    });
  }
  const jump = Math.sqrt(wrap);
  if (jump < CLOSED) return null;
  if (jump > GAP_RATIO * Math.sqrt(Math.min(before, after)) || along <= 0) return null;
  const seconds = c.seconds + frame.step;
  const tracks = c.tracks.map((t): Track => {
    const s = strideOf(t);
    const times = new Float32Array(t.times.length + 1);
    times.set(t.times);
    times[t.times.length] = seconds;
    const values = new Float32Array(t.values.length + s);
    values.set(t.values);
    // Key 0 again, on the last key's side of the double cover (a lerp takes the short way).
    const flip = keyOf(t, t.times.length - 1).some(
      (x, k) => x !== (t.values[(t.times.length - 1) * s + k] ?? 0),
    );
    values.set(
      flip ? t.values.subarray(0, s).map((x) => -x) : t.values.subarray(0, s),
      t.values.length,
    );
    return { ...t, times, values };
  });
  return { clip: { ...c, seconds, loop: true, tracks }, ...frame };
}
