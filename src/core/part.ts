// The part vocabulary: LOD, motion, emitters, sockets, surfaces and the Part record itself —
// what a recipe can say about one named node.

import type { Mesh } from './mesh.ts';
import type { PartPhysics } from './physics.ts';
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

export type Motion = Spin | Slide | Sway | Tread;

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

export interface ParticleEmitterOptions extends Emitter {
  readonly at?: Vec3;
  readonly parent?: string;
}

/**
 * A rendered sound (the /audio module makes them: `sound.impact`, `sound.engine`, …). Plain data
 * so it survives structured clone; `name` becomes `<name>.wav` beside the GLB.
 */
export interface SoundClip {
  readonly name: string;
  readonly sampleRate: number;
  readonly channels: 1 | 2;
  /** Interleaved samples in −1..1. */
  readonly samples: Float32Array;
  /** Rendered to loop seamlessly (last sample flows into the first). */
  readonly loop: boolean;
}

/**
 * A positional sound source (KHR_audio_emitter): an engine idle on its block, a bell on its yoke.
 * Exported as an empty named node that moves with its parent.
 */
export interface SoundEmitter {
  readonly kind: 'sound';
  readonly clip: SoundClip;
  /** Default: the clip's own `loop`. */
  readonly loop?: boolean;
  /** Linear gain, default 1. */
  readonly gain?: number;
  /** 'always' (autoplay: engine idle), 'moving', 'event' (default: game code plays it). */
  readonly when?: 'always' | 'moving' | 'event';
  /** Distance (m) at full volume (default 1) and beyond which it is silent (0 = none). */
  readonly refDistance?: number;
  readonly maxDistance?: number;
}

export interface SoundEmitterOptions extends SoundEmitter {
  readonly at?: Vec3;
  readonly parent?: string;
}

/** `ctx.emitter` options: a particle source, or `kind: 'sound'` for a positional sound. */
export type EmitterOptions = ParticleEmitterOptions | SoundEmitterOptions;

/** A moving part's sound: plays while its motion clip plays (a door creak on its sway). */
export interface PartSound {
  readonly onMotion: SoundClip;
  readonly gain?: number;
}

/**
 * How a part's surface renders. Everything stays on ONE shared texture set; the GLB carries at
 * most four materials (one per surface in use), so batching still holds:
 *   opaque — the default trim-sheet material
 *   cutout — alpha-tested, double-sided: leaves, fences, grilles, ash
 *   glass — clear: transmission + IOR 1.5 + thin volume (windows, bottles, lamp lenses)
 *   translucent — tinted, partly see-through: plastic bottles, paper, smoke-stained glass
 *   ice — IOR 1.31, frosted, blue absorption · liquid — water: IOR 1.33, clear, faint cyan depth
 *   jelly — soft, IOR 1.35, rough-ish transmission (gummies, slime, gel)
 * See-through surfaces take `defineAsset({ optics })` overrides (ior, thickness, attenuation).
 * Tint comes from vertex colour, as everywhere else.
 */
export type Surface = 'opaque' | 'cutout' | 'glass' | 'translucent' | 'ice' | 'liquid' | 'jelly';

/**
 * How a part is meant to join what holds it — QA `connections` judges each kind differently:
 *   grown  — grows out of its parent (horn, claw, tooth, ear, wing root): root buried, seam blended
 *   welded — fused over a face (default): a real contact patch, not a point or an edge
 *   bolted — fastened over a face (as welded; read by people and engines)
 *   rest   — sits on it (wheel on rail, ball on floor): a point or line contact is fine
 *   hinge  — pinned along an axis: a line contact is fine
 *   socket — seated in a hollow (eyeball in its orbit, ball joint): mostly enclosed by `to`
 *   free   — meant to be loose (debris, a dropped tool): skipped; `why` required
 * Defaults: `grown` for appendage names (horn, spine, spike, claw, tooth or teeth, tusk, fang,
 * ear, wing, tail, finger — as a name segment) and `socket` for eye / eyeball on `character` and
 * `creature` kinds; `rest` for running gear (wheel, track, roller, axle…) and cutout cards;
 * `welded` everywhere else.
 */
