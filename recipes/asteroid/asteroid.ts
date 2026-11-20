// Mineable asteroid — a ~10 m rubble-pile rock for a mining game, in three seeded variants.
// A signed-distance field meshed by `sdf`: a lumpy ellipsoid (smooth-union lobes), fractal
// value-noise displacement (a fine grain octave at LOD0), a few fracture facets, impact craters
// (smooth subtract + raised rims) with boulders settled in their floors, and drill bores with
// tailings at the mining sites; then vertex colour over the regolith strip (regolith.ts):
// dark stony rock, dust on up-facing slopes, darker old crater floors, one fresh crater with
// bright ejecta rays, and soft-edged nickel-iron ore veins (M-type). Glowing crystal clusters
// mark the mining points. A free body: no flat cut — it rests on its own lowest point (sunk
// 3 cm so it touches the ground plane). +X front, Z up, metres.
//
// Engine contract: `rock` (the collider-friendly mass), `ore_crystals` (glow), interact sockets
// `mine_point_*` at each crystal cluster, `dust` emitter for mining debris.

import {
  type Asset,
  type BuildContext,
  bakeAo,
  boundsOf,
  defineAsset,
  dmath,
  type Field,
  hex,
  lathe,
  type Mesh,
  merge,
  place,
  sdf,
  translate,
  type Vec3,
  valueNoise,
} from '@developerz.ai/ts23d';
import { REGOLITH } from './regolith.ts';

// Over the near-white regolith strip: stony grey-brown (one step above carbonaceous black so the
// relief reads), paler dust, dark old crater floors, bright fresh ejecta, ochre nickel-iron ore.
const ROCK = hex('#544d46');
const ROCK_LIGHT = hex('#6c635a');
/** Space-weathered old surface: darker and redder away from fresh exposures. */
const WEATHERED = hex('#3e3833');
const DUST = hex('#867c70');
const CRATER = hex('#2e2a27');
const EJECTA = hex('#c4bba9');
const TAILINGS = hex('#a89e90');
/** Drill scars: the bore's scorched, ground-down rim. */
const SCORCH = hex('#24201e');
const ORE = hex('#b98a48');
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
const dist = (a: Vec3, b: Vec3): number => len(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
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
  /** Outward surface normal where it struck. */
  readonly n: V;
}

interface Shape {
  readonly field: Field;
  readonly craters: readonly Crater[];
  readonly gradient: (p: Vec3) => V;
  /** Surface point along a ray from the core (bisection on the field). */
  readonly surface: (dir: Vec3) => V;
  /** Half-extent of the body's bounds per axis about the core, metres. */
  readonly extent: V;
}

// The field is built about the origin; `lifted` raises it onto its own lowest point.
const CORE: V = [0, 0, 0];

