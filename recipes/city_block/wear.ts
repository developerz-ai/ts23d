// City wear as vertex colour and soot streaks. The story is a century of New York street life:
// traffic grime and splash blacken the first storey (a ragged band up to 3 m), coal soot settles
// in a broad band under every cornice and runs down the brick in streaks a metre wide, each
// building has its own age (fresh repointing next to a sooty neighbour), tar roofs are patched
// in different greys. Large and dark enough to read at hero distance, not a texel-scale tint.

import {
  box,
  dmath,
  type Mesh,
  merge,
  place,
  planar,
  type Rng,
  type StripId,
  type Vec3,
  valueNoise,
} from '@developerz.ai/ts23d';
import type { Edge } from './edges.ts';

export type Shade = (p: Vec3, n: Vec3, c: Vec3) => Vec3;

/** Run `f` over every vertex colour (meshes in asset space). */
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

const GRIME: Vec3 = [0.04, 0.036, 0.032];
const SOOT: Vec3 = [0.02, 0.019, 0.018];

/**
 * Facade wear for one building: street grime up to ~3.5 m (ragged), a soot band under the roof
 * line fading 3.5 m down, and blotchy age over the wall; `age` 0..1 is the building's own.
 * `far`: a wall is one quad with vertex rows only at its foot and top, where the grime and soot
 * are blackest; shading those would blacken the whole face. Far, every vertex takes the wall's
 * MEAN wear instead (each band's share of the wall height), so the wall keeps its colour.
 */
export function facadeWear(
  rng: Rng,
  o: { base: number; top: number; age: number; far?: boolean },
): Shade {
  const blot = valueNoise(rng.fork('facade'), { scale: 2.5, octaves: 3 });
  if (o.far) {
    const h = Math.max(1, o.top - o.base);
    const grime = ((0.72 + 0.2 * o.age) * Math.min(h, 2.6)) / h;
    const soot = ((0.7 + 0.25 * o.age) * Math.min(h, 2.5)) / h;
    return (_p, _n, c) => mix(mix(c, GRIME, 0.5 * grime), SOOT, 0.5 * soot);
  }
  return (p, _n, c) => {
    const h = p[2] - o.base;
    const b = blot(p);
    let out = mix(c, GRIME, (0.72 + 0.2 * o.age) * (1 - smooth(1.2, 3.4 + 0.8 * b, h)));
    out = mix(out, SOOT, (0.7 + 0.25 * o.age) * smooth(o.top - 4 - b, o.top - 1, p[2]));
    return mix(out, GRIME, 0.22 * o.age * smooth(-0.1, 0.6, b));
  };
}

/** Street-level pieces (shopfront bulkheads, stoops, fire-escape feet): splash and grime. */
export function streetWear(rng: Rng, base: number): Shade {
  const blot = valueNoise(rng.fork('street'), { scale: 1.2, octaves: 2 });
  return (p, _n, c) => mix(c, GRIME, 0.55 * (1 - smooth(0.2, 1.4 + 0.5 * blot(p), p[2] - base)));
}

/**
 * Soot runs under a cornice on edge `e`: slabs 6 mm proud of the wall and bedded 6 cm into it
 * (its ends pierce the wall face, so it seats on it), each 0.5–1.3 m wide and 1.5–5 m long, black at the top and fading
 * into the wall colour at the foot. They take the wall's strip and tint, so only the soot reads;
 * `shade` the wall over them after.
 */
export function sootRuns(
  rng: Rng,
  e: Edge,
  o: { top: number; wall: Vec3; strip: StripId },
): Mesh[] {
  const out: Mesh[] = [];
  const n = Math.floor(e.len / 2.2);
  for (let k = 0; k < n; k++) {
    if (rng.next() < 0.4) continue;
    const w = rng.range(0.5, 1.3);
    const len = Math.min(rng.range(1.5, 5), o.top - 1);
    const t = rng.range(0.5, Math.max(0.51, e.len - w - 0.5));
    if (len < 1 || t + w > e.len - 0.5) continue;
    const z0 = o.top - len;
    const q = place(
      box({
        size: [0.066, w, len],
        at: [-0.027, t + w / 2, z0],
        color: o.wall,
        strip: o.strip,
        // The back is inside the wall; the ends pierce its face, so the run seats on it.
        omit: ['top', 'bottom', 'back'],
      }),
      { at: [e.a[0], e.a[1], 0], yaw: e.yaw },
    );
    const colors = new Float32Array(q.colors);
    for (let i = 0; i < q.positions.length / 3; i++) {
      const f = Math.min(1, Math.max(0, ((q.positions[i * 3 + 2] ?? 0) - z0) / len));
      colors.set(mix(o.wall, SOOT, 0.95 * dmath.pow(f, 1.2)), i * 3);
    }
    out.push({ ...q, colors });
  }
  return out;
}

/**
 * Roof grime: a tone per roof that drifts slowly across the block (patching shows as its own
 * boxes). A roof is two triangles, so 3 m blotches sampled at its corners drew diagonal seams
 * across it; at 25 m a roof's corners agree.
 */
export function roofWear(rng: Rng): Shade {
  const blot = valueNoise(rng.fork('roof'), { scale: 25, octaves: 2 });
  return (p, n, c) => (n[2] > 0.5 ? mix(c, GRIME, 0.35 * smooth(-0.2, 0.6, blot(p))) : c);
}

/**
 * A grime streak run down the brick from a window sill (window frame: wall face at x = 0, +X
 * out, the sill's foot at z = 0, centred on y = 0), 6 mm proud on the wall's own strip and tint:
 * `w` wide under the sill tapering to a quarter of that at its foot `len` below, darkest
 * (`strength` of the way to soot) under the sill, mostly gone a third of the way down and fading
 * into the wall at its foot. Water off every sill carries soot down the face: the classic New
 * York facade stain, each one its own length, width and darkness.
 */
export function sillStreak(
  w: number,
  len: number,
  o: { wall: Vec3; strip: StripId; strength?: number },
): Mesh {
  const k = o.strength ?? 0.95;
  const mid = -len * 0.3;
  const band = (z0: number, z1: number, w0: number, w1: number): Mesh =>
    planar({
      points: [
        [0.006, -w0 / 2, z0],
        [0.006, w0 / 2, z0],
        [0.006, w1 / 2, z1],
        [0.006, -w1 / 2, z1],
      ],
      color: o.wall,
      strip: o.strip,
    });
  const q = merge([band(mid, 0, w * 0.7, w), band(-len, mid, w * 0.25, w * 0.7)]);
  const colors = new Float32Array(q.colors);
  for (let i = 0; i < q.positions.length / 3; i++) {
    const z = q.positions[i * 3 + 2] ?? 0;
    const f = z >= 0 ? 1 : z >= mid ? 0.8 : 0;
    colors.set(mix(o.wall, SOOT, k * f), i * 3);
  }
  return { ...q, colors };
}
