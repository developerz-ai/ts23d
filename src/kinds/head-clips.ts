// Head morphs and clips (plan 101 slice 10): `blink` (both upper lids turned down over the balls
// about each eye's lateral axis), `talk` (the lower face opened about the jaw hinge, faded above
// the lip line and down the throat) and `breathe` (the chest and shoulders rise and swell along
// their normals), always all three first and in that order (a mesh's own morphs follow), so meshes
// that merge keep one target list. The clips key every target's weight on the part that carries
// them (`headClips(part, names)` for a mesh with morphs of its own): `blink` (two blinks in 4 s), `talk`
// (syllables in 2.4 s), `breathe` (one breath in 4 s); every loop's last key = its first.
// Procedural shapes from landmarks; MakeHuman (MPFB2, CC0) expression targets are planned.

import { type Clip, dmath, type Mesh, type Morph, Ts23dError, type Vec3 } from '../core/index.ts';
import { hingeMorph, sumMorphs } from '../passes/index.ts';

export const HEAD_MORPHS = ['blink', 'talk', 'breathe'] as const;

export interface FaceRig {
  /** Left eyeball centre (right = mirror in Y), ball radius, lid thickness; metres. */
  readonly eye: { readonly centre: Vec3; readonly r: number; readonly lid: number };
  /** Jaw: hinge (TMJ, left) and chin; `lips` = height of the lip line. */
  readonly jaw: { readonly hinge: Vec3; readonly chin: Vec3; readonly lips: number };
  /** Ribcage: centre and radius of the region that breathes. */
  readonly chest: { readonly centre: Vec3; readonly r: number };
}

/** Degrees the lid turns to close, the jaw opens at full `talk`. */
const LID_CLOSE = 48;
const JAW_OPEN = 14;
/** Chest rise and swell at full `breathe`, metres. */
const RISE = 0.004;
const SWELL = 0.003;

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function blink(mesh: Mesh, e: FaceRig['eye']): Morph {
  const lid = (side: 1 | -1): Morph => {
    const c: Vec3 = [e.centre[0], e.centre[1] * side, e.centre[2]];
    return hingeMorph(mesh, 'blink', {
      at: c,
      axis: [0, 1, 0],
      degrees: LID_CLOSE,
      weight: (p) => {
        const d: Vec3 = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
        const r = dmath.norm(d);
        // The lid shell over the front of the ball, above its equator.
        const shell =
          smooth(e.r + e.lid * 6, e.r + e.lid * 2, r) * smooth(e.r * 0.6, e.r * 0.95, r);
        return shell * smooth(-e.r * 0.2, e.r * 0.3, d[0]) * smooth(-e.r * 0.15, e.r * 0.2, d[2]);
      },
    });
  };
  return sumMorphs('blink', lid(1), lid(-1));
}

function talk(mesh: Mesh, j: FaceRig['jaw']): Morph {
  const drop = j.hinge[2] - j.chin[2];
  return hingeMorph(mesh, 'talk', {
    at: [j.hinge[0], 0, j.hinge[2]],
    axis: [0, 1, 0],
    degrees: JAW_OPEN,
    weight: (p) =>
      smooth(j.lips + drop * 0.04, j.lips - drop * 0.04, p[2]) *
      smooth(j.hinge[0], j.hinge[0] + (j.chin[0] - j.hinge[0]) * 0.4, p[0]) *
      smooth(j.chin[2] - drop * 0.5, j.chin[2] - drop * 0.1, p[2]),
  });
}

function breathe(mesh: Mesh, c: FaceRig['chest']): Morph {
  const out = new Float32Array(mesh.positions.length);
  for (let v = 0; v < out.length / 3; v++) {
    const p: Vec3 = [
      mesh.positions[v * 3] ?? 0,
      mesh.positions[v * 3 + 1] ?? 0,
      mesh.positions[v * 3 + 2] ?? 0,
    ];
    const w = smooth(
      c.r,
      c.r * 0.4,
      dmath.hypot(p[0] - c.centre[0], p[1] - c.centre[1], p[2] - c.centre[2]),
    );
    if (w === 0) continue;
    out.set(
      [0, 1, 2].map((k) => (mesh.normals[v * 3 + k] ?? 0) * SWELL * w + (k === 2 ? RISE * w : 0)),
      v * 3,
    );
  }
  return { name: 'breathe', positions: out };
}

