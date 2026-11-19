// Signal-bridge wear as vertex colour and thin decals. The story: a black-painted steel bridge a
// century over a steam main line. Sun fades the paint on every up-facing flange to a dusty
// charcoal; exhaust blasts soot the girder and the deck soffit directly above each track; rain
// bleeds rust from the riveted nodes in short streaks down the front of the girder and the posts;
// splash and moss climb the footings. Pure colour/decal work: shape stays in signal_gantry.ts.

import { box, type Mesh, merge, type Rng, type Vec3, valueNoise } from '@developerz.ai/ts23d';

export type Shade = (p: Vec3, n: Vec3, c: Vec3) => Vec3;

/** Run `f` over every vertex colour (meshes are in asset space). */
export function shade(m: Mesh, f: Shade): Mesh {
  const colors = new Float32Array(m.colors);
  for (let i = 0; i < m.positions.length / 3; i++) {
    const at = (a: Float32Array, k: number): number => a[i * 3 + k] ?? 0;
    const p: Vec3 = [at(m.positions, 0), at(m.positions, 1), at(m.positions, 2)];
    const n: Vec3 = [at(m.normals, 0), at(m.normals, 1), at(m.normals, 2)];
    colors.set(f(p, n, [at(colors, 0), at(colors, 1), at(colors, 2)]), i * 3);
  }
  return { ...m, colors };
}

const mix = (c: Vec3, to: Vec3, w: number): Vec3 => {
  const k = Math.min(1, Math.max(0, w));
  return [c[0] + (to[0] - c[0]) * k, c[1] + (to[1] - c[1]) * k, c[2] + (to[2] - c[2]) * k];
};

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Sun-faded black paint (linear RGB): a dusty charcoal. */
const FADED: Vec3 = [0.16, 0.155, 0.145];
const SOOT: Vec3 = [0.012, 0.011, 0.01];
const RUST: Vec3 = [0.3, 0.12, 0.045];
const MOSS: Vec3 = [0.12, 0.16, 0.06];

export interface SteelWear {
  /** Track centre lines (y): soot plumes rise from each. */
  readonly tracks: readonly number[];
  /** Underside of the girder: the exhaust hits from here up. */
  readonly girderZ: number;
  readonly deckZ: number;
}

/**
 * Painted steelwork: up-facing faces fade toward charcoal (blotchy), down-facing faces keep the
 * deep black, and the steel over each track takes soot that is heaviest on the soffit and fades
 * a metre up the girder and 1.4 m either side of the track centre.
 */
export function steelWear(rng: Rng, w: SteelWear): Shade {
  const blot = valueNoise(rng.fork('fade'), { scale: 0.6, octaves: 3 });
  const rot = valueNoise(rng.fork('rot'), { scale: 0.35, octaves: 3 });
  return (p, n, c) => {
    const b = 0.6 + 0.4 * blot(p);
    let out = mix(c, FADED, (0.15 + 0.6 * smooth(0.2, 0.9, n[2])) * b);
    // Rust breaking through the paint in patches, worst where water lies (up faces) and low
    // down where the ballast splash keeps the steel wet.
    const wet = 0.45 * smooth(0.3, 0.9, n[2]) + 0.4 * (1 - smooth(0.4, 2.2, p[2]));
    out = mix(out, RUST, (0.3 + wet) * smooth(0, 0.4, rot(p)));
    out = mix(out, SOOT, 0.3 * smooth(0.2, 0.9, -n[2]));
    const near = Math.min(...w.tracks.map((t) => Math.abs(p[1] - t)));
    const over = 1 - smooth(0.6, 1.6, near);
    const band =
      smooth(w.girderZ - 0.4, w.girderZ + 0.1, p[2]) * (1 - smooth(w.girderZ + 0.3, w.deckZ, p[2]));
    return mix(out, SOOT, 0.85 * over * band * (0.75 + 0.25 * blot([p[0], p[1] * 3, p[2]])));
  };
}

/** Footings and base plates: dark wet splash at the ground, moss on the faces away from the sun. */
export function footWear(rng: Rng): Shade {
  const patch = valueNoise(rng.fork('moss'), { scale: 0.2, octaves: 3 });
  return (p, n, c) => {
    const low = 1 - smooth(0, 0.45, p[2]);
    const away = smooth(-0.2, 0.6, -n[0] * 0.6 + n[1] * 0.8);
    let out = mix(c, MOSS, 0.7 * low * away * smooth(-0.2, 0.4, patch(p)));
    out = mix(out, [0.05, 0.045, 0.04], 0.4 * (1 - smooth(0, 0.1, p[2])));
    return out;
  };
}

/** One rust bleed: a riveted node on a face whose outward normal is ±X or ±Y (`axis`, `s`). */
export interface Bleed {
  readonly at: Vec3;
  readonly s: 1 | -1;
  readonly axis?: 'x' | 'y';
  /** Add the narrow drip under the head (default true); off where webs cross the face below. */
  readonly drip?: boolean;
  /** Lowest z it may run to (the bottom of the member it runs down). */
  readonly floor: number;
}

/**
 * Rust streaks as thin iron_rust slivers 3 mm proud of an X face (bedded 1 mm in): a wide head under the rivet and
 * a narrow drip, seeded lengths; about a third of the nodes stay clean.
 */
export function rustBleeds(rng: Rng, from: readonly Bleed[]): Mesh {
  const out: Mesh[] = [];
  for (const b of from) {
    if (rng.next() < 0.35) continue;
    const len = Math.min(rng.range(0.25, 0.8), b.at[2] - b.floor);
    if (len < 0.08) continue;
    const w = rng.range(0.03, 0.055);
    const [x, y, z] = b.at;
    // 4 mm thick: the back face 1 mm into the steel (a face contact), 3 mm proud.
    const onY = b.axis === 'y';
    const face = (onY ? y : x) + b.s * 0.001;
    const runs: (readonly [number, number, number])[] = [[w, 0, len * 0.4]];
    if (b.drip !== false) runs.push([w * 0.45, len * 0.4, len]);
    for (const [ww, l0, l1] of runs)
      out.push(
        box({
          size: onY ? [ww, 0.004, l1 - l0] : [0.004, ww, l1 - l0],
          at: onY ? [x, face, z - l1] : [face, y, z - l1],
          color: RUST,
          strip: 'iron_rust',
          // Face and back only: the 4 mm edges are never seen.
          omit: onY ? ['top', 'bottom', 'front', 'back'] : ['top', 'bottom', 'left', 'right'],
        }),
      );
  }
  return merge(out);
}