export type ConnectAs = 'grown' | 'welded' | 'bolted' | 'rest' | 'hinge' | 'socket' | 'free';

export interface Connect {
  readonly as: ConnectAs;
  /** Part it joins (name; `ctx.use` prefixes it). Default: the part it touches most. */
  readonly to?: string;
  /** Why — required for `free`. */
  readonly why?: string;
}

export interface PartOptions extends PartPhysics {
  /** Pivot in the parent's space; the mesh is authored relative to it. */
  readonly at?: Vec3;
  readonly parent?: string;
  /** Rotation about local Z, radians. A part that also moves goes inside a yawed group. */
  readonly yaw?: number;
  readonly motion?: Motion;
  /** Parts this moving part may legitimately pass through (an axle in its bearing). QA `clashes`. */
  readonly clearOf?: readonly string[];
  readonly surface?: Surface;
  /**
   * Paint slot this part's colour belongs to (`paint: 'body'`): a slot declared in
   * `defineAsset({ paint })` that `variants` can repaint. Opaque parts only.
   */
  readonly paint?: string;
  /**
   * A named `defineAsset({ finishes })` entry: sheen, anisotropy, iridescence, clearcoat,
   * specular (KHR_materials_*). Opaque, unpainted parts only; one material per finish.
   */
  readonly finish?: string;
  /** How this part joins its neighbour (QA `connections`); default from kind and name. */
  readonly connect?: Connect;
  /** Sound played with this part's `motion` (KHR_audio_emitter on its node). */
  readonly sound?: PartSound;
}

/**
 * How a joint is judged by QA `joints`:
 *   flush  — two segments meet end to end (forearm → wrist → hand, neck → head): the sections
 *            either side of the plane match in size and centre
 *   socket — `from` plugs into `to` (a peg in its hole, a blade in its scabbard): `from` fits
 *            inside `to`'s section and fills it to within tolerance
 *   grip   — `from` (a hand) closes around `to` (a handle): the handle's diameter matches the
 *            fist's opening
 */
export type JointKind = 'flush' | 'socket' | 'grip';

/**
 * A declared connection between two parts: where `from` meets `to`. `at` and `axis` are in the
 * asset's frame (the root's space); `axis` points from `from` towards `to` (for a grip: along the
 * handle). Part selectors are names or prefixes, as in `real.measures` ('hand' covers 'hand_palm').
 */
export interface Joint {
  readonly name: string;
  readonly from: string;
  readonly to: string;
  readonly at: Vec3;
  readonly axis: Vec3;
  /** Allowed relative size difference across the joint; default 0.2. */
  readonly tolerance?: number;
  /** Default 'flush'. */
  readonly kind?: JointKind;
}

export type JointOptions = Omit<Joint, 'name'>;

export interface UseOptions {
  /** Prefix for every instanced part: `house_3` → `house_3_roof`, `house_3_door_0`. */
  readonly prefix: string;
  readonly at?: Vec3;
  readonly yaw?: number;
  readonly parent?: string;
  /** Per-instance seed, so ten copies of one recipe are ten variants. */
  readonly seed?: number;
}

export interface Part extends PartPhysics {
  readonly name: string;
  readonly mesh: Mesh | null;
  readonly at: Vec3;
  readonly parent: string | null;
  readonly yaw: number;
  readonly motion: Motion | null;
  readonly clearOf?: readonly string[];
  readonly emitter?: Emitter;
  /** A `ctx.emitter(…, { kind: 'sound' })` node. */
  readonly audio?: SoundEmitter;
  readonly sound?: PartSound;
  readonly socket?: Socket;
  readonly surface?: Surface;
  readonly paint?: string;
  readonly finish?: string;
  readonly connect?: Connect;
}
