// Mineable asteroid — a ~10 m rubble-pile rock for a mining game, in three seeded variants.
// A signed-distance field meshed by `sdf`: a lumpy ellipsoid (smooth-union lobes), fractal
// value-noise displacement, impact craters (smooth subtract + raised rims), then vertex colour:
// carbonaceous dark rock (C-type albedo 0.03–0.09), dust on up-facing slopes, darker crater
// floors, and nickel-iron ore veins (M-type). Glowing crystal clusters mark the mining points.
// The bottom is clipped flat at z = 0 so it rests on (or in) the ground. +X front, Z up, metres.
//
// Engine contract: `rock` (the collider-friendly mass), `ore_crystals` (glow), interact sockets
// `mine_point_*` at each crystal cluster, `dust` emitter for mining debris.

import {
  type Asset,
  type BuildContext,
  bakeAo,
  defineAsset,
  type Field,
  hex,
  lathe,
  type Mesh,
  merge,
  place,
  sdf,
  type Vec3,
  valueNoise,
} from '@developerz.ai/ts23d';

const ROCK = hex('#3b3632');
const ROCK_LIGHT = hex('#4f4841');
const DUST = hex('#6a6157');
const CRATER = hex('#26221f');
const ORE = hex('#b78a45');
const CRYSTAL = hex('#3fe0d0');
const CRYSTAL_TINT = hex('#1f6f6a');