/** The rock's field. Every draw comes from forks of `ctx.rng`, identical at every LOD. */
function shape(ctx: BuildContext, size: V): Shape {
  const rng = ctx.rng.fork('shape');
  const big = valueNoise(rng.fork('big'), { scale: 2.8, octaves: 4 });
  const pits = valueNoise(rng.fork('pits'), { scale: 0.8, octaves: 2 });
  // A fine grain octave where the cells can carry it (LOD0): cobble-scale lumps on the surface.
  const fine = valueNoise(rng.fork('fine'), { scale: 0.3, octaves: 2 });
  const grain = ctx.lod === 0 ? 0.05 : 0;
  // Lobes scale with the body, so an elongated variant stays elongated.
  const lobes = Array.from({ length: 3 }, () => ({
    c: [
      rng.range(-0.52, 0.52) * size[0],
      rng.range(-0.47, 0.47) * size[1],
      CORE[2] + rng.range(-0.2, 0.33) * size[2],
    ] as V,
    r: [
      rng.range(0.36, 0.56) * size[0],
      rng.range(0.42, 0.63) * size[1],
      rng.range(0.47, 0.73) * size[2],
    ] as V,
  }));
  const extent: V = [0, 1, 2].map(
    (k) =>
      Math.max(
        size[k] ?? 0,
        ...lobes.map((l) => Math.abs((l.c[k] ?? 0) - (CORE[k] ?? 0)) + (l.r[k] ?? 0)),
      ) + 1.1,
  ) as V;
  // Fracture planes: a few half-spaces that facet the lumps (reaching far, so they chip rather
  // than square off the sides).
  const chips = Array.from({ length: 7 }, () => {
    const a = rng.range(0, Math.PI * 2);
    const up = rng.range(-0.2, 0.9);
    const m = norm([
      dmath.cos(a) * Math.sqrt(1 - up * up),
      dmath.sin(a) * Math.sqrt(1 - up * up),
      up,
    ]);
    const reach = Math.abs(m[0]) * size[0] + Math.abs(m[1]) * size[1] + Math.abs(m[2]) * size[2];
    return { m, c: reach * rng.range(0.75, 0.9) };
  });
  const body = (p: Vec3): number => {
    let d = ellipsoid(p, CORE, size);
    for (const l of lobes) d = smin(d, ellipsoid(p, l.c, l.r), 1.0);
    d += 0.65 * big(p) + 0.12 * pits(p) + grain * fine(p);
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
      let hi = 16;
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
      dmath.cos(a) * Math.sqrt(1 - up * up),
      dmath.sin(a) * Math.sqrt(1 - up * up),
      up,
    ]);
    const n = bodyGrad(s);
    const r = i < 2 ? rng.range(1.3, 1.9) : rng.range(0.45, 1.0);
    return {
      centre: [s[0] + n[0] * r * 0.6, s[1] + n[1] * r * 0.6, s[2] + n[2] * r * 0.6],
      r,
      n,
    };
  });
  // Boulders settled in the floors of the larger craters (ejecta that fell back).
  const settled: { c: V; r: number }[] = [];
  craters.forEach((cr, i) => {
    if (cr.r < 0.8) return;
    const t1 = norm(Math.abs(cr.n[2]) < 0.9 ? [-cr.n[1], cr.n[0], 0] : [1, 0, 0]);
    const t2: V = [
      cr.n[1] * t1[2] - cr.n[2] * t1[1],
      cr.n[2] * t1[0] - cr.n[0] * t1[2],
      cr.n[0] * t1[1] - cr.n[1] * t1[0],
    ];
    for (let k = 0; k < (i < 2 ? 5 : 3); k++) {
      const a = rng.range(0, Math.PI * 2);
      const u = rng.range(0, 0.55) * cr.r;
      const q: V = [
        cr.centre[0] - cr.n[0] * cr.r + (t1[0] * dmath.cos(a) + t2[0] * dmath.sin(a)) * u,
        cr.centre[1] - cr.n[1] * cr.r + (t1[1] * dmath.cos(a) + t2[1] * dmath.sin(a)) * u,
        cr.centre[2] - cr.n[2] * cr.r + (t1[2] * dmath.cos(a) + t2[2] * dmath.sin(a)) * u,
      ];
      // Onto the bowl (the crater sphere), then half its radius out into the crater.
      const o = norm([q[0] - cr.centre[0], q[1] - cr.centre[1], q[2] - cr.centre[2]]);
      const rb = rng.range(0.16, 0.42) * Math.min(1, cr.r);
      settled.push({
        c: [
          cr.centre[0] + o[0] * (cr.r - rb * 0.45),
          cr.centre[1] + o[1] * (cr.r - rb * 0.45),
          cr.centre[2] + o[2] * (cr.r - rb * 0.45),
        ],
        r: rb,
      });
    }
  });
  const field: Field = (p) => {
    let d = body(p);
    for (const c of craters) {
      // Raised rim: a radial bump that displaces the surface itself (a torus in the tangent
      // plane floats off convex slopes), then the bowl: a smooth-subtracted sphere.
      const ds = len(p[0] - c.centre[0], p[1] - c.centre[1], p[2] - c.centre[2]);
      const u = (ds - c.r * 1.05) / (c.r * 0.28);
      if (u > -3 && u < 3) d -= c.r * 0.16 * dmath.exp(-u * u);
      d = smax(d, -(ds - c.r), c.r * 0.3);
    }
    for (const b of settled) {
      const db = len(p[0] - b.c[0], p[1] - b.c[1], p[2] - b.c[2]) - b.r + 0.06 * pits(p);
      d = smin(d, db, 0.08);
    }
    return d;
  };
  return { field, craters, gradient: gradOf(field), surface: surfaceOf(field), extent };
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
    // Lit from inside but still cyan with readable facets (5 clipped them to flat white-cyan).
    glow: [{ parts: ['ore_crystals'], color: CRYSTAL, strength: 0.8 }],
    build(ctx) {
      const s = shape(ctx, size);
      const veins = valueNoise(ctx.rng.fork('veins'), { scale: 1.9, octaves: 2 });
      // Ore veins are fault fillings: a few sheets through the body, bent by noise, so they run
      // straight across craters (an iso-line of 3D noise rings every crater bowl it meets).
      const vr = ctx.rng.fork('vein-planes');
      // The first sheet contains the hero camera's line of sight (az −35°, el 18°), so it runs
      // across the face the lens sees instead of round the limb.
      const lens: V = norm([0.78, -0.55, 0.31]);
      const e1 = norm([-lens[1], lens[0], 0]);
      const e2: V = [
        lens[1] * e1[2] - lens[2] * e1[1],
        lens[2] * e1[0] - lens[0] * e1[2],
        lens[0] * e1[1] - lens[1] * e1[0],
      ];
      const sheets = Array.from({ length: 4 }, (_, i) => {
        const a = vr.range(0, Math.PI * 2);
        const up = vr.range(-0.6, 0.6);
        const m: V =
          i === 0
            ? norm([
                e1[0] * dmath.cos(a) + e2[0] * dmath.sin(a),
                e1[1] * dmath.cos(a) + e2[1] * dmath.sin(a),
                e1[2] * dmath.cos(a) + e2[2] * dmath.sin(a),
              ])
            : norm([
                dmath.cos(a) * Math.sqrt(1 - up * up),
                dmath.sin(a) * Math.sqrt(1 - up * up),
                up,
              ]);
        return { m, o: vr.range(-0.35, 0.35) * Math.min(size[0], size[1], size[2]) };
      });
      const veinDist = (p: Vec3): number => {
        // One bend for every sheet at this point: the noise is the costly part.
        const bend = 0.55 * veins(p);
        let d = 99;
        for (const v of sheets)
          d = Math.min(d, Math.abs(p[0] * v.m[0] + p[1] * v.m[1] + p[2] * v.m[2] - v.o + bend));
        return d;
      };
      const tone = valueNoise(ctx.rng.fork('tone'), { scale: 1.2, octaves: 3 });
      const rays = valueNoise(ctx.rng.fork('rays'), { scale: 0.6, octaves: 2 });
      // Mining points: cluster sites on the upper half, away from the two big craters.
      const pick = ctx.rng.fork('clusters');
      const sites = Array.from({ length: 4 }, () => {
        const a = pick.range(0, Math.PI * 2);
        const up = pick.range(0.05, 0.75);
        const p = s.surface([
          dmath.cos(a) * Math.sqrt(1 - up * up),
          dmath.sin(a) * Math.sqrt(1 - up * up),
          up,
        ]);
        return { p, n: s.gradient(p) };
      });
      const mine = workings(s, sites, ctx.rng.fork('drills'));
      // The youngest impact: the mid-sized crater facing the hero camera, its floor fresh and its
      // ejecta rayed out, so the age contrast shows in hero.png.
      const facing = (c: Crater): number => c.n[0] * lens[0] + c.n[1] * lens[1] + c.n[2] * lens[2];
      const fresh = s.craters
        .filter((c) => c.r < 1.2)
        .reduce<Crater | undefined>((a, c) => (!a || facing(c) > facing(a) ? c : a), undefined);
      const color = (p: Vec3, n: Vec3): Vec3 => {
        let near = 99;
        for (const site of sites)
          near = Math.min(near, len(p[0] - site.p[0], p[1] - site.p[1], p[2] - site.p[2]));
        // LOD2's 1.5 m cells are drawn one flat colour a triangle: metre-scale tone noise and
        // ejecta rays there make a checkerboard, so it keeps only the broad colour blocks.
        const far = ctx.lod === 2;
        const t = far ? 0 : tone(p);
        let c = mix(ROCK, ROCK_LIGHT, step(-0.25, 0.35, t));
        // Old surfaces space-weather dark; only near the fresh impact is the rock still bright.
        const young = fresh ? 1 - step(fresh.r * 1.6, fresh.r * 4, dist(p, fresh.centre)) : 0;
        c = mix(c, WEATHERED, (1 - young) * (far ? 0.45 : step(-0.4, 0.5, -t) * 0.8));
        c = mix(c, DUST, step(0.55, 0.85, n[2]) * 0.8);
        // Veins: a core with a halo three to four LOD0 cells wide (the contact sheet draws one
        // flat colour per triangle, so a hard band edge stair-steps along the cell grid). LOD2
        // keeps the bands as soft blocks over its 1.5 m cells, so the colour read survives.
        const vd = veinDist(p);
        const vein = !far ? (1 - step(0.1, 0.8, vd)) * 0.85 : (1 - step(0.3, 1.0, vd)) * 0.5;
        c = mix(c, near < 2.4 ? CRYSTAL_TINT : ORE, vein);
        // Cyan deposit round each crystal site: a crusted patch with an edge, not a haze.
        c = mix(c, CRYSTAL_TINT, (1 - step(0.95, 1.35, near + (far ? 0 : 0.35 * rays(p)))) * 0.85);
        // Tailings: crushed, paler regolith spread round each working.
        c = mix(c, TAILINGS, (1 - step(1.3, 2.4, near + 0.4 * t)) * 0.7);
        // Drill scars: a scorched ring round every bore.
        c = mix(c, SCORCH, (1 - step(0.2, 0.45, mine.scar(p))) * 0.9);
        for (const cr of s.craters) {
          if (cr === fresh) continue;
          c = mix(c, CRATER, (1 - step(cr.r * 0.8, cr.r * 1.2, dist(p, cr.centre))) * 0.9);
        }
        if (fresh) c = mix(c, EJECTA, ejecta(p, fresh, rays, far));
        // LOD2 carries no baked AO: darken to LOD0's mean so the switch does not pop lighter.
        return ctx.lod === 2 ? [c[0] * 0.84, c[1] * 0.84, c[2] * 0.84] : c;
      };
      const ext = s.extent;
      const raw = sdf({
        field: mine.field,
        bounds: [
          [CORE[0] - ext[0], CORE[1] - ext[1], CORE[2] - ext[2]],
          [CORE[0] + ext[0], CORE[1] + ext[1], CORE[2] + ext[2]],
        ],
        resolution: ctx.pick([0.2, 0.85, 1.5]),
        color,
        lipschitz: 2,
        strip: REGOLITH,
      });
      // A free body resting on its own lowest vertex at this LOD, sunk 3 cm into the ground plane.
      const lift = -0.03 - boundsOf(raw).min[2];
      const up = (p: Vec3): V => [p[0], p[1], p[2] + lift];
      const rock = translate(merge([raw, ...(ctx.lod < 2 ? [mine.rubble(ctx.lod)] : [])]), [
        0,
        0,
        lift,
      ]);
      ctx.part(
        'rock',
        ctx.lod < 2
          ? bakeAo(rock, {
              samples: ctx.pick([16, 8, 0]),
              radius: 1.5,
              strength: 0.45,
              ground: false,
            })
          : rock,
      );

      // Crystal clusters: 11 / 3 / 1 shards per site, sunk 0.3 m into the rock along its normal.
      const shards = ctx.pick([11, 3, 1]);
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
              at: up(base),
              yaw: dmath.atan2(n[1], n[0]),
              pitch: dmath.acos(Math.max(-1, Math.min(1, n[2]))),
            }),
          );
        }
        const at = up(site.p);
        ctx.socket(`mine_point_${i}`, {
          kind: 'interact',
          at: [at[0] + site.n[0] * 0.8, at[1] + site.n[1] * 0.8, at[2] + site.n[2] * 0.8],
          dir: [-site.n[0], -site.n[1], -site.n[2]],
          data: { resource: 'crystal', yield: 120 },
        });
      });
      ctx.part('ore_crystals', merge(out));
      const top = up(s.surface([0, 0, 1]));
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

