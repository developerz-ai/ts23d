// Field finish for the WW2 tanks (T-34 here, Tiger I imports it): the matte armour paint as a
// project material (sparse chips instead of the library strip's even spatter), true-scale UVs for
// it, measured wear through `weather()` (chips on plate edges, road dust on top plates, dried mud
// up from the ground, rust running down from fittings), radial mud for spinning wheels and the
// worn-steel track link. Pure UV / vertex-colour work on finished meshes: shape stays in the recipe.

import {
  type BuildContext,
  defineMaterial,
  dmath,
  hex,
  type Mesh,
  merge,
  planar,
  type Rng,
  type StripId,
  stripRect,
  type Vec3,
  type WeatherEffects,
  weather,
} from '@developerz.ai/ts23d';

/** Dried mud and road dust: lighter than any of the paints, so it reads at hero distance. */
export const EARTH: Vec3 = hex('#8f7a5a');
/** Wet mud, low on the running gear. */
export const WET_MUD: Vec3 = hex('#3b2e21');
/** What a chip or a rubbed edge shows: steel gone dull, a touch warm. */
export const WORN_STEEL: Vec3 = hex('#8f8a80');

const PAINT_V = 0.5;

/**
 * Matte military paint over rolled armour (vertex colour = the paint). The library's
 * `steel_painted` chips a fifth of the film in even 5 cm dots; a tank's plates chip at their edges
 * (that is `weather()` here), so the film itself keeps only a few flakes and some rust runs.
 */
export const ARMOUR_PAINT = defineMaterial({
  id: 'armour_paint',
  kind: 'metal',
  scaleMetres: PAINT_V,
  roughness: 0.5,
  metalness: 1,
  albedo: '#eeeeee',
  albedo2: '#4b3526',
  params: {
    paint: 1,
    paintRough: 0.66,
    chips: 0.08,
    cast: 0.35,
    streaks: 0.25,
    relief: 1,
    film: 0.0005,
    cavity: 0.7,
    cavityRough: 0.15,
    cavityRadius: 0.008,
  },
  description:
    'Matte armour paint on rolled steel plate (vertex colour = paint): few flakes, faint rust runs.',
  sources: ['https://physicallybased.info (iron, paint film roughness)'],
});

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const same = (m: Mesh, i: number, c: Vec3): boolean =>
  [0, 1, 2].every((k) => Math.abs((m.colors[i * 3 + k] ?? 0) - (c[k] ?? 0)) < 1e-4);

/**
 * Put every triangle authored in one of `paints` onto `strip` at true scale: box projection by the
 * face normal's dominant axis, V squeezed only when a triangle is taller than one band (so V never
 * wraps inside it). Needs unwelded triangles (as `tessellate` emits); run it before the wear.
 */
export function paintOn(
  m: Mesh,
  paints: readonly Vec3[],
  strip: StripId = ARMOUR_PAINT,
  vm = PAINT_V,
): Mesh {
  const uvs = new Float32Array(m.uvs);
  const r = stripRect(strip);
  const half = 0.5 / 4096;
  const P = m.positions;
  const at = (i: number, k: number): number => P[i * 3 + k] ?? 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const ids = [m.indices[t] ?? 0, m.indices[t + 1] ?? 0, m.indices[t + 2] ?? 0];
    const [a = 0, b = 0, c = 0] = ids;
    if (!paints.some((p) => same(m, a, p))) continue;
    const e1 = [0, 1, 2].map((k) => at(b, k) - at(a, k));
    const e2 = [0, 1, 2].map((k) => at(c, k) - at(a, k));
    const nx = Math.abs((e1[1] ?? 0) * (e2[2] ?? 0) - (e1[2] ?? 0) * (e2[1] ?? 0));
    const ny = Math.abs((e1[2] ?? 0) * (e2[0] ?? 0) - (e1[0] ?? 0) * (e2[2] ?? 0));
    const nz = Math.abs((e1[0] ?? 0) * (e2[1] ?? 0) - (e1[1] ?? 0) * (e2[0] ?? 0));
    const [ku, kv] = nz >= Math.max(nx, ny) ? [0, 1] : nx >= ny ? [1, 2] : [0, 2];
    const vs = ids.map((i) => at(i, kv));
    const base = Math.floor(Math.min(...vs) / vm) * vm;
    const span = Math.max(...vs) - base;
    const k = span > vm ? vm / span : 1;
    for (const i of ids) {
      const f = ((at(i, kv) - base) / vm) * k;
      uvs[i * 2] = r.u0 + (at(i, ku) / r.metres) * (r.u1 - r.u0);
      uvs[i * 2 + 1] = r.v0 + half + Math.min(1, f) * (r.v1 - r.v0 - 2 * half);
    }
  }
  return { ...m, uvs };
}

