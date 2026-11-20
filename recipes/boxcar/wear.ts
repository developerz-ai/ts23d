// Thirty years on the road, in vertex colour and a few thin decals. The car paint is a paint slot
// (a vertex stores colour ÷ slot colour), so paint only ever loses value, never gains it: the
// whole car is faded well below the chip (two thirds of it), and what reads as "fresh" (a
// replaced group of boards) is simply back at the chip. Road grime rises from the rails (heaviest on the sill and
// the lowest metre of the boards), board groups differ (one sun-bleached, one renewed), the steel
// rusts where water sits (sill, post feet, roof seams), running gear carries brown rail dust, and
// rust runs down from the door guide, the side plate and the rivets as thin slivers.

import {
  box,
  dmath,
  type Mesh,
  merge,
  type Rng,
  type Vec3,
  valueNoise,
} from '@developerz.ai/ts23d';

const GRIME: Vec3 = [0.05, 0.04, 0.03];
const RUST: Vec3 = [0.15, 0.052, 0.022];
const RAIL_DUST: Vec3 = [0.19, 0.14, 0.095];
const SOOT: Vec3 = [0.03, 0.028, 0.026];

const clamp = (x: number): number => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (c: Vec3, to: Vec3, k: number): Vec3 => {
  const t = clamp(k);
  return [c[0] + (to[0] - c[0]) * t, c[1] + (to[1] - c[1]) * t, c[2] + (to[2] - c[2]) * t];
};
/** `to`, held at or under `cap` in every channel (what a paint-slot vertex may be). */
const under = (to: Vec3, cap: Vec3): Vec3 => [
  Math.min(to[0], cap[0]),
  Math.min(to[1], cap[1]),
  Math.min(to[2], cap[2]),
];

export interface Wear {
  /** Painted boards and steel (slot `body`): fade, board groups, grime from the rails, rust low. */
  painted(m: Mesh, o?: { bands?: boolean; ground?: number }): Mesh;
  /** The roof: locomotive soot, rust along the seams and eaves. */
  roof(m: Mesh): Mesh;
  /** Unpainted iron under the floor: brown rail dust, black oil round the journals. */
  gear(m: Mesh, at?: Vec3): Mesh;
}

/** Width of one group of boards (the sheathing's strip band along the car), metres. */
export const BAND = 0.6;

