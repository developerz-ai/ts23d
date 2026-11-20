// Weathering demo: four everyday objects, each as a pristine / weathered pair on a labelled slab —
// a painted steel door in its frame (rust streaks under the hinge bolts and along the bottom rail,
// chipped edges, polish on the handle, dents), a wooden crate (sun-bleached, sagging lid boards,
// moss low on the shaded side), a precast concrete block (rust bleeding from its lifting anchors,
// moss, mud splash) and a 55-gallon steel drum (rusty chimes and hoops, a deep dent, dusty lid).
// Same paint both sides: only `weather(ctx, …)` differs, and its measured coverage lands in the
// manifest and QA `weather`; the weathered copies also change shape (door hanging open, a sprung
// crate board and an askew lid board, a dented, leaning drum). Tessellation is set per object and
// per LOD so flat faces stay cheap, and LOD2 keeps a coarse weathered grid, or (door, block) clean
// painted colour blocks, so the new / weathered difference survives at distance.
// Numbers: ./README.md.

import {
  type BuildContext,
  box,
  cylinder,
  defineAsset,
  dmath,
  hex,
  lathe,
  type Mesh,
  merge,
  place,
  planar,
  stripRect,
  text,
  type Vec3,
  type WeatherEffects,
  weather,
  weightedNormals,
} from '@developerz.ai/ts23d';
import { tessellate } from '../_lib/finish/finish.ts';
import { projectStripUV } from '../_lib/terrain/strip-inset.ts';
import { ENAMEL } from './enamel.ts';

const SLAB_H = 0.12;
const SLAB = hex('#8e8a83');
const INK = hex('#1d1d1d');
const DOOR_PAINT = hex('#4d6150');
const STEEL = hex('#6f6f6c');
const WOOD = hex('#9a6c40');
const CORE = hex('#3a2a1a');
const CONCRETE = hex('#a29e95');
const TIE = hex('#3b3935');
const DRUM_PAINT = hex('#2f4d7a');
const RUST_FAR = hex('#7a3f1f');
const RUST_DARK = hex('#4a2a18');
const DAMP = hex('#5a5a3a');

type Triple = readonly [number, number, number];

interface Obj {
  readonly meshes: Readonly<Record<string, Mesh>>;
  /** Hidden structure kept out of the weathering (never seen, so never tessellated). */
  readonly plain?: Readonly<Record<string, Mesh>>;
  readonly fasteners: readonly { at: Vec3; radius: number }[];
  readonly touched?: readonly string[];
  readonly under: Vec3;
  readonly effects: WeatherEffects;
  readonly seed: number;
  /** Longest edge after tessellation per LOD (m): fine where streaks run, coarse on flat faces. */
  readonly resolution: Triple;
  /** What the years did to the shape, applied to the weathered copy after its paint: a door
   *  dropped open on a worn hinge, a dented drum settled onto its crushed chime. */
  readonly settle?: (m: Readonly<Record<string, Mesh>>) => Record<string, Mesh>;
  /** LOD2 weathered copy painted as clean colour blocks (no per-vertex weathering on a coarse
   *  grid, which reads as hard triangles at distance). */
  readonly far?: Readonly<Record<string, Mesh>>;
  /** A second, coarser weathering pass for surrounding structure (the door frame). */
  readonly rest?: {
    readonly meshes: Readonly<Record<string, Mesh>>;
    readonly resolution: Triple;
    readonly effects: WeatherEffects;
  };
}

/** Hinge heights on the door leaf (m, bottom of each hinge plate). */
const HINGE_Z = [0.25, 1.0, 1.75] as const;

/**
 * The far door's rust blocks, `decal(y, z, w, h, colour)` each: a dark strip on the bottom rail
 * (0–7 cm), the rust band over it (7–22 cm), and a run under each hinge down from it to 42 cm
 * below or to the band, whichever is higher. They never overlap and never leave the leaf.
 */
export function farRust<T>(decal: (y: number, z: number, w: number, h: number, c: Vec3) => T): T[] {
  const [dark, band] = [0.07, 0.22];
  const runs = HINGE_Z.flatMap((z) => {
    const z0 = Math.max(band, z - 0.42);
    return z - z0 > 0.005 ? [decal(-0.39, z0, 0.07, z - z0, RUST_FAR)] : [];
  });
  return [decal(0, 0, 0.91, dark, RUST_DARK), decal(0, dark, 0.91, band - dark, RUST_FAR), ...runs];
}

