// Procedural quadruped gaits baked to root-motion keys (ADR 013). Footfalls from Hildebrand phase
// tables (left hind = 0; docs/research/animal-anatomy.md §7), speed from the Froude number
// (v = √(Fr·g·h), h = hip height; Alexander & Jayes 1983) and stride from their dynamic-similarity
// fit λ = 2.3·Fr^0.3·h. Each stance foot is locked to one ground point while the root travels at
// v; the swing foot follows a cycloid (zero ground speed at lift-off and touch-down). The pelvis
// bobs (two bounces a stride in symmetrical gaits, one in the gallop), the spine pitches and flexes,
// the tail counter-sways a fraction of a stride late. This file is the timing and the body;
// gait-bake.ts solves the legs per key (gait-ik.ts) and writes the clip.

import type { Bone, Quat, Vec3 } from '../core/index.ts';
import type { LegBones } from './gait-ik.ts';
import { qexp } from './pose.ts';

export type Gait = 'walk' | 'trot' | 'canter' | 'gallop';
export type Foot = 'lh' | 'lf' | 'rh' | 'rf';
export const FEET: readonly Foot[] = ['lh', 'lf', 'rh', 'rf'];

export interface GaitSpec {
  /** Touch-down of each foot, fraction of the stride after the left hind's. */
  readonly phase: Readonly<Record<Foot, number>>;
  /** Fraction of the stride each foot is on the ground (> 0.5 walk, < 0.5 run). */
  readonly duty: number;
  readonly froude: number;
  /** Toe lift at mid-swing, fraction of hip height. */
  readonly lift: number;
  /** Pelvis bob amplitude and mean crouch, fractions of hip height. */
  readonly bob: number;
  readonly crouch: number;
  /** Spine pitch (rocking) and flexion amplitudes, tail counter-sway, degrees. */
  readonly pitch: number;
  readonly flex: number;
  readonly sway: number;
}

/**
 * Footfalls: walk LH → LF → RH → RF evenly spaced (lateral sequence); trot in diagonal pairs;
 * canter 3-beat (RH, then LH + RF, then the LF lead); rotary gallop LH → RH → RF → LF with a
 * gathered and an extended suspension. Duty factors and Froude numbers per HILD89 / AJ83
 * (walk Fr < 0.5, trot ≈ 1, asymmetric 2–3+); lifts, bobs and spine angles are [P] estimates.
 */
export const GAITS: Readonly<Record<Gait, GaitSpec>> = {
  walk: {
    phase: { lh: 0, lf: 0.25, rh: 0.5, rf: 0.75 },
    duty: 0.62,
    froude: 0.2,
    lift: 0.07,
    bob: 0.01,
    crouch: 0,
    pitch: 1,
    flex: 1,
    sway: 6,
  },
  trot: {
    phase: { lh: 0, rf: 0, rh: 0.5, lf: 0.5 },
    duty: 0.42,
    froude: 0.9,
    lift: 0.1,
    bob: 0.018,
    crouch: 0.03,
    pitch: 1.5,
    flex: 2,
    sway: 4,
  },
  canter: {
    phase: { rh: 0.7, lh: 0, rf: 0, lf: 0.3 },
    duty: 0.38,
    froude: 2.5,
    lift: 0.12,
    bob: 0.03,
    crouch: 0.05,
    pitch: 4,
    flex: 5,
    sway: 3,
  },
  gallop: {
    phase: { lh: 0, rh: 0.1, rf: 0.42, lf: 0.52 },
    duty: 0.28,
    froude: 3.5,
    lift: 0.14,
    bob: 0.035,
    crouch: 0.06,
    pitch: 8,
    flex: 9,
    sway: 2,
  },
};

const G = 9.81;
const TAU = Math.PI * 2;

export interface GaitTiming {
  /** Root ground speed, m/s. */
  readonly speed: number;
  /** One stride (a full cycle of every foot), metres. */
  readonly stride: number;
  readonly seconds: number;
}

/** Speed, stride and cycle length at the gait's Froude number for a hip height `hip` (m). */
export function gaitTiming(g: GaitSpec, hip: number): GaitTiming {
  const speed = Math.sqrt(g.froude * G * hip);
  const stride = 2.3 * g.froude ** 0.3 * hip;
  return { speed, stride, seconds: stride / speed };
}