export interface FieldWear {
  readonly name: string;
  readonly seed: number;
  /** Longest edge after tessellation per LOD (m): chips and mud need vertices. */
  readonly resolution: readonly [number, number, number];
  /** Mud climbs this far above z = 0 (omit for parts riding high in their own space). */
  readonly mud?: number;
  /** Fraction of the mud band covered. Default 0.7. */
  readonly mudAmount?: number;
  /** Road dust on what faces the sky: a soft haze (0..1), thicker in `noise`'s patches. */
  readonly dust?: number;
  readonly noise?: (p: Vec3) => number;
  /** World offset of a part authored round its own pivot (dust noise only). */
  readonly at?: Vec3;
  readonly chips?: number;
  /** What the chips show. Default worn steel. */
  readonly under?: Vec3;
  /** Rust runs down from these spots (bolts, brackets, hinges), target space. */
  readonly rustFrom?: readonly { at: Vec3; radius: number }[];
}

/**
 * Measured field wear over meshes that share a space (coverage lands in the manifest, QA `weather`
 * gates it): plate edges rubbed to steel, dust on what faces the sky, dried mud from the ground
 * up, rust streaking down from fittings. Far LOD keeps the masks on its own corners.
 */
export function fieldWear<K extends string>(
  ctx: BuildContext,
  meshes: Readonly<Record<K, Mesh>>,
  o: FieldWear,
): Record<K, Mesh> {
  const effects: WeatherEffects = {
    chips: { where: 'convex-edges', amount: o.chips ?? 0.4, strength: 0.8 },
    ...(o.mud
      ? {
          mud: {
            where: 'ground-near',
            amount: o.mudAmount ?? 0.7,
            color: EARTH,
            strength: 0.9,
          },
        }
      : {}),
    ...(o.rustFrom?.length && ctx.lod === 0
      ? {
          rust: {
            where: 'fasteners | below-fasteners',
            amount: 0.5,
            streaks: true,
            streakLength: 0.45,
            strength: 0.7,
          },
        }
      : {}),
  };
  const worn = weather(ctx, meshes, {
    name: o.name,
    seed: o.seed,
    resolution: o.resolution,
    ground: 0,
    ...(o.mud ? { groundBand: o.mud } : {}),
    under: o.under ?? WORN_STEEL,
    ...(o.rustFrom?.length && ctx.lod === 0 ? { fasteners: o.rustFrom } : {}),
    effects,
  });
  // The far LOD has only plate corners to carry it: half strength, or whole plates go pale.
  const dust = (o.dust ?? 0) * (ctx.lod === 2 ? 0.5 : 1);
  if (dust <= 0) return worn;
  const noise = o.noise ?? (() => 0.5);
  // A haze, not patches: coverage-style dust at this vertex spacing reads as sprayed camouflage.
  const haze = (p: Vec3, n: Vec3): number =>
    dust * smooth(0.35, 0.95, n[2]) * (0.45 + 0.55 * noise(p));
  const out = {} as Record<K, Mesh>;
  for (const k of Object.keys(worn) as K[]) out[k] = tint(worn[k], EARTH, haze, o.at);
  return out;
}

/**
 * Mud on a spinning wheel (axis Y through its own origin): packed round the rim and thrown into
 * the dish, the same all the way round, so it turns with the wheel instead of sliding over it
 * (height-based mud would stay put while the wheel spins through it).
 */
