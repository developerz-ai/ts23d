// The motion vocabulary: how one named part moves in its baked `run` clip. Every vector is in the
// part's own frame, relative to its pivot (`at`). Turning senses are right-handed about `axis`, so
// a crank and the wheel it rides on agree when both name the same axis and rate.

import type { Vec3 } from './vec.ts';

export interface Spin {
  readonly kind: 'spin';
  /** Rotation axis in the part's local space. */
  readonly axis: Vec3;
  /** Revolutions per second of the baked loop. */
  readonly rps: number;
}

export interface Slide {
  readonly kind: 'slide';
  /** Peak offset of a sinusoidal back-and-forth (a gate, a sliding panel, a lift). */
  readonly offset: Vec3;
  readonly hz: number;
  /** Move only from rest to rest + offset and back (a sliding door), not to both sides. */
  readonly oneWay?: boolean;
}

export interface Sway {
  readonly kind: 'sway';
  /** Rotation axis in the part's local space. */
  readonly axis: Vec3;
  /** Peak angle either side of rest: turret scan, gun elevation, wind in a crown, a door ajar. */
  readonly degrees: number;
  readonly hz: number;
  /** Swing only from rest to +degrees and back (a signal arm dropping, a hatch opening). */
  readonly oneWay?: boolean;
}

/**
 * Parallel circular translation, no rotation: every point of the part runs round a circle of
 * radius |arm| in the plane normal to `axis`, the way a coupling (side) rod follows its crank pins.
 * The offset is rot(axis, 2π·hz·t)·arm − arm, so it is zero at rest.
 */
export interface Orbit {
  readonly kind: 'orbit';
  /** The crank axle direction; the arm turns right-handed about it (same sense as `Spin.rps`). */
  readonly axis: Vec3;
  /** Crank radius vector at rest: crank pin minus axle centre (its part along `axis` is ignored). */
  readonly arm: Vec3;
  /** Revolutions per second (sign = turning sense). */
  readonly hz: number;
}

/**
 * A slider-crank linkage, read from the rest pose: the part's pivot is the small end (wrist /
 * crosshead pin), which slides along `line`; the big end sits on the crank pin `pin`, which turns
 * about the axle through `centre`. Throw, phase and rod length all come from these points, so the
 * rod cannot disagree with the wheel or crankshaft it was modelled against.
 */
interface Linkage {
  /** Crank axle direction; the crank turns right-handed about it at `hz` (as `Spin.rps`). */
  readonly axis: Vec3;
  /** Any point on the crank axle, relative to the pivot (the small end at rest). */
  readonly centre: Vec3;
  /** The crank pin (big end) at rest, relative to the pivot: sets throw, phase and rod length. */
  readonly pin: Vec3;
  /** Direction the small end travels (cylinder bore, crosshead guides); normal to `axis`. */
  readonly line: Vec3;
  /** Crank revolutions per second (sign = turning sense). */
  readonly hz: number;
}

/** The connecting rod: rotates about `axis` and translates along `line` (exact slider-crank). */
export interface Crank extends Linkage {
  readonly kind: 'crank';
}

/**
 * The piston / crosshead on the same linkage: translates along `line` only, by the exact law
 * x = r·cosθ + √(L² − (e + r·sinθ)²) − x₀ (offset e allowed), never a sinusoid.
 */
export interface Piston extends Linkage {
  readonly kind: 'piston';
}

/**
 * A track belt that runs round its wheels: the mesh stays where it is in the baked clip (glTF
 * cannot move vertices along a curve), and `path` + `pitch` ride the node's `extras.ts23d.tread`
 * so an engine (or the gallery) slides the links along the loop at the vehicle's speed.
 */
export interface Tread {
  readonly kind: 'tread';
  /** Closed centre line of the belt in the part's local space (metres), either winding. */
  readonly path: readonly Vec3[];
  /** Metres of belt after which it looks the same again: the link pitch (× 2 for alternating links). */
  readonly pitch: number;
}

export type Motion = Spin | Slide | Sway | Orbit | Crank | Piston | Tread;