/** Steel door 0.91 × 2.03 m (36 × 80 in) in a 0.1 m frame, three hinges with two bolts each. */
function door(lod: number, aged: boolean): Obj {
  const leaf = box({ size: [0.045, 0.91, 2.03], at: [0, 0, 0], color: DOOR_PAINT, strip: 'iron' });
  const jamb = (y: number): Mesh =>
    box({ size: [0.12, 0.08, 2.11], at: [0, y, 0], color: STEEL, strip: 'iron' });
  const frame = merge([
    jamb(-0.495),
    jamb(0.495),
    box({ size: [0.12, 1.07, 0.08], at: [0, 0, 2.03], color: STEEL, strip: 'iron' }),
  ]);
  const fasteners: { at: Vec3; radius: number }[] = [];
  const hinges: Mesh[] = [];
  for (const z of HINGE_Z) {
    hinges.push(
      box({ size: [0.006, 0.09, 0.12], at: [0.0255, -0.41, z], color: STEEL, strip: 'iron' }),
    );
    for (const dz of [0.025, 0.095]) {
      const at: Vec3 = [0.0315, -0.41, z + dz];
      if (lod < 2)
        hinges.push(
          cylinder({ radius: 0.009, length: 0.006, segments: 8, color: STEEL, at, axis: 'x' }),
        );
      fasteners.push({ at, radius: 0.012 });
    }
  }
  const handle = merge([
    box({ size: [0.02, 0.06, 0.16], at: [0.0325, 0.36, 0.95], color: STEEL, strip: 'iron' }),
    box({ size: [0.05, 0.14, 0.022], at: [0.065, 0.33, 1.02], color: STEEL, strip: 'iron' }),
    box({ size: [0.03, 0.022, 0.022], at: [0.0475, 0.39, 1.02], color: STEEL, strip: 'iron' }),
  ]);
  // The seized latch never shuts: the leaf hangs 24° open on its hinge line (front face, hinge
  // edge), as a disused yard door stands.
  const pivot: Vec3 = [0.0225, -0.455, 0];
  const swing = (m: Mesh): Mesh =>
    place(place(m, { at: [-pivot[0], -pivot[1], 0] }), { yaw: -0.42, at: pivot });
  // Far: the same story as flat blocks: a rust band along the bottom rail and a run under each
  // hinge, 1 mm proud of the front face. The blocks tile the face without overlapping (one plane,
  // so an overlap would z-fight): the dark rail strip, the band above it, each run from the band
  // (or 42 cm under its hinge, if higher) up to the hinge.
  const decal = (y: number, z: number, w: number, h: number, color: Vec3): Mesh =>
    box({
      size: [0.001, w, h],
      at: [0.0228, y, z],
      color,
      strip: 'iron',
      omit: ['back', 'left', 'right', 'top', 'bottom'],
    });
  const farLeaf = merge([leaf, ...farRust(decal)]);
  return {
    meshes: { leaf, hinges: merge(hinges), handle },
    ...(aged
      ? {
          settle: (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, swing(v)])),
          far: { leaf: farLeaf, hinges: merge(hinges), handle },
        }
      : {}),
    fasteners,
    touched: ['handle'],
    under: hex('#8d8c88'),
    seed: 11,
    // The leaf carries the streaks, so it is tessellated finer than the frame.
    resolution: [0.1, 0.25, 0.5],
    rest: {
      meshes: { frame },
      resolution: [0.3, 0.5, 0.9],
      effects: {
        bleach: { where: 'side-facing | up-facing', amount: 0.4, strength: 0.45 },
        chips: { where: 'convex-edges', amount: 0.35 },
        rust: { where: 'ground-near', amount: 0.3, streaks: false },
        dust: { where: 'up-facing', amount: 0.6 },
      },
    },
    effects: {
      bleach: { where: 'side-facing | up-facing', amount: 0.45, strength: 0.45 },
      chips: { where: 'convex-edges', amount: 0.35 },
      scratches: { where: 'touched', amount: 0.5 },
      // Rust starts at the hinge bolts and runs down; the bottom rail rusts from standing water.
      rust: {
        where: 'below-fasteners | fasteners | ground-near',
        amount: 0.4,
        streaks: true,
        streakLength: 0.9,
        strength: 0.9,
      },
      mud: { where: 'ground-near & side-facing', amount: 0.45 },
      dust: { where: 'up-facing', amount: 0.6 },
      dents: { where: 'exposed-panels', count: [2, 4], depth: 0.015, radius: 0.12 },
    },
  };
}