export function wheelMud(
  m: Mesh,
  r: number,
  noise: (p: Vec3) => number,
  strength = 0.85,
  earth: Vec3 = EARTH,
): Mesh {
  const colors = new Float32Array(m.colors);
  for (let i = 0; i < m.positions.length / 3; i++) {
    const p: Vec3 = [
      m.positions[i * 3] ?? 0,
      m.positions[i * 3 + 1] ?? 0,
      m.positions[i * 3 + 2] ?? 0,
    ];
    const rad = dmath.hypot(p[0], p[2]) / r;
    const n = noise(p);
    // Opaque where it is packed (rim, tyre, the outer dish), ragged toward the clean hub.
    const dry = strength * smooth(0.34, 0.56, rad + 0.5 * (n - 0.5));
    const wet =
      0.6 * strength * smooth(0.82, 1.0, rad) * smooth(0.4, 0.7, noise([p[2], p[1], p[0]]));
    for (let k = 0; k < 3; k++) {
      let c = colors[i * 3 + k] ?? 0;
      c += ((earth[k] ?? 0) - c) * dry;
      c += ((WET_MUD[k] ?? 0) - c) * wet;
      colors[i * 3 + k] = c;
    }
  }
  return { ...m, colors };
}

/** Move every vertex toward `to` by `w(p)` (0..1): soot, stains, a wash. */
export function tint(
  m: Mesh,
  to: Vec3,
  w: (p: Vec3, n: Vec3) => number,
  at: Vec3 = [0, 0, 0],
): Mesh {
  const colors = new Float32Array(m.colors);
  for (let i = 0; i < m.positions.length / 3; i++) {
    const k = Math.min(
      1,
      Math.max(
        0,
        w(
          [
            (m.positions[i * 3] ?? 0) + at[0],
            (m.positions[i * 3 + 1] ?? 0) + at[1],
            (m.positions[i * 3 + 2] ?? 0) + at[2],
          ],
          [m.normals[i * 3] ?? 0, m.normals[i * 3 + 1] ?? 0, m.normals[i * 3 + 2] ?? 0],
        ),
      ),
    );
    if (k <= 0) continue;
    for (let c = 0; c < 3; c++)
      colors[i * 3 + c] = (colors[i * 3 + c] ?? 0) + ((to[c] ?? 0) - (colors[i * 3 + c] ?? 0)) * k;
  }
  return { ...m, colors };
}

const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Where the ray from `o` along `d` first meets `m` (null: it misses). */
export function rayHit(m: Mesh, o: Vec3, d: Vec3): Vec3 | null {
  const at = (i: number): Vec3 => [
    m.positions[i * 3] ?? 0,
    m.positions[i * 3 + 1] ?? 0,
    m.positions[i * 3 + 2] ?? 0,
  ];
  const dot3 = (p: Vec3, q: Vec3): number => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  let best = Number.POSITIVE_INFINITY;
  for (let k = 0; k < m.indices.length; k += 3) {
    const p0 = at(m.indices[k] ?? 0);
    const e1 = sub3(at(m.indices[k + 1] ?? 0), p0);
    const e2 = sub3(at(m.indices[k + 2] ?? 0), p0);
    const h = cross3(d, e2);
    const det = dot3(e1, h);
    if (Math.abs(det) < 1e-12) continue;
    const s = sub3(o, p0);
    const bu = dot3(s, h) / det;
    const q = cross3(s, e1);
    const bv = dot3(d, q) / det;
    if (bu < -1e-6 || bv < -1e-6 || bu + bv > 1 + 1e-6) continue;
    const t = dot3(e2, q) / det;
    if (t > 0 && t < best) best = t;
  }
  return Number.isFinite(best)
    ? [o[0] + d[0] * best, o[1] + d[1] * best, o[2] + d[2] * best]
    : null;
}

/** Paint chipped to primer and rust: the dark flecks along a plate's edges. */
export const CHIP_RUST: Vec3 = hex('#3e2a1e');
/** A fresh chip: bare steel, not yet rusted. */
export const CHIP_STEEL: Vec3 = hex('#6f6a62');