/** Ejecta weight 0..1 round a fresh crater: a bright floor, rim and blanket, rays out to ~6 r. */
function ejecta(p: Vec3, cr: Crater, rays: (p: Vec3) => number, far: boolean): number {
  const v: V = [p[0] - cr.centre[0], p[1] - cr.centre[1], p[2] - cr.centre[2]];
  const d = len(v[0], v[1], v[2]);
  if (d > cr.r * 6) return 0;
  const t1 = norm(Math.abs(cr.n[2]) < 0.9 ? [-cr.n[1], cr.n[0], 0] : [1, 0, 0]);
  const t2: V = [
    cr.n[1] * t1[2] - cr.n[2] * t1[1],
    cr.n[2] * t1[0] - cr.n[0] * t1[2],
    cr.n[0] * t1[1] - cr.n[1] * t1[0],
  ];
  const ang = dmath.atan2(
    v[0] * t2[0] + v[1] * t2[1] + v[2] * t2[2],
    v[0] * t1[0] + v[1] * t1[1] + v[2] * t1[2],
  );
  const ray = dmath.pow(
    Math.max(0, dmath.cos(7 * ang + 1.6 * dmath.sin(3 * ang) + 0.8 * rays(p))),
    2,
  );
  const bowl = 1 - step(cr.r * 0.9, cr.r * 1.5, d);
  // A bright blanket out to ~2 r, then rays fading out to ~6 r.
  const blanket = 1 - step(cr.r * 1.2, cr.r * 1.9, d);
  const fade = 1 - step(cr.r * 1.2, cr.r * 6, d);
  // Far LOD: bowl and blanket only (rays one flat triangle wide would checker).
  return Math.min(0.95, 0.9 * bowl + 0.45 * blanket + (far ? 0 : ray * fade * 0.8));
}

