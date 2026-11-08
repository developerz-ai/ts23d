// Legs: fore (lion-like: heavy shoulder, elbow back, thick forearm, wrist forward, splayed paw)
// and hind (horse-like: big haunch, knee forward, hock back, long metatarsus, four-toed foot).
// Left side only, mirrored by the body sculpt. Masses → muscle forms → knuckles and pads; claws are
// returned separately so they mesh at a finer cell than the body.

import { type Mesh, merge, place, type SculptEdit, type Vec3 } from '@developerz.ai/ts23d';
import { spline, v3 } from '../_lib/creature/curve.ts';
import { clawHorn, type HornOptions, hornTube } from '../_lib/creature/horn.ts';
import { blob, skinTube } from '../_lib/creature/lowpoly.ts';
import { type SkinNode, skin } from '../_lib/creature/skin.ts';
import { C, CLAW } from './palette.ts';
import { SK } from './skeleton.ts';

export interface Toe {
  /** Knuckle chain root → tip. */
  readonly nodes: SkinNode[];
  /** Where the claw starts and which way it points. */
  readonly clawAt: Vec3;
  readonly dir: Vec3;
  readonly size: number;
}

const node = (at: Vec3, r: number): SkinNode => ({ at, r });

/** A limb segment chain through landmarks with radii, smoothed by a spline. */
function limb(pts: readonly Vec3[], radii: readonly number[], per: number): SkinNode[] {
  const path = spline(pts, per);
  const n = path.length - 1;
  return path.map((at, i) => {
    const t = (i / n) * (radii.length - 1);
    const k = Math.floor(t);
    const a = radii[Math.min(k, radii.length - 1)] ?? 0.1;
    const b = radii[Math.min(k + 1, radii.length - 1)] ?? a;
    return node(at, a + (b - a) * (t - k));
  });
}

/** Toes splayed in a fan from `palm`, each ending in a claw. */
function toes(
  palm: Vec3,
  spec: readonly { yaw: number; len: number; r: number; lift: number }[],
): Toe[] {
  return spec.map((s) => {
    const dir: Vec3 = [Math.cos(s.yaw), Math.sin(s.yaw), 0];
    const k0 = v3.add(palm, v3.mul(dir, 0.08));
    const k1: Vec3 = v3.add(palm, [dir[0] * (s.len * 0.55), dir[1] * (s.len * 0.55), s.lift]);
    const k2: Vec3 = v3.add(palm, [dir[0] * s.len, dir[1] * s.len, s.lift * 0.4 - 0.03]);
    const tip = k2;
    return {
      nodes: [node(k0, s.r * 1.15), node(k1, s.r), node(k2, s.r * 0.88)],
      clawAt: v3.add(tip, v3.mul(dir, s.r * 0.35)),
      dir: v3.norm([dir[0], dir[1], 0.25]),
      size: s.r,
    };
  });
}

export function foreToes(): Toe[] {
  const palm: Vec3 = [SK.fore.palm[0] + 0.04, SK.fore.palm[1], 0.12];
  return toes(palm, [
    { yaw: 0.55, len: 0.36, r: 0.085, lift: 0.02 },
    { yaw: 0.12, len: 0.42, r: 0.095, lift: 0.025 },
    { yaw: -0.3, len: 0.38, r: 0.09, lift: 0.02 },
    { yaw: -1.0, len: 0.27, r: 0.075, lift: 0.04 },
  ]);
}

export function hindToes(): Toe[] {
  const palm: Vec3 = [SK.hind.ball[0] + 0.06, SK.hind.ball[1], 0.12];
  return toes(palm, [
    { yaw: 0.5, len: 0.36, r: 0.08, lift: 0.02 },
    { yaw: 0.08, len: 0.42, r: 0.09, lift: 0.025 },
    { yaw: -0.38, len: 0.36, r: 0.082, lift: 0.02 },
    { yaw: 2.6, len: 0.24, r: 0.07, lift: 0.06 },
  ]);
}

const f = SK.fore;
const h = SK.hind;
/** Bone chains of the two legs (left), shared by the sculpt and the far-LOD tubes. */
const foreChain = (per: number): SkinNode[] =>
  limb(
    [f.shoulder, f.elbow, f.wrist, [f.palm[0] - 0.02, f.palm[1], 0.16]],
    [0.28, 0.22, 0.19, 0.19],
    per,
  );
const hindChain = (per: number): SkinNode[] =>
  limb([h.hip, h.knee, h.hock, [h.ball[0] - 0.04, h.ball[1], 0.15]], [0.3, 0.2, 0.15, 0.16], per);