/**
 * Chips where plates really chip: `count` small ragged flecks, 1.5 mm proud of the plate, crowded
 * against its edges (the distance in from the edge falls off quadratically, a few stray further).
 * `plates` are flat faces as corner loops; `inside` is any point within the solid (which way is
 * out); every corner of a fleck is dropped onto `onto` (the real surface: plates warp, corners
 * are rounded), and a fleck that runs off it is left out. Crisp at hero distance where vertex colour on a 20 cm mesh can only smudge.
 */
export function chipFlecks(
  rng: Rng,
  plates: readonly (readonly Vec3[])[],
  inside: Vec3,
  count: number,
  onto: Mesh,
  colors: readonly Vec3[] = [CHIP_RUST, CHIP_RUST, CHIP_RUST, CHIP_STEEL],
): Mesh {
  const sub = sub3;
  const crs = cross3;
  const unit = (a: Vec3): Vec3 => {
    const l = dmath.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  };
  const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const edges = plates.flatMap((pl) => {
    const cen = pl.reduce<Vec3>(
      (c, q) => [c[0] + q[0] / pl.length, c[1] + q[1] / pl.length, c[2] + q[2] / pl.length],
      [0, 0, 0],
    );
    let n = unit(crs(sub(pl[1] as Vec3, pl[0] as Vec3), sub(pl[2] as Vec3, pl[0] as Vec3)));
    if (dot(n, sub(cen, inside)) < 0) n = [-n[0], -n[1], -n[2]];
    return pl.map((a, i) => {
      const b = pl[(i + 1) % pl.length] as Vec3;
      const along = unit(sub(b, a));
      let inward = unit(crs(n, along));
      if (dot(inward, sub(cen, a)) < 0) inward = [-inward[0], -inward[1], -inward[2]];
      return { a, len: dmath.norm(sub(b, a)), along, inward, n };
    });
  });
  const total = edges.reduce((l, e) => l + e.len, 0);
  const out: Mesh[] = [];
  for (let k = 0; k < count; k++) {
    // An edge chosen by length: walk the lengths until the draw is used up.
    const draw = rng.range(0, total);
    let walked = 0;
    let e = edges[0];
    for (const edge of edges) {
      e = edge;
      walked += edge.len;
      if (walked >= draw) break;
    }
    if (!e) break;
    const t = rng.range(0.04, 0.96) * e.len;
    const u = rng.next();
    const size = rng.range(0.006, 0.02);
    const d = size + 0.004 + u * u * u * 0.22;
    const stretch = rng.range(1, 2.4);
    const sides = rng.int(4, 6);
    const turn = rng.range(0, Math.PI);
    const c: Vec3 = [
      e.a[0] + e.along[0] * t + e.inward[0] * d + e.n[0] * 0.0015,
      e.a[1] + e.along[1] * t + e.inward[1] * d + e.n[1] * 0.0015,
      e.a[2] + e.along[2] * t + e.inward[2] * d + e.n[2] * 0.0015,
    ];
    // CCW seen from outside: along × inward = ±n, so walk the angle the way that keeps +n.
    const flip = dot(crs(e.along, e.inward), e.n) > 0 ? 1 : -1;
    const back: Vec3 = [-e.n[0], -e.n[1], -e.n[2]];
    const shape = Array.from({ length: sides }, (_, i): [number, number] => {
      const ang = flip * ((i / sides) * Math.PI * 2 + turn);
      const r = size * rng.range(0.55, 1);
      return [dmath.cos(ang) * r * stretch, dmath.sin(ang) * r];
    });
    const color = rng.pick(colors);
    const points: Vec3[] = [];
    for (const [x, y] of shape) {
      const from: Vec3 = [
        c[0] + e.along[0] * x + e.inward[0] * y + e.n[0] * 0.08,
        c[1] + e.along[1] * x + e.inward[1] * y + e.n[1] * 0.08,
        c[2] + e.along[2] * x + e.inward[2] * y + e.n[2] * 0.08,
      ];
      const hit = rayHit(onto, from, back);
      // A ray that runs off the plate lands on whatever lies behind it: that is not this plate.
      if (!hit || dmath.norm(sub(hit, from)) > 0.16) continue;
      points.push([hit[0] + e.n[0] * 0.0015, hit[1] + e.n[1] * 0.0015, hit[2] + e.n[2] * 0.0015]);
    }
    if (points.length < sides) continue;
    out.push(planar({ points, color }));
  }
  return merge(out);
}