/** The bones a gait drives (full prefixed names; legs root → paw). */
export interface QuadrupedRig {
  readonly bones: readonly Bone[];
  readonly legs: Readonly<Record<Foot, LegBones>>;
  /** Spine root first (the root bone: it carries the root motion). */
  readonly spine: readonly string[];
  readonly neck: readonly string[];
  readonly tail: readonly string[];
  /** Scapula bone over each fore leg, when the rig has them (else the shoulder glides). */
  readonly scapula?: Readonly<Partial<Record<Foot, string>>>;
}

const frac = (x: number): number => x - Math.floor(x);
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const deg = Math.PI / 180;
/** Paw roll at lift-off (heel-off: the MCP rises about the planted toes), radians. */
export const HEEL_OFF = 22 * deg;

/** Stance progress s (0 touch-down … 1 lift-off): toe offset from rest along travel, paw roll. */
export function stanceTip(g: GaitSpec, t: GaitTiming, s: number): { dx: number; roll: number } {
  // Planted where the root is at mid-stance: still in the world while the root moves on.
  return { dx: -t.speed * (s - 0.5) * g.duty * t.seconds, roll: HEEL_OFF * smooth(0.6, 1, s) };
}

/** Where a foot is at stride phase φ: stance or swing and its progress s through it (0..1); `dx`
 *  = the toe's offset from rest along travel (the swing toe on its ground-frame cycloid). */
export function footAt(
  g: GaitSpec,
  t: GaitTiming,
  foot: Foot,
  phi: number,
): { stance: boolean; s: number; dx: number } {
  const u = frac(phi - g.phase[foot]);
  if (u < g.duty) {
    const s = u / g.duty;
    return { stance: true, s, dx: stanceTip(g, t, s).dx };
  }
  const s = (u - g.duty) / (1 - g.duty);
  return {
    stance: false,
    s,
    dx: swingAlong(g, t, s, stanceTip(g, t, 1).dx, stanceTip(g, t, 0).dx),
  };
}

/** Share of the swing cycloid run in the ground frame (1: the toe leaves and lands with zero
 *  ground speed but overshoots ahead of the body; 0: a cycloid against the body) [P]. */
const GROUND_LOCK = 0.3;

/** Swing progress s: offset along travel from `from` (lift-off) to `to` (touch-down, both against
 *  the root) on a cycloid, half in the ground frame (the root moves on at speed meanwhile). */
export function swingAlong(
  g: GaitSpec,
  t: GaitTiming,
  s: number,
  from: number,
  to: number,
): number {
  const away = t.speed * (1 - g.duty) * t.seconds * GROUND_LOCK;
  const c = s - Math.sin(TAU * s) / TAU;
  return from + (to + away - from) * c - away * s;
}

/** Body motion at phase φ: root offset (no travel) and per-bone local rotations. */
export function bodyPose(
  g: GaitSpec,
  rig: QuadrupedRig,
  phi: number,
  hip: number,
): {
  root: Vec3;
  rot: Map<string, Quat>;
} {
  const bounces = g.duty >= 0.5 || g.phase.lh === g.phase.rf ? 2 : 1;
  const z = -g.crouch * hip - g.bob * hip * Math.cos(TAU * bounces * (phi - g.duty / 2));
  const rot = new Map<string, Quat>();
  // Rocking: nose down at the fore pair's mid-stance; the spine gathers (flexes) a quarter stride
  // later, after the fore feet leave. Symmetrical gaits, whose fore feet alternate, do not rock.
  const sx = Math.cos(TAU * g.phase.lf) + Math.cos(TAU * g.phase.rf);
  const sy = Math.sin(TAU * g.phase.lf) + Math.sin(TAU * g.phase.rf);
  const rock = Math.hypot(sx, sy) > 0.2;
  const mid = Math.atan2(sy, sx) / TAU + g.duty / 2;
  const pitch = rock ? g.pitch * deg * Math.cos(TAU * (phi - mid)) : 0;
  const flex = g.flex * deg * (rock ? Math.cos(TAU * (phi - mid - 0.25)) : Math.cos(TAU * 2 * phi));
  rig.spine.forEach((name, i) => {
    rot.set(name, qexp([0, i === 0 ? pitch : flex / Math.max(1, rig.spine.length - 1), 0]));
  });
  // The neck holds the head steady against the spine's rock.
  const neck = rig.neck[0];
  if (neck) rot.set(neck, qexp([0, -(pitch + flex) * 0.8, 0]));
  const tail = rig.tail[0];
  if (tail) rot.set(tail, qexp([0, 0, -g.sway * deg * Math.sin(TAU * (phi - 0.15))]));
  return { root: [0, 0, z], rot };
}
