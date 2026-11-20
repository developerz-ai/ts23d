// The drivers of docs/research/swim-and-tentacle-animation.md section 0: pure functions from
// published motion parameters to chain fields (chain-field.ts). Every length is in chain lengths and
// s runs from the chain's root (a trunk's head, an arm's base) to its tip.

import { dmath, Ts23dError } from '../core/index.ts';
import type { ChainField, FieldFn } from './chain-field.ts';

export const TAU = Math.PI * 2;

const invalid = (cause: string, fix: string): never => {
  throw new Ts23dError('T3D_RECIPE_INVALID', { cause, fix });
};

function positive(what: string, v: number): void {
  if (!(Number.isFinite(v) && v > 0)) invalid(`${what} ${v} is not > 0`, `give a positive ${what}`);
}

const clamp01 = (u: number): number => Math.max(0, Math.min(1, u));

/** Minimum-jerk progress 0..1: the bell-shaped speed (peak 1.875 × mean, doc section 2). */
export const minJerk = (u: number): number => {
  const x = clamp01(u);
  return x * x * x * (10 + x * (6 * x - 15));
};

/** Minimum-jerk progress of t across a..b. */
export const ramp = (t: number, a: number, b: number): number => minJerk((t - a) / (b - a));

/** Lateral amplitude A(s) with its first two derivatives. */
export interface Envelope {
  at(s: number): number;
  d1(s: number): number;
  d2(s: number): number;
}

/** A(s) = gain · ½(head − 0.13 s + 0.28 s²): the all-fish fit of peak-to-peak amplitude, whose
 *  `head` term is 0.05 [DS21]. */
export const ds21Envelope = (gain = 1, head = 0.05): Envelope => ({
  at: (s) => gain * 0.5 * (head - 0.13 * s + 0.28 * s * s),
  d1: (s) => gain * 0.5 * (-0.13 + 0.56 * s),
  d2: () => gain * 0.28,
});

/** A(s) = tail · exp(α(s − 1)): eels, α from 3.90 slow to 2.25 fast [T04]. */
export const expEnvelope = (tail: number, alpha: number): Envelope => ({
  at: (s) => tail * dmath.exp(alpha * (s - 1)),
  d1: (s) => tail * alpha * dmath.exp(alpha * (s - 1)),
  d2: (s) => tail * alpha * alpha * dmath.exp(alpha * (s - 1)),
});

export interface WaveSpec {
  /** Cycles per second. */
  readonly f: number;
  /** Wavelength, chain lengths. */
  readonly lambda: number;
  readonly envelope: Envelope;
  /** Phase offset, cycles (0). */
  readonly phase?: number;
}

/** y = A(s) sin(2π(s/λ − f t)) as curvature: heading = atan(∂y/∂s), crests run root to tip. */
export function travellingWave(w: WaveSpec): ChainField {
  positive('frequency', w.f);
  positive('wavelength', w.lambda);
  const k = TAU / w.lambda;
  const { envelope: A } = w;
  const phi = (s: number, t: number): number => TAU * (s / w.lambda - w.f * t + (w.phase ?? 0));
  const slope = (s: number, t: number): number => {
    const p = phi(s, t);
    return A.d1(s) * dmath.sin(p) + A.at(s) * k * dmath.cos(p);
  };
  return {
    kn: (s, t) => {
      const p = phi(s, t);
      const y2 = (A.d2(s) - A.at(s) * k * k) * dmath.sin(p) + 2 * A.d1(s) * k * dmath.cos(p);
      const y1 = slope(s, t);
      return y2 / (1 + y1 * y1);
    },
    base: (t) => ({ bend: dmath.atan(slope(0, t)) }),
  };
}

export interface SerpenoidSpec {
  readonly f: number;
  /** Wavelength along the arc, chain lengths. */
  readonly lambda: number;
  /** Peak curvature, radians per chain length. */
  readonly alpha: number;
  readonly phase?: number;
}

const serpenoidAngles = (w: SerpenoidSpec) => {
  positive('frequency', w.f);
  positive('wavelength', w.lambda);
  const phase = (s: number, t: number): number => TAU * (s / w.lambda - w.f * t + (w.phase ?? 0));
  return {
    kn: ((s, t) => w.alpha * dmath.cos(phase(s, t))) as FieldFn,
    start: (t: number): number => ((w.alpha * w.lambda) / TAU) * dmath.sin(phase(0, t)),
  };
};

/** Curvature k(s,t) = α cos(2π(s/λ − f t)), the form [H09] prescribes for a snake. */
export function serpenoid(w: SerpenoidSpec): ChainField {
  const { kn, start } = serpenoidAngles(w);
  return { kn, base: (t) => ({ bend: start(t) }) };
}