/** Soot from an exhaust mouth at `at`: densest there, rising a little and trailing back (−X). */
export const sootPlume =
  (at: Vec3, radius: number, strength: number, noise: (p: Vec3) => number) =>
  (p: Vec3): number => {
    const dx = (p[0] - at[0]) * (p[0] < at[0] ? 0.6 : 1.3);
    const dz = (p[2] - at[2]) * (p[2] > at[2] ? 0.5 : 1.2);
    const d = dmath.hypot(dx, p[1] - at[1], dz) / radius;
    return d < 1 ? strength * (1 - smooth(0.15, 1, d + 0.25 * (noise(p) - 0.5))) : 0;
  };

export const SOOT: Vec3 = hex('#1c1a18');

export interface Coat {
  /** World offset of a part authored round its own pivot. */
  readonly at?: Vec3;
  /** Road dust on what faces the sky (0..1). */
  readonly dust?: number;
  /** Dried mud climbs to about this height (m), ragged, a third higher toward the rear. */
  readonly mud?: number;
  readonly mudStrength?: number;
  readonly soot?: readonly { at: Vec3; radius: number; strength: number }[];
}

/**
 * Height-based field dirt for meshes that already carry the vertices (camouflaged plates, a
 * Zimmerit slab): a dust haze on top faces, dried earth from the ground up with a ragged edge
 * (higher behind the tracks), wet mud along the lowest third of it, soot round the exhausts.
 * `grain` is the ~0.3 m breakup, `fine` the ~0.1 m one.
 */
export function fieldCoat(
  grain: (p: Vec3) => number,
  fine: (p: Vec3) => number,
  /** Dried mud and dust colours: pick them against the paint (dark earth on a sand-yellow tank). */
  earth: Vec3 = EARTH,
  dustColor: Vec3 = EARTH,
): (m: Mesh, o: Coat) => Mesh {
  return (m, o) => {
    const at = o.at ?? [0, 0, 0];
    let out = m;
    const dust = o.dust ?? 0;
    if (dust > 0)
      out = tint(
        out,
        dustColor,
        (p, n) => dust * smooth(0.35, 0.95, n[2]) * (0.45 + 0.55 * grain(p)),
        at,
      );
    const mud = o.mud ?? 0;
    if (mud > 0) {
      const k = o.mudStrength ?? 0.85;
      const rear = (p: Vec3): number => (p[0] < 0 ? 1 + Math.min(0.35, -p[0] * 0.09) : 1);
      out = tint(
        out,
        earth,
        (p) =>
          k *
          smooth(0, 0.32, mud * rear(p) * (0.7 + 0.6 * grain(p)) - p[2]) *
          (0.65 + 0.35 * fine(p)),
        at,
      );
      out = tint(
        out,
        WET_MUD,
        (p) => 0.75 * k * smooth(0, 0.22, mud * 0.45 * rear(p) * (0.6 + 0.8 * fine(p)) - p[2]),
        at,
      );
    }
    for (const s of o.soot ?? [])
      out = tint(
        out,
        SOOT,
        (p) => {
          const dx = (p[0] - s.at[0]) * (p[0] < s.at[0] ? 0.7 : 1);
          const dz = (p[2] - s.at[2]) * (p[2] > s.at[2] ? 0.6 : 0.85);
          const d = dmath.hypot(dx, p[1] - s.at[1], dz) / s.radius;
          return d < 1 ? s.strength * (1 - smooth(0.15, 1, d + 0.25 * (grain(p) - 0.5))) : 0;
        },
        at,
      );
    return out;
  };
}
/** `valueNoise` is −1..1; the passes here take 0..1 fields. */
export const unitNoise =
  (noise: (p: Vec3) => number) =>
  (p: Vec3): number =>
    Math.min(1, Math.max(0, 0.5 + 0.5 * noise(p)));
export { smooth };