/** Shipping crate 0.8 × 0.8 × 0.62 m: corner posts, three boards a side, four on the lid. */
function crate(lod: number, aged: boolean): Obj {
  const parts: Mesh[] = [];
  for (const [x, y] of [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ] as const) {
    parts.push(
      box({ size: [0.06, 0.06, 0.6], at: [x * 0.37, y * 0.37, 0], color: WOOD, strip: 'wood' }),
    );
    // Folded steel corner irons over the post, top and bottom (LOD0/1).
    if (lod < 2)
      for (const z of [0.02, 0.5])
        parts.push(
          box({
            size: [0.072, 0.072, 0.08],
            at: [x * 0.37 + x * 0.001, y * 0.37 + y * 0.001, z],
            color: STEEL,
            strip: 'iron',
          }),
        );
  }
  // Weathered: the top board of the +X face has sprung its nails at one end and swings 8° out
  // from the post it still hangs on; one lid board has lifted and lies askew across its
  // neighbours, showing the dark inside.
  const sprung = (m: Mesh): Mesh =>
    aged ? place(place(m, { at: [-0.39, -0.34, 0] }), { yaw: 0.14, at: [0.39, 0.34, 0] }) : m;
  for (let i = 0; i < 3; i++) {
    const z = 0.01 + i * 0.2;
    const side = box({ size: [0.02, 0.68, 0.18], at: [0.39, 0, z], color: WOOD, strip: 'wood' });
    parts.push(i === 2 ? sprung(side) : side);
    parts.push(box({ size: [0.02, 0.68, 0.18], at: [-0.39, 0, z], color: WOOD, strip: 'wood' }));
    parts.push(box({ size: [0.68, 0.02, 0.18], at: [0, 0.39, z], color: WOOD, strip: 'wood' }));
    parts.push(box({ size: [0.68, 0.02, 0.18], at: [0, -0.39, z], color: WOOD, strip: 'wood' }));
    // Two nail heads at each board end, into the posts (LOD0 only).
    if (lod === 0)
      for (const s of [-1, 1])
        for (const dz of [0.05, 0.13]) {
          const nail = (at: Vec3, axis: 'x' | 'y'): Mesh =>
            cylinder({ radius: 0.006, length: 0.003, segments: 6, color: STEEL, at, axis });
          const n = nail([0.4, s * 0.31, z + dz], 'x');
          // The sprung board's nails: still in at the hinge end, pulled out with it at the other.
          if (!(aged && i === 2 && s < 0)) parts.push(i === 2 ? sprung(n) : n);
          parts.push(nail([-0.4 - 0.003, s * 0.31, z + dz], 'x'));
          parts.push(nail([s * 0.31, 0.4, z + dz], 'y'));
          parts.push(nail([s * 0.31, -0.4 - 0.003, z + dz], 'y'));
        }
  }
  for (let i = 0; i < 4; i++) {
    const board = box({
      size: [0.8, 0.18, 0.022],
      at: [0, -0.3 + i * 0.2, 0.6],
      color: WOOD,
      strip: 'wood',
    });
    parts.push(
      aged && i === 1
        ? place(place(board, { at: [0, 0.1, 0] }), { yaw: 0.16, at: [0.05, -0.1, 0.022] })
        : board,
    );
  }
  // Inner core rises 2 mm past the post tops (0.6) so every lid board rests on it. It is hidden by
  // the boards, so it stays out of the weathering (no tessellation spent where nobody looks).
  const core = box({ size: [0.72, 0.72, 0.592], at: [0, 0, 0.01], color: CORE, strip: 'wood' });
  return {
    meshes: { crate: merge(parts) },
    plain: { core },
    fasteners: [],
    under: hex('#c9a273'),
    seed: 23,
    resolution: [0.15, 0.35, 0.85],
    effects: {
      bleach: {
        where: 'up-facing | side-facing',
        amount: 0.7,
        strength: 0.85,
        color: [0.42, 0.4, 0.36],
      },
      chips: { where: 'convex-edges', amount: 0.3 },
      moss: { where: 'shaded & wet & !down-facing', amount: 0.35 },
      mud: { where: 'ground-near & side-facing', amount: 0.45 },
      dust: { where: 'up-facing', amount: 0.4 },
      sag: { where: 'long-spans', max: 0.022 },
      warp: { where: 'long-spans', max: 0.01 },
    },
  };
}