type V = [number, number, number];
const step = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const len = (x: number, y: number, z: number): number => Math.sqrt(x * x + y * y + z * z);
const norm = (v: Vec3): V => {
  const l = len(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const smin = (a: number, b: number, k: number): number => {
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
  return b + (a - b) * h - k * h * (1 - h);
};
const smax = (a: number, b: number, k: number): number => -smin(-a, -b, k);
const ellipsoid = (p: Vec3, c: Vec3, r: Vec3): number => {
  const x = (p[0] - c[0]) / r[0];
  const y = (p[1] - c[1]) / r[1];
  const z = (p[2] - c[2]) / r[2];
  const k0 = len(x, y, z);
  const k1 = len(x / r[0], y / r[1], z / r[2]);
  return k1 === 0 ? -Math.min(...r) : (k0 * (k0 - 1)) / k1;
};

interface Crater {
  readonly centre: V; // sphere centre (cuts the bowl)
  readonly r: number;
}

interface Shape {
  readonly field: Field;
  readonly craters: readonly Crater[];
  readonly gradient: (p: Vec3) => V;
  /** Surface point along a ray from the core (bisection on the field). */
  readonly surface: (dir: Vec3) => V;
}

// Below every variant's z radius, so the field always crosses z = 0 and the rock sits clipped flat.
const CORE: V = [0, 0, 2.2];

/** The rock's field. Every draw comes from forks of `ctx.rng`, identical at every LOD. */
function shape(ctx: BuildContext, size: V): Shape {
  const rng = ctx.rng.fork('shape');
  const big = valueNoise(rng.fork('big'), { scale: 2.8, octaves: 4 });
  const pits = valueNoise(rng.fork('pits'), { scale: 0.8, octaves: 2 });
  const lobes = Array.from({ length: 3 }, () => ({
    c: [rng.range(-2.6, 2.6), rng.range(-1.8, 1.8), CORE[2] + rng.range(-0.6, 1.0)] as V,
    r: [rng.range(1.8, 2.8), rng.range(1.6, 2.4), rng.range(1.4, 2.2)] as V,
  }));
  // Fracture planes: half-spaces that chip flat, angular facets off the lumpy mass.
  const chips = Array.from({ length: 12 }, () => {
    const a = rng.range(0, Math.PI * 2);
    const up = rng.range(-0.2, 0.9);
    const m = norm([
      Math.cos(a) * Math.sqrt(1 - up * up),
      Math.sin(a) * Math.sqrt(1 - up * up),
      up,
    ]);
    const reach = Math.abs(m[0]) * size[0] + Math.abs(m[1]) * size[1] + Math.abs(m[2]) * size[2];
    return { m, c: reach * rng.range(0.62, 0.8) };
  });
  const body = (p: Vec3): number => {
    let d = ellipsoid(p, CORE, size);
    for (const l of lobes) d = smin(d, ellipsoid(p, l.c, l.r), 1.0);
    d += 0.65 * big(p) + 0.12 * pits(p);
    const x = p[0] - CORE[0];
    const y = p[1] - CORE[1];
    const z = p[2] - CORE[2];
    for (const c of chips)
      d = smax(d, x * c.m[0] + y * c.m[1] + z * c.m[2] - c.c + 0.08 * pits(p), 0.12);
    return d;
  };
  const gradOf =
    (f: Field) =>
    (p: Vec3): V => {
      const e = 0.05;
      return norm([
        f([p[0] + e, p[1], p[2]]) - f([p[0] - e, p[1], p[2]]),
        f([p[0], p[1] + e, p[2]]) - f([p[0], p[1] - e, p[2]]),
        f([p[0], p[1], p[2] + e]) - f([p[0], p[1], p[2] - e]),
      ]);
    };
  const surfaceOf =
    (f: Field) =>
    (dir: Vec3): V => {
      const d = norm(dir);
      let lo = 0;
      let hi = 9;
      for (let i = 0; i < 40; i++) {
        const t = (lo + hi) / 2;
        if (f([CORE[0] + d[0] * t, CORE[1] + d[1] * t, CORE[2] + d[2] * t]) < 0) lo = t;
        else hi = t;
      }
      return [CORE[0] + d[0] * lo, CORE[1] + d[1] * lo, CORE[2] + d[2] * lo];
    };
  const bodySurface = surfaceOf(body);
  const bodyGrad = gradOf(body);
  const craters: Crater[] = Array.from({ length: 9 }, (_, i) => {
    const a = rng.range(0, Math.PI * 2);
    const up = i < 3 ? rng.range(0.55, 0.95) : rng.range(-0.1, 0.7);
    const s = bodySurface([
      Math.cos(a) * Math.sqrt(1 - up * up),
      Math.sin(a) * Math.sqrt(1 - up * up),
      up,
    ]);
    const n = bodyGrad(s);
    const r = i < 2 ? rng.range(1.3, 1.9) : rng.range(0.45, 1.0);
    return {
      centre: [s[0] + n[0] * r * 0.6, s[1] + n[1] * r * 0.6, s[2] + n[2] * r * 0.6],
      r,
    };
  });
  const field: Field = (p) => {
    let d = body(p);
    for (const c of craters) {
      // Raised rim: a radial bump that displaces the surface itself (a torus in the tangent
      // plane floats off convex slopes), then the bowl: a smooth-subtracted sphere.
      const ds = len(p[0] - c.centre[0], p[1] - c.centre[1], p[2] - c.centre[2]);
      const u = (ds - c.r * 1.05) / (c.r * 0.28);
      if (u > -3 && u < 3) d -= c.r * 0.16 * Math.exp(-u * u);
      d = smax(d, -(ds - c.r), c.r * 0.3);
    }
    return d;
  };
  return { field, craters, gradient: gradOf(field), surface: surfaceOf(field) };
}

/** One faceted crystal, base at the origin growing up +Z: hexagonal prism with a pointed tip. */
const crystal = (r: number, h: number, segments: number): Mesh =>
  lathe({
    profile: [
      [r * 0.7, -0.35],
      [r, 0],
      [r * 0.95, h * 0.75],
      [0, h],
    ],
    segments,
    color: CRYSTAL,
    creaseDeg: 20,
  });

function asteroidVariant(
  name: string,
  seed: number,
  size: V,
  description: string,
  /** Measured per seed (SDF triangle counts follow the surface area), headroom ≤ 20%. */
  triangles: readonly [number, number, number],
): Asset {
  return defineAsset({
    name,
    kind: 'prop',
    description,
    tags: ['sci-fi', 'asteroid', 'rock', 'mining', 'sdf'],
    license: 'CC0-1.0',
    seed,
    sources: [
      'https://www.esa.int/Science_Exploration/Space_Science/Rosetta/Debris_of_the_Solar_System_Asteroids',
      'https://starlust.org/what-are-the-different-types-of-asteroids',
    ],
    budget: { triangles },
    glow: [{ parts: ['ore_crystals'], color: CRYSTAL, strength: 5 }],
    build(ctx) {
      const s = shape(ctx, size);
      const veins = valueNoise(ctx.rng.fork('veins'), { scale: 1.9, octaves: 2 });
      const tone = valueNoise(ctx.rng.fork('tone'), { scale: 1.2, octaves: 3 });
      // Mining points: cluster sites on the upper half, away from the two big craters.
      const pick = ctx.rng.fork('clusters');
      const sites = Array.from({ length: 4 }, () => {
        const a = pick.range(0, Math.PI * 2);
        const up = pick.range(0.05, 0.75);
        const p = s.surface([
          Math.cos(a) * Math.sqrt(1 - up * up),
          Math.sin(a) * Math.sqrt(1 - up * up),
          up,
        ]);
        return { p, n: s.gradient(p) };
      });
      const color = (p: Vec3, n: Vec3): Vec3 => {
        let near = 99;
        for (const site of sites)
          near = Math.min(near, len(p[0] - site.p[0], p[1] - site.p[1], p[2] - site.p[2]));
        let c = mix(ROCK, ROCK_LIGHT, step(-0.25, 0.35, tone(p)));
        c = mix(c, DUST, step(0.55, 0.85, n[2]) * 0.8);
        const vein = 1 - step(0.018, 0.05, Math.abs(veins(p)));
        c = mix(c, near < 2.4 ? CRYSTAL_TINT : ORE, vein);
        c = mix(c, CRYSTAL_TINT, (1 - step(0.6, 1.6, near)) * 0.7);
        for (const cr of s.craters) {
          const d = len(p[0] - cr.centre[0], p[1] - cr.centre[1], p[2] - cr.centre[2]);
          c = mix(c, CRATER, (1 - step(cr.r * 0.8, cr.r * 1.2, d)) * 0.85);
        }
        return c;
      };
      const ext = Math.max(...size) + 3.2;
      const rock = sdf({
        field: s.field,
        bounds: [
          [-ext, -ext, 0],
          [ext, ext, CORE[2] + size[2] + 2.2],
        ],
        resolution: ctx.pick([0.17, 0.38, 0.95]),
        color,
        lipschitz: 2,
        strip: 'plain',
      });
      ctx.part(
        'rock',
        ctx.lod < 2
          ? bakeAo(rock, {
              samples: ctx.pick([16, 8, 0]),
              radius: 1.5,
              strength: 0.55,
              ground: true,
            })
          : rock,
      );

      // Crystal clusters: 7 / 4 / 1 shards per site, sunk 0.3 m into the rock along its normal.
      const shards = ctx.pick([11, 5, 1]);
      const seg = ctx.pick([6, 6, 4]);
      const grow = ctx.rng.fork('shards');
      const out: Mesh[] = [];
      sites.forEach((site, i) => {
        for (let k = 0; k < shards; k++) {
          const jitter = k === 0 ? 0 : 0.6;
          const n = norm([
            site.n[0] + grow.range(-jitter, jitter),
            site.n[1] + grow.range(-jitter, jitter),
            site.n[2] + grow.range(-jitter, jitter) * 0.5,
          ]);
          const off: V =
            k === 0
              ? [0, 0, 0]
              : [grow.range(-0.5, 0.5), grow.range(-0.5, 0.5), grow.range(-0.3, 0.3)];
          const base = s.surface([
            site.p[0] + off[0] - CORE[0],
            site.p[1] + off[1] - CORE[1],
            site.p[2] + off[2] - CORE[2],
          ]);
          const r = k === 0 ? 0.3 : grow.range(0.1, 0.22);
          const h = k === 0 ? 1.9 : grow.range(0.6, 1.4);
          out.push(
            place(crystal(r, h, seg), {
              at: base,
              yaw: Math.atan2(n[1], n[0]),
              pitch: Math.acos(Math.max(-1, Math.min(1, n[2]))),
            }),
          );
        }
        ctx.socket(`mine_point_${i}`, {
          kind: 'interact',
          at: [
            site.p[0] + site.n[0] * 0.8,
            site.p[1] + site.n[1] * 0.8,
            site.p[2] + site.n[2] * 0.8,
          ],
          dir: [-site.n[0], -site.n[1], -site.n[2]],
          data: { resource: 'crystal', yield: 120 },
        });
      });
      ctx.part('ore_crystals', merge(out));
      const top = s.surface([0, 0, 1]);
      ctx.emitter('dust', {
        kind: 'dust',
        at: [top[0], top[1], top[2] + 0.2],
        rate: 30,
        life: 2.5,
        size: [0.2, 1.2],
        speed: 1.5,
        spreadDeg: 70,
        when: 'event',
      });
    },
  });
}

export const asteroid = asteroidVariant(
  'asteroid',
  1,
  [5.0, 3.8, 3.0],
  'Mineable ~10 m asteroid: SDF rock with craters, ore veins and glowing crystal clusters',
  [24000, 5200, 760],
);
export const asteroid_b = asteroidVariant(
  'asteroid_b',
  2,
  [4.2, 4.0, 3.3],
  'Rounder asteroid variant (seed 2) with craters, ore veins and crystal clusters',
  [21500, 4800, 670],
);
export const asteroid_c = asteroidVariant(
  'asteroid_c',
  3,
  [5.6, 3.2, 2.6],
  'Elongated asteroid shard variant (seed 3) with craters, ore veins and crystal clusters',
  [24500, 5300, 750],
);