/** The mesh with `blink`, `talk` and `breathe` first (in that order, replacing any of those names),
 *  then its own other morphs. */
export function faceMorphs(mesh: Mesh, rig: FaceRig): Mesh {
  if (!(rig.eye.r > 0 && rig.eye.lid > 0 && rig.chest.r > 0 && rig.jaw.hinge[2] > rig.jaw.chin[2]))
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `face rig: eye r ${rig.eye.r}, lid ${rig.eye.lid}, chest r ${rig.chest.r}, hinge z ${rig.jaw.hinge[2]} vs chin z ${rig.jaw.chin[2]}`,
      fix: 'give positive eye and chest radii and a jaw hinge above the chin (metres, Z up)',
    });
  const keep = (mesh.morphs ?? []).filter(
    (m) => !(HEAD_MORPHS as readonly string[]).includes(m.name),
  );
  return {
    ...mesh,
    morphs: [blink(mesh, rig.eye), talk(mesh, rig.jaw), breathe(mesh, rig.chest), ...keep],
  };
}

/** Morph weights [blink, talk, breathe] per key, placed at `slots` of a `stride`-long weight row
 *  (every other target 0) → one looping clip on `part`. */
function weightsClip(
  part: string,
  name: string,
  seconds: number,
  n: number,
  at: (u: number) => readonly number[],
  slots: readonly number[],
  stride: number,
): Clip {
  const times = Float32Array.from({ length: n + 1 }, (_, i) => (i * seconds) / n);
  const keys = Array.from({ length: n + 1 }, (_, i) => {
    const row = new Array<number>(stride).fill(0);
    at((i % n) / n).forEach((w, k) => {
      row[slots[k] ?? 0] = w;
    });
    return row;
  });
  return {
    name,
    seconds,
    loop: true,
    tracks: [{ part, path: 'weights', times, values: Float32Array.from(keys.flat()) }],
  };
}

const pulse = (u: number, at: number, w: number): number =>
  Math.abs(u - at) < w ? 0.5 * (1 + dmath.cos((Math.PI * (u - at)) / w)) : 0;

/** `blink`, `talk` and `breathe` on the part carrying `faceMorphs` (a pivot node in the GLB).
 *  `morphs`: that part's target names in order (default the three head morphs alone); each clip
 *  keys a weight for every target, so a mesh with morphs of its own keeps the export's stride. */
export function headClips(part: string, morphs: readonly string[] = HEAD_MORPHS): Clip[] {
  const slots = HEAD_MORPHS.map((m) => morphs.indexOf(m));
  if (slots.some((i) => i < 0) || new Set(morphs).size !== morphs.length)
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `headClips: morph targets [${morphs.join(', ')}] must name ${HEAD_MORPHS.join(', ')} once each`,
      fix: "pass the part's morph names after faceMorphs: faceMorphs(mesh, rig).morphs.map((m) => m.name)",
    });
  const clip = (name: string, seconds: number, n: number, at: (u: number) => readonly number[]) =>
    weightsClip(part, name, seconds, n, at, slots, morphs.length);
  // Syllables: open-close pulses of varied height, a pause, the jaw shut at the seam.
  const syllables: readonly [number, number][] = [
    [0.1, 0.8],
    [0.22, 0.45],
    [0.33, 1],
    [0.47, 0.6],
    [0.7, 0.9],
    [0.82, 0.4],
  ];
  return [
    clip('blink', 4, 48, (u) => [Math.max(pulse(u, 0.3, 0.04), pulse(u, 0.82, 0.04)), 0, 0]),
    clip('talk', 2.4, 48, (u) => [
      0,
      Math.max(0, ...syllables.map(([at, h]) => h * pulse(u, at, 0.055))),
      0,
    ]),
    clip('breathe', 4, 32, (u) => [0, 0, 0.5 * (1 - dmath.cos(2 * Math.PI * u))]),
  ];
}