/** Precast concrete block 0.8 × 0.6 × 0.6 m with two cast-in lifting anchors on its face. */
function block(lod: number, aged: boolean): Obj {
  const body = box({ size: [0.6, 0.8, 0.6], color: CONCRETE, strip: 'concrete', bevel: 0.015 });
  const anchors: Mesh[] = [];
  const fasteners: { at: Vec3; radius: number }[] = [];
  for (const y of [-0.22, 0.22]) {
    anchors.push(
      box({ size: [0.01, 0.07, 0.05], at: [0.305, y, 0.48], color: STEEL, strip: 'iron' }),
    );
    fasteners.push({ at: [0.31, y, 0.49], radius: 0.035 });
  }
  // Form-tie holes: a grid of plugged tie holes left by the shuttering on both long faces.
  if (lod < 2)
    for (const side of [-1, 1])
      for (const x of [-0.15, 0.15])
        for (const z of [0.15, 0.45])
          anchors.push(
            cylinder({
              radius: 0.014,
              length: 0.003,
              segments: 6,
              color: TIE,
              at: [x, side * 0.4 + (side < 0 ? -0.003 : 0), z],
              axis: 'y',
            }),
          );
  // Far: rust bled from each anchor and the green-brown damp band round the foot as flat blocks
  // 1 mm proud (LOD2 of the weathered block only).
  const flat = (size: Vec3, at: Vec3, keep: 'front' | 'back' | 'left' | 'right', color: Vec3) =>
    box({
      size,
      at,
      color,
      strip: 'concrete',
      omit: (['front', 'back', 'left', 'right', 'top', 'bottom'] as const).filter(
        (f) => f !== keep,
      ),
    });
  const farBlock = merge([
    body,
    ...[-0.22, 0.22].map((y) => flat([0.001, 0.06, 0.34], [0.3005, y, 0.14], 'front', RUST_FAR)),
    flat([0.001, 0.8, 0.12], [0.3005, 0, 0], 'front', DAMP),
    flat([0.001, 0.8, 0.12], [-0.3005, 0, 0], 'back', DAMP),
    flat([0.6, 0.001, 0.12], [0, 0.4005, 0], 'left', DAMP),
    flat([0.6, 0.001, 0.12], [0, -0.4005, 0], 'right', DAMP),
  ]);
  return {
    meshes: { block: body, anchors: merge(anchors) },
    ...(aged ? { far: { block: farBlock, anchors: merge(anchors) } } : {}),
    fasteners,
    under: hex('#c4bfb4'),
    seed: 37,
    resolution: [0.1, 0.25, 0.4],
    effects: {
      rust: { where: 'below-fasteners | fasteners', amount: 0.6, streaks: true, streakLength: 0.4 },
      chips: { where: 'convex-edges', amount: 0.3 },
      moss: { where: 'shaded & wet & !down-facing', amount: 0.25 },
      mud: { where: 'ground-near & side-facing', amount: 0.4 },
      dust: { where: 'up-facing', amount: 0.45 },
    },
  };
}

