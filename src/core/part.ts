// The part vocabulary: LOD, motion, emitters, sockets, surfaces and the Part record itself —
// what a recipe can say about one named node.

import type { Mesh } from './mesh.ts';
import type { Vec3 } from './vec.ts';

/** 0 = hero detail, 1 = mid, 2 = far. A recipe reads it and drops detail; it never decimates. */
export type Lod = 0 | 1 | 2;

export interface Spin {
  readonly kind: 'spin';
  /** Rotation axis in the part's local space. */
  readonly axis: Vec3;
  /** Revolutions per second of the baked loop. */
  readonly rps: number;
}

export interface Slide {
  readonly kind: 'slide';
  /** Peak offset of a sinusoidal back-and-forth (piston rods, sliders). */
  readonly offset: Vec3;
  readonly hz: number;
}

export interface Sway {
  readonly kind: 'sway';
  /** Rotation axis in the part's local space. */
  readonly axis: Vec3;
  /** Peak angle either side of rest: turret scan, gun elevation, wind in a crown, a door ajar. */
  readonly degrees: number;
  readonly hz: number;
}

export type Motion = Spin | Slide | Sway;

/**
 * A particle source the engine spawns at runtime: exhaust smoke, loco steam, track dust, muzzle
 * flash, chimney smoke, fire. Exported as an empty named node carrying `extras.ts23d.emitter`,
 * so it moves with its parent (a turret, a stack) and any engine can bind its own system to it.
 */
export interface Emitter {
  readonly kind: 'smoke' | 'steam' | 'dust' | 'muzzle' | 'fire' | 'sparks';
  /** Emission direction in the parent's space; default up (+Z). */
  readonly dir?: Vec3;
  /** Particles per second at full intensity. */
  readonly rate: number;
  /** Seconds a particle lives. */
  readonly life: number;
  /** Start and end size in metres. */
  readonly size: readonly [number, number];
  /** Linear sRGB start colour; engines fade to transparent. */
  readonly color?: Vec3;
  /** Initial speed m/s along `dir`, with cone spread in degrees. */
  readonly speed?: number;
  readonly spreadDeg?: number;
  /** 'always' (chimney), 'moving' (track dust), 'event' (muzzle — fired by game code). */
  readonly when?: 'always' | 'moving' | 'event';
}

/**
 * A named attachment point game code binds to: a seat, a weapon mount, a camera, a sound source,
 * a hardpoint, a spawn or interaction point. An empty node with `extras.ts23d.socket`.
 */
export interface Socket {
  readonly kind: 'seat' | 'mount' | 'camera' | 'audio' | 'attach' | 'spawn' | 'interact' | 'light';
  /** Facing direction in the parent's space; default +X (forward). */
  readonly dir?: Vec3;
  /** Free-form, engine-facing: `{ clip: 'engine_idle' }`, `{ caliber: 88 }`, `{ fov: 60 }`. */
  readonly data?: Readonly<Record<string, string | number | boolean>>;
}

export interface SocketOptions extends Socket {
  readonly at?: Vec3;
  readonly parent?: string;
}

export interface EmitterOptions extends Emitter {
  readonly at?: Vec3;
  readonly parent?: string;
}

/**
 * How a part's surface renders. Everything stays on ONE shared texture set; the GLB carries at
 * most four materials (one per surface in use), so batching still holds:
 *   opaque — the default trim-sheet material
 *   cutout — alpha-tested, double-sided: leaves, fences, grilles, ash
 *   glass — clear: transmission + IOR 1.5 + thin volume (windows, bottles, lamp lenses)
 *   translucent — tinted, partly see-through: plastic bottles, liquids, paper, smoke-stained glass
 * Tint comes from vertex colour, as everywhere else.
 */
export type Surface = 'opaque' | 'cutout' | 'glass' | 'translucent';

export interface PartOptions {
  /** Pivot in the parent's space; the mesh is authored relative to it. */
  readonly at?: Vec3;
  readonly parent?: string;
  /** Rotation about local Z, radians. A part that also moves goes inside a yawed group. */
  readonly yaw?: number;
  readonly motion?: Motion;
  /** Parts this moving part may legitimately pass through (an axle in its bearing). QA `clashes`. */
  readonly clearOf?: readonly string[];
  readonly surface?: Surface;
}

export interface UseOptions {
  /** Prefix for every instanced part: `house_3` → `house_3_roof`, `house_3_door_0`. */
  readonly prefix: string;
  readonly at?: Vec3;
  readonly yaw?: number;
  readonly parent?: string;
  /** Per-instance seed, so ten copies of one recipe are ten variants. */
  readonly seed?: number;
}

export interface Part {
  readonly name: string;
  readonly mesh: Mesh | null;
  readonly at: Vec3;
  readonly parent: string | null;
  readonly yaw: number;
  readonly motion: Motion | null;
  readonly clearOf?: readonly string[];
  readonly emitter?: Emitter;
  readonly socket?: Socket;
  readonly surface?: Surface;
}