export function wearOf(rng: Rng, paint: Vec3, half: number): Wear {
  const blotch = valueNoise(rng.fork('blotch'), { scale: 0.9, octaves: 3 });
  const fine = valueNoise(rng.fork('fine'), { scale: 0.12, octaves: 2 });
  const n01 = (f: (p: Vec3) => number, p: Vec3): number => clamp(0.5 + 0.5 * f(p));
  // One tone per board group and side: most a little uneven, a few renewed, a few bleached.
  const tones = new Map<string, number>();
  const pick = rng.fork('boards');
  const toneOf = (band: number, side: number): number => {
    const key = `${band}:${side}`;
    let t = tones.get(key);
    if (t === undefined) {
      const roll = pick.next();
      // Renewed boards come back to the chip, a bleached group sits between, a soaked one under.
      t = roll < 0.14 ? 1.5 : roll < 0.32 ? 0.72 : pick.range(0.86, 1.12);
      tones.set(key, t);
    }
    return t;
  };
  const grime = under(GRIME, paint);
  const rust = under(RUST, paint);
  const soot = under(SOOT, paint);
  const each = (m: Mesh, at: Vec3, f: (p: Vec3, c: Vec3, n: Vec3, tri: Vec3) => Vec3): Mesh => {
    const colors = new Float32Array(m.colors);
    const P = (i: number): Vec3 => [
      (m.positions[i * 3] ?? 0) + at[0],
      (m.positions[i * 3 + 1] ?? 0) + at[1],
      (m.positions[i * 3 + 2] ?? 0) + at[2],
    ];
    // Triangle centroids: what a board group is decided on, so shared edges stay crisp.
    const centre = new Map<number, Vec3>();
    for (let t = 0; t < m.indices.length; t += 3) {
      const [a, b, c] = [P(m.indices[t] ?? 0), P(m.indices[t + 1] ?? 0), P(m.indices[t + 2] ?? 0)];
      const g: Vec3 = [
        (a[0] + b[0] + c[0]) / 3,
        (a[1] + b[1] + c[1]) / 3,
        (a[2] + b[2] + c[2]) / 3,
      ];
      for (let k = 0; k < 3; k++) centre.set(m.indices[t + k] ?? 0, g);
    }
    for (let i = 0; i < m.positions.length / 3; i++) {
      const c: Vec3 = [colors[i * 3] ?? 0, colors[i * 3 + 1] ?? 0, colors[i * 3 + 2] ?? 0];
      const n: Vec3 = [m.normals[i * 3] ?? 0, m.normals[i * 3 + 1] ?? 0, m.normals[i * 3 + 2] ?? 0];
      colors.set(f(P(i), c, n, centre.get(i) ?? P(i)), i * 3);
    }
    return { ...m, colors };
  };
  return {
    painted: (m, o = {}) =>
      each(m, [0, 0, 0], (p, c, n, tri) => {
        const b = n01(blotch, p);
        // Faded a step under the chip everywhere; board groups step up or down from there.
        let k = 0.64 + 0.12 * b;
        if (o.bands && Math.abs(n[1]) > 0.7)
          k *= toneOf(Math.floor((tri[0] + half) / BAND), Math.sign(tri[1]));
        let out: Vec3 = [c[0] * Math.min(1, k), c[1] * Math.min(1, k), c[2] * Math.min(1, k)];
        // Grime from the rails: nearly opaque on the sill, ragged edge about a metre up the boards.
        const z0 = o.ground ?? 1.0;
        const g = 1 - smooth(z0, z0 + 1.15 + 0.9 * b, p[2]);
        out = mix(out, grime, 0.92 * dmath.pow(g, 0.9) * (0.75 + 0.25 * n01(fine, p)));
        // Rust where water sits on the steel: post feet and the sill line.
        const wet = 1 - smooth(z0 + 0.05, z0 + 0.45, p[2]);
        out = mix(out, rust, 0.45 * wet * smooth(0.45, 0.7, n01(fine, [p[0], p[1], p[2] * 0.3])));
        // Rain wash under the side plate: dark runs half a metre wide, down to door-handle height.
        const run = smooth(0.48, 0.72, n01(fine, [p[0] * 0.4, 0, 0]));
        out = mix(out, grime, 0.6 * run * smooth(2.1, 3.75, p[2]));
        return under(out, c);
      }),
    roof: (m) =>
      each(m, [0, 0, 0], (p, c) => {
        const b = n01(blotch, p);
        const f = n01(fine, p);
        let out = mix(c, soot, 0.55 * (0.45 + 0.55 * b));
        out = mix(out, rust, 0.6 * smooth(0.55, 0.78, f) * (0.5 + 0.5 * b));
        return under(out, c);
      }),
    gear: (m, at = [0, 0, 0]) =>
      each(m, at, (p, c) => {
        const b = n01(blotch, p);
        const dust = (1 - smooth(0.25, 1.25, p[2])) * (0.45 + 0.35 * b) + 0.18;
        return mix(c, RAIL_DUST, dust);
      }),
  };
}

export interface Run {
  /** Where the water leaves the iron: the streak hangs from here. */
  readonly at: Vec3;
  /** Outward side (±1 on Y). */
  readonly s: number;
  /** Lowest z it may reach. */
  readonly floor: number;
  /** Longest run, metres. */
  readonly reach: number;
  /** Widest the stain may be (the face it runs down: a 9 cm post); default 16 cm. */
  readonly width?: number;
}

/** Rust runs: a wide stain under the source and a narrower drip below, 4 mm proud of the face. */
export function rustRuns(rng: Rng, from: readonly Run[], tint: Vec3, drip: boolean): Mesh {
  const out: Mesh[] = [];
  for (const src of from) {
    const len = Math.min(rng.range(0.45, 1) * src.reach, src.at[2] - src.floor);
    const w = Math.min(rng.range(0.07, 0.16), src.width ?? 0.16);
    const shift = rng.range(-0.01, 0.01);
    if (len < 0.08) continue;
    const [x, y, z] = src.at;
    const sliver = (width: number, z0: number, h: number, dx: number): Mesh =>
      box({
        size: [width, 0.004, h],
        at: [x + dx, y + src.s * 0.002, z0],
        color: tint,
        strip: 'iron_rust',
        omit: ['back', 'bottom', 'top'],
      });
    out.push(sliver(w, z - len * 0.45, len * 0.45, 0));
    if (drip) out.push(sliver(w * 0.42, z - len, len * 0.56, shift));
  }
  return merge(out);
}