/** 55 US gal drum: 0.572 m × 0.851 m, rolled chimes and two rolling hoops, two bungs on the lid. */
function drum(lod: number, aged: boolean): Obj {
  const r = 0.286;
  const hoop = (z: number): [number, number][] => [
    [r, z - 0.012],
    [r + 0.009, z],
    [r, z + 0.012],
  ];
  // LOD2 keeps the two rolling hoops (the drum's identity) and drops the rolled chimes.
  const far: [number, number][] = [[r, 0], ...hoop(0.284), ...hoop(0.567), [r, 0.851]];
  const near: [number, number][] = [
    [r - 0.004, 0],
    [r + 0.004, 0.006],
    [r + 0.004, 0.02],
    [r, 0.026],
    ...hoop(0.284),
    ...hoop(0.567),
    [r, 0.825],
    [r + 0.004, 0.831],
    [r + 0.004, 0.845],
    [r - 0.004, 0.851],
  ];
  // The weathered LOD0 shell carries its own grid (a station every 4 cm, 40 gores) for the dent,
  // so the weather pass need not tessellate it.
  const dense = aged && lod === 0;
  const profile = lod < 2 ? (dense ? densify(near, 0.04) : near) : far;
  const segments = dense ? 40 : ([32, 20, 12][lod] ?? 12);
  const side = lathe({
    profile,
    segments,
    color: DRUM_PAINT,
    strip: ENAMEL,
    creaseDeg: 40,
  });
  // The heads: flat discs on the side's own rim points (no T-junction), the lid tessellated and
  // mapped planar at true scale (the weathered lid tessellated). The lathe's cap was a fan from the centre: vertex-colour wear on
  // its rim drew a radial star; on a fine grid it lies in patches round the rim and the bungs.
  const disc = (end: [number, number] | undefined, up: boolean): Mesh => {
    const [rr = r, z = 0] = end ?? [];
    const pts = Array.from({ length: segments }, (_, k): Vec3 => {
      const t = (k / segments) * Math.PI * 2 - Math.PI / 2;
      return [rr * dmath.cos(t), rr * dmath.sin(t), z];
    });
    const face = planar({ points: up ? pts : pts.reverse(), color: DRUM_PAINT, strip: ENAMEL });
    // Only the weathered lid carries wear to paint: the new one stays one clean face.
    if (!up || !aged || lod === 2) return face;
    return projectStripUV(
      tessellate(face, lod === 0 ? 0.07 : 0.15),
      ENAMEL,
      // A band twice the 7 cm triangles' height (square texels, strip magnified 2×).
      (stripRect(ENAMEL).metres / 64) * 2,
      2,
    );
  };
  const shell = merge([side, disc(profile[profile.length - 1], true), disc(profile[0], false)]);
  const bungs: Mesh[] = [];
  const fasteners: { at: Vec3; radius: number }[] = [];
  // Far: only the 2" bung; the ¾" one is under a pixel.
  const caps = (
    [
      [0.17, 0.08, 0.03],
      [-0.17, 0.08, 0.016],
    ] as const
  ).slice(0, lod < 2 ? 2 : 1);
  for (const [x, y, rr] of caps) {
    const seg = [12, 8, 6][lod] ?? 6;
    bungs.push(
      cylinder({ radius: rr, length: 0.012, segments: seg, color: STEEL, at: [x, y, 0.857] }),
    );
    // The cap's raised hex boss (LOD0/1).
    if (lod < 2)
      bungs.push(
        cylinder({
          radius: rr * 0.55,
          length: 0.008,
          segments: 6,
          color: STEEL,
          at: [x, y, 0.866],
        }),
      );
    fasteners.push({ at: [x, y, 0.857], radius: rr });
  }
  return {
    meshes: { shell, bungs: merge(bungs) },
    ...(aged ? { settle: (m: Readonly<Record<string, Mesh>>) => crush(m, lod) } : {}),
    fasteners,
    under: hex('#8d8c88'),
    seed: 41,
    resolution: [0, 0.2, 0.4],
    effects: {
      rust: { where: 'convex-edges | fasteners', amount: 0.15, streaks: true, streakLength: 0.25 },
      chips: { where: 'convex-edges', amount: 0.3 },
      dust: { where: 'up-facing', amount: 0.5 },
      mud: { where: 'ground-near & side-facing', amount: 0.35 },
      bleach: { where: 'sunlit', amount: 0.3 },
    },
  };
}

/** Extra profile stations so no step along the profile is longer than `step` (m). */
function densify(profile: readonly [number, number][], step: number): [number, number][] {
  const out: [number, number][] = [];
  profile.forEach((p, i) => {
    const q = profile[i - 1];
    if (q) {
      const n = Math.ceil(dmath.hypot(p[0] - q[0], p[1] - q[1]) / step);
      for (let k = 1; k < n; k++)
        out.push([q[0] + ((p[0] - q[0]) * k) / n, q[1] + ((p[1] - q[1]) * k) / n]);
    }
    out.push(p);
  });
  return out;
}

/**
 * The weathered drum's history in its shape: a forklift tine's dent 9 cm deep in the side the
 * camera sees, between the rolling hoops (LOD0/1; LOD2 keeps the lean), and the crushed chime it
 * then sat on, so it leans 3° toward that side, its low rim on the slab.
 */