/** Two curvature waves a quarter cycle apart, one per bending plane: sidewinding [A15]. */
export function orthogonalWaves(
  bend: SerpenoidSpec,
  pitch: Omit<SerpenoidSpec, 'f' | 'phase'>,
  /** Phase of the pitch wave against the bend wave, cycles (a quarter). */
  shift = 0.25,
): ChainField {
  const a = serpenoidAngles(bend);
  const b = serpenoidAngles({ ...pitch, f: bend.f, phase: (bend.phase ?? 0) + shift });
  return {
    kn: a.kn,
    kb: b.kn,
    base: (t) => ({ bend: a.start(t), pitch: b.start(t) }),
  };
}

export interface BendPulseSpec {
  /** Peak curvature of the bump, radians per chain length. */
  readonly peak: number;
  /** Standard deviation of the bump, chain lengths; keep ≥ 1.5 / links (doc section 2). */
  readonly width: number;
  /** Bump centre over time, 0 at the base to 1 at the tip. */
  readonly centre: (t: number) => number;
  /** Curl still ahead of the bump, unfurled as it passes. */
  readonly curl?: FieldFn;
  /** Elongation behind the bump: `peak` strain reached by `at`(t) = 1. */
  readonly strain?: { readonly peak: number; readonly at: (t: number) => number };
}

/** A curvature bump running base to tip with the arm lengthening behind it [G96, H15]. */
export function bendPulse(p: BendPulseSpec): ChainField {
  positive('pulse width', p.width);
  const strain = p.strain;
  if (strain && !(strain.peak >= -0.12 && strain.peak <= 1.8))
    invalid(
      `arm strain ${strain.peak} is outside -0.12..1.8`,
      'use a measured elongation: mean 0.57 at the end of a reach [H15]',
    );
  const ahead = (s: number, t: number): number => clamp01((s - p.centre(t)) / (2 * p.width) + 0.5);
  const curl = p.curl;
  const field: ChainField = {
    kn: (s, t) => {
      const u = (s - p.centre(t)) / p.width;
      return p.peak * dmath.exp(-0.5 * u * u) + (curl ? curl(s, t) * ahead(s, t) : 0);
    },
  };
  return strain ? { ...field, e: (s, t) => strain.peak * strain.at(t) * (1 - ahead(s, t)) } : field;
}

export interface FollowPathSpec {
  /** Heading of the leading end over time, radians about the bend axis. */
  readonly heading: (t: number) => number;
  /** Heading about the pitch axis, if the path leaves the plane. */
  readonly pitch?: (t: number) => number;
  /** Seconds the path takes to run the whole chain (L / U). */
  readonly delay: number;
  /** Which end leads: 'start' for a trunk's head, 'end' for a neck's head at the tip. */
  readonly lead: 'start' | 'end';
}

/** Central difference, for paths given only as functions of time. */
const rate = (g: (t: number) => number, t: number): number => {
  const h = 1e-3;
  return (g(t + h) - g(t - h)) / (2 * h);
};

/** heading(s, t) = H(t − d·L/U), d the arc distance from the leading end: the path is followed. */
export function followPath(p: FollowPathSpec): ChainField {
  positive('path delay', p.delay);
  const start = p.lead === 'start';
  const lag = (s: number): number => p.delay * (start ? s : 1 - s);
  const sign = start ? -1 : 1;
  const curve =
    (g: (t: number) => number): FieldFn =>
    (s, t) =>
      sign * p.delay * rate(g, t - lag(s));
  const pitch = p.pitch;
  return {
    kn: curve(p.heading),
    ...(pitch ? { kb: curve(pitch) } : {}),
    base: (t) => ({
      bend: p.heading(t - lag(0)),
      ...(pitch ? { pitch: pitch(t - lag(0)) } : {}),
    }),
  };
}

export interface Hinge {
  /** Centre of the hinge, arc position. */
  readonly s: number;
  /** Arc over which the turn is spread. */
  readonly width: number;
  /** Total turn over time, radians. */
  readonly angle: (t: number) => number;
}

const hingeField =
  (hinges: readonly Hinge[]): FieldFn =>
  (s, t) => {
    let sum = 0;
    for (const h of hinges) {
      const u = (s - h.s) / h.width + 0.5;
      if (u <= 0 || u >= 1) continue;
      // Raised cosine with unit integral: the turn lands whole on the joints inside it.
      sum += (h.angle(t) * 2 * dmath.pow(dmath.sin(Math.PI * u), 2)) / h.width;
    }
    return sum;
  };

/** Curvature collapsed into a few moving joints: the octopus fetch [S06]. */
export function hingeGroups(bend: readonly Hinge[], pitch: readonly Hinge[] = []): ChainField {
  for (const h of [...bend, ...pitch]) positive('hinge width', h.width);
  return {
    ...(bend.length ? { kn: hingeField(bend) } : {}),
    ...(pitch.length ? { kb: hingeField(pitch) } : {}),
  };
}