/** Fore leg masses and muscle forms (left). */
function foreLeg(lod: number): SculptEdit[] {
  const out: SculptEdit[] = [
    // Upper arm + forearm as one skin through the joints.
    skin(foreChain(5), { blend: 0.1 }),
    // Deltoid cap and triceps: modest, so the leg reads as a column under the chest.
    {
      shape: 'ellipsoid',
      at: [0.96, 0.66, 1.58],
      size: [0.28, 0.2, 0.28],
      rotate: [0, 25, 0],
      blend: 0.14,
    },
    {
      shape: 'ellipsoid',
      at: [0.64, 0.74, 1.22],
      size: [0.18, 0.16, 0.3],
      rotate: [0, -40, 0],
      blend: 0.12,
    },
    // Forearm: heavy and columnar (×1.4 a lion's), extensor mass forward-out below the elbow.
    {
      shape: 'ellipsoid',
      at: [0.76, 0.84, 0.66],
      size: [0.22, 0.21, 0.36],
      rotate: [0, 22, 0],
      blend: 0.12,
    },
    // Wrist: thick, then the big flat paw.
    { shape: 'ellipsoid', at: [0.98, 0.83, 0.3], size: [0.17, 0.19, 0.14], blend: 0.08 },
    {
      shape: 'ellipsoid',
      at: [f.palm[0] + 0.04, f.palm[1], 0.12],
      size: [0.33, 0.28, 0.13],
      blend: 0.08,
    },
  ];
  for (const t of foreToes()) out.push(skin(t.nodes, { blend: 0.05 }));
  if (lod < 2) {
    // Elbow point and wrist knob read the joints.
    out.push({ shape: 'sphere', at: [0.44, 0.82, 1.0], size: 0.12, blend: 0.08 });
    out.push({ shape: 'ellipsoid', at: [0.94, 0.86, 0.34], size: [0.12, 0.15, 0.1], blend: 0.06 });
  }
  return out;
}

/** Hind leg masses (left). */
function hindLeg(lod: number): SculptEdit[] {
  const out: SculptEdit[] = [
    skin(hindChain(5), { blend: 0.1 }),
    // Haunch: the big thigh mass, then the hamstring behind and quads in front.
    {
      shape: 'ellipsoid',
      at: [-1.12, 0.62, 1.32],
      size: [0.56, 0.28, 0.5],
      rotate: [0, -30, 0],
      blend: 0.18,
    },
    {
      shape: 'ellipsoid',
      at: [-0.86, 0.7, 1.12],
      size: [0.26, 0.2, 0.34],
      rotate: [0, -50, 0],
      blend: 0.12,
    },
    // Calf behind the shin.
    {
      shape: 'ellipsoid',
      at: [-1.12, 0.76, 0.8],
      size: [0.26, 0.15, 0.17],
      rotate: [0, 30, 0],
      blend: 0.1,
    },
    // Foot pad.
    { shape: 'ellipsoid', at: [h.ball[0], h.ball[1], 0.13], size: [0.22, 0.18, 0.12], blend: 0.08 },
  ];
  for (const t of hindToes()) out.push(skin(t.nodes, { blend: 0.05 }));
  if (lod < 2) {
    out.push({ shape: 'sphere', at: [-0.66, 0.76, 0.98], size: 0.11, blend: 0.08 });
    out.push({ shape: 'sphere', at: [-1.55, 0.76, 0.52], size: 0.09, blend: 0.06 });
  }
  return out;
}

/** Both legs (left; the body sculpt mirrors), coloured as flank fading to dark paws. */
export function legEdits(lod: number): SculptEdit[] {
  // The blend is the fillet where the legs root in the torso (armpit, groin): 0.12 left hard
  // valleys there (QA connections seams); 0.2 flows the haunch and shoulder into the flank.
  return [{ group: [...foreLeg(lod), ...hindLeg(lod)], blend: 0.2, color: C.flank }];
}

/** Claws for every toe (left), as horn options. */
export function clawSpecs(lod: number): HornOptions[] {
  const segs = [10, 6, 3][lod] ?? 3;
  return [...foreToes(), ...hindToes()].map((t) =>
    clawHorn({
      base: v3.sub(t.clawAt, v3.mul(t.dir, t.size * 0.6)),
      dir: t.dir,
      down: [0, 0, -1],
      length: t.size * 2.6,
      radius: t.size * 0.72,
      segments: segs,
      colors: CLAW,
      curl: 75,
      tip: lod === 0 ? 0.005 : 0.012,
    }),
  );
}

/** Claws as banded tubes, left and right. */
export function clawMesh(lod: 0 | 1): Mesh {
  const left = merge(clawSpecs(lod).map((o) => hornTube(o, lod === 0 ? 12 : 5)));
  return merge([left, place(left, { scale: [1, -1, 1] })]);
}

/** Far LOD: both legs as tubes + muscle blobs + paw blobs, left and right. */
export function legsLowpoly(): Mesh {
  const c = C.flank;
  const o = { rings: 3, sides: 6, color: c };
  const left = merge([
    skinTube(foreChain(2), { sides: 6, color: c }),
    skinTube(hindChain(2), { sides: 6, color: c }),
    blob([0.72, 0.72, 1.2], [0.32, 0.22, 0.45], { ...o, rotate: [0, -30, 0] }),
    blob([-1.12, 0.62, 1.32], [0.56, 0.28, 0.5], { ...o, rotate: [0, -30, 0] }),
    blob([f.palm[0] + 0.1, f.palm[1], 0.1], [0.3, 0.24, 0.11], {
      rings: 3,
      sides: 6,
      color: C.backDeep,
    }),
    blob([h.ball[0] + 0.1, h.ball[1], 0.1], [0.3, 0.22, 0.11], {
      rings: 3,
      sides: 6,
      color: C.backDeep,
    }),
  ]);
  return merge([left, place(left, { scale: [1, -1, 1] })]);
}