function crush(m: Readonly<Record<string, Mesh>>, lod: number): Record<string, Mesh> {
  const at = -1.65; // dent bearing about Z, radians: near the left limb the hero lens sees
  const dent = (mesh: Mesh): Mesh => {
    const positions = new Float32Array(mesh.positions);
    for (let v = 0; v < positions.length / 3; v++) {
      const x = positions[v * 3] ?? 0;
      const y = positions[v * 3 + 1] ?? 0;
      const z = positions[v * 3 + 2] ?? 0;
      const r = dmath.hypot(x, y);
      let da = dmath.atan2(y, x) - at;
      da = dmath.atan2(dmath.sin(da), dmath.cos(da));
      const d = dmath.hypot(da * 0.286, (z - 0.43) * 0.75) / 0.17;
      if (d >= 1 || r < 0.2) continue;
      const k = 1 - (0.09 * dmath.pow(dmath.cos((d * Math.PI) / 2), 2)) / r;
      positions[v * 3] = x * k;
      positions[v * 3 + 1] = y * k;
    }
    return weightedNormals({ ...mesh, positions }, { hardAngle: 40 });
  };
  // Lean: tip about the low rim point (bearing `at`, radius 0.29) so it stays on the slab.
  const rim: Vec3 = [0.29 * dmath.cos(at), 0.29 * dmath.sin(at), 0];
  const tilt = 0.05;
  // Rim point to the origin with the bearing on +X, pitch about Y (the far rim lifts), and back.
  const tip = (mesh: Mesh): Mesh => {
    const local = place(place(mesh, { at: [-rim[0], -rim[1], 0] }), { yaw: -at });
    return place(place(local, { pitch: tilt }), { yaw: at, at: rim });
  };
  return Object.fromEntries(
    Object.entries(m).map(([k, v]) => [k, tip(k === 'shell' && lod < 2 ? dent(v) : v)]),
  );
}

/** One labelled slab with the pristine object on the left (−Y) and the weathered one on the right. */
function pair(
  ctx: BuildContext,
  name: string,
  make: (lod: number, aged: boolean) => Obj,
  at: Vec3,
  gap: number,
): void {
  const len = 2 * gap + 1.2;
  // Labels are read up close only; LOD2 drops them (the slab is a plain plinth at distance).
  const label = (s: string, y: number): Mesh =>
    text(s, { origin: [0.6, y, 0.03], height: 0.09, color: INK, align: 'centre', maxWidth: 0.9 });
  const slab = merge([
    box({ size: [1.2, len, SLAB_H], color: SLAB, strip: 'concrete' }),
    ...(ctx.lod < 2 ? [label('NEW', -gap / 2 - 0.3), label('WEATHERED', gap / 2 + 0.3)] : []),
  ]);
  ctx.part(`${name}_slab`, slab, { at });
  const top: Vec3 = [at[0], at[1], at[2] + SLAB_H];
  const newAt: Vec3 = [top[0], top[1] - gap / 2 - 0.3, top[2]];
  const oldAt: Vec3 = [top[0], top[1] + gap / 2 + 0.3, top[2]];
  const fresh = make(ctx.lod, false);
  for (const [k, m] of Object.entries({ ...fresh.plain, ...fresh.meshes, ...fresh.rest?.meshes }))
    ctx.part(`${name}_new_${k}`, m, { at: newAt });
  const old = make(ctx.lod, true);
  const painted =
    ctx.lod === 2 && old.far
      ? old.far
      : weather(ctx, old.meshes, {
          name: `${name}_old`,
          seed: old.seed,
          age: 0.8,
          resolution: old.resolution,
          fasteners: old.fasteners,
          ...(old.touched ? { touched: old.touched } : {}),
          under: old.under,
          effects: old.effects,
        });
  const aged = old.settle ? old.settle(painted) : painted;
  const rest = old.rest
    ? weather(ctx, old.rest.meshes, {
        name: `${name}_old_rest`,
        seed: old.seed + 1,
        age: 0.8,
        resolution: old.rest.resolution,
        under: old.under,
        effects: old.rest.effects,
      })
    : {};
  for (const [k, m] of Object.entries({ ...old.plain, ...aged, ...rest }))
    ctx.part(`${name}_old_${k}`, m, { at: oldAt });
}

export const weather_demo = defineAsset({
  name: 'weather_demo',
  kind: 'prop',
  tags: ['material', 'weather', 'demo'],
  description:
    'Weathering demo: steel door, wooden crate, concrete block and steel drum, each pristine beside weathered by weather() — rust streaks, chips, dust, moss, mud, bleach, dents, sag.',
  sources: [
    'https://en.wikipedia.org/wiki/Drum_(container)',
    'https://www.wbdg.org/guides-specifications/building-envelope-design-guide/fenestration-systems/doors',
  ],
  budget: { triangles: [24000, 7000, 2000] },
  build(ctx) {
    pair(ctx, 'door', door, [-1.2, -1.45, 0], 0.9);
    pair(ctx, 'crate', crate, [-1.2, 1.55, 0], 0.6);
    pair(ctx, 'block', block, [1.0, -1.45, 0], 0.6);
    pair(ctx, 'drum', drum, [1.0, 1.55, 0], 0.4);
  },
});