/**
 * The mining workings at each crystal site: three drill bores sunk into the rock beside it (cut
 * from the field) and a heap of broken tailings lumps on the surface below them.
 */
function workings(
  s: Shape,
  sites: readonly { p: V; n: V }[],
  rng: { range: (a: number, b: number) => number },
): { field: Field; rubble: (lod: number) => Mesh; scar: (p: Vec3) => number } {
  const bores: { a: V; b: V }[] = [];
  const lumps: { c: V; r: number; turn: V; stretch: V }[] = [];
  for (const site of sites) {
    const t1 = norm(Math.abs(site.n[2]) < 0.9 ? [-site.n[1], site.n[0], 0] : [1, 0, 0]);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + rng.range(-0.4, 0.4);
      const t2: V = [
        site.n[1] * t1[2] - site.n[2] * t1[1],
        site.n[2] * t1[0] - site.n[0] * t1[2],
        site.n[0] * t1[1] - site.n[1] * t1[0],
      ];
      const off = rng.range(0.75, 1.1);
      const q = s.surface([
        site.p[0] + (t1[0] * dmath.cos(a) + t2[0] * dmath.sin(a)) * off - CORE[0],
        site.p[1] + (t1[1] * dmath.cos(a) + t2[1] * dmath.sin(a)) * off - CORE[1],
        site.p[2] + (t1[2] * dmath.cos(a) + t2[2] * dmath.sin(a)) * off - CORE[2],
      ]);
      const n = s.gradient(q);
      bores.push({
        a: [q[0] + n[0] * 0.4, q[1] + n[1] * 0.4, q[2] + n[2] * 0.4],
        b: [q[0] - n[0] * 0.9, q[1] - n[1] * 0.9, q[2] - n[2] * 0.9],
      });
      // Tailings: lumps of spoil heaped on the surface just past each bore.
      for (let j = 0; j < 3; j++) {
        const g = s.surface([
          q[0] + (t1[0] * dmath.cos(a) + t2[0] * dmath.sin(a)) * (0.5 + 0.25 * j) - CORE[0],
          q[1] + (t1[1] * dmath.cos(a) + t2[1] * dmath.sin(a)) * (0.5 + 0.25 * j) - CORE[1],
          q[2] + (t1[2] * dmath.cos(a) + t2[2] * dmath.sin(a)) * (0.5 + 0.25 * j) - CORE[2],
        ]);
        // Orientation and stretch hashed from the position, not drawn: extra draws here would
        // move every later bore (and the rock's triangle count with it).
        const h = (k: number): number => {
          const x =
            dmath.sin(g[0] * 12.9898 + g[1] * 78.233 + g[2] * 37.719 + k * 4.1) * 43758.5453;
          return x - Math.floor(x);
        };
        lumps.push({
          c: g,
          r: rng.range(0.1, 0.2) * 1.15,
          turn: [h(1) * 6.3, h(2) * 6.3, h(3) * 6.3],
          stretch: [0.7 + 0.7 * h(4), 0.6 + 0.6 * h(5), 0.5 + 0.5 * h(6)],
        });
      }
    }
  }
  const capsule = (p: Vec3, a: V, b: V): number => {
    const ab: V = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ap: V = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    const t = Math.max(
      0,
      Math.min(
        1,
        (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) /
          (ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2]),
      ),
    );
    return len(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t);
  };
  const field: Field = (p) => {
    let d = s.field(p);
    for (const b of bores) d = smax(d, -(capsule(p, b.a, b.b) - 0.14), 0.05);
    return d;
  };
  /** Distance to the nearest bore axis, m (the scorch ring is painted from it). */
  const scar = (p: Vec3): number => {
    let d = 99;
    for (const b of bores) d = Math.min(d, capsule(p, b.a, b.b));
    return d;
  };
  // Spoil chips: an off-centre, lopsided double cone turned at random and stretched per axis, so
  // each reads as an irregular broken chip, not a little block (5 / 4 sides, hard creases).
  const rubble = (lod: number): Mesh =>
    merge(
      lumps.map((l) =>
        place(
          lathe({
            profile: [
              [0.0001, -l.r * 0.45],
              [l.r, -l.r * 0.05],
              [l.r * 0.55, l.r * 0.35],
              [0.0001, l.r * 0.55],
            ],
            segments: lod === 0 ? 5 : 4,
            color: TAILINGS,
            creaseDeg: 15,
            strip: REGOLITH,
          }),
          { at: l.c, yaw: l.turn[0], pitch: l.turn[1], roll: l.turn[2], scale: l.stretch },
        ),
      ),
    );
  return { field, rubble, scar };
}

export const asteroid = asteroidVariant(
  'asteroid',
  1,
  [5.0, 3.8, 3.0],
  'Mineable ~10 m asteroid: SDF rock with craters, ore veins and glowing crystal clusters',
  [21500, 3700, 420],
);
export const asteroid_b = asteroidVariant(
  'asteroid_b',
  2,
  [4.2, 4.0, 3.3],
  'Rounder asteroid variant (seed 2) with craters, ore veins and crystal clusters',
  [20500, 3600, 380],
);
export const asteroid_c = asteroidVariant(
  'asteroid_c',
  3,
  [6.6, 3.0, 2.5],
  'Elongated asteroid shard variant (seed 3) with craters, ore veins and crystal clusters',
  [22500, 3750, 420],
);
