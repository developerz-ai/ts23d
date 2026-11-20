// The sword: an arming sword standing point-up, its flat toward the viewer's side (the edge leads
// the knuckles, as a hand holds it): a 5 cm blade with bevels and a fuller over two thirds of its
// length, tapering to the point; a forged cross with flared quillons; a cord-bound leather grip
// between two risers; a scent-stopper pommel with its peen block. Built round the grip centre the
// hand reports. Wear: nicks along both edges, grey patina and old rust blooms in the fuller and
// near the cross, bright honed edges, tarnished brass, a grip darkened and rubbed by the hand.

import {
  type BuildContext,
  dmath,
  lathe,
  loft,
  type Mesh,
  MeshBuilder,
  type Rng,
  type StripId,
  stripRect,
  type Vec3,
  valueNoise,
} from '@developerz.ai/ts23d';
import { mix, repaint } from './shape.ts';

// Near-white tints: the metal and leather strips carry their own measured colour.
const STEEL: Vec3 = [0.92, 0.93, 0.95];
const EDGE: Vec3 = [1, 1, 1];
const PATINA: Vec3 = [0.5, 0.5, 0.52];
const RUST: Vec3 = [0.52, 0.33, 0.2];
const BRASS: Vec3 = [0.95, 0.92, 0.86];
const TARNISH: Vec3 = [0.5, 0.42, 0.3];
const LEATHER: Vec3 = [0.8, 0.74, 0.68];
const SWEAT: Vec3 = [0.24, 0.19, 0.16];
const RUBBED: Vec3 = [1, 0.95, 0.88];

export interface SwordOptions {
  /** Grip centre (the fist's centre). */
  readonly at: Vec3;
  readonly gripRadius: number;
  readonly gripLength: number;
  readonly bladeLength: number;
  readonly guardSpan: number;
  readonly rng: Rng;
}

/** Thickness of the cross where the blade's shoulders sit on it. */
export const GUARD_H = 0.018;

/** Blade half-width at `t` (0 shoulders … 1 point): a slow taper, then the point's curve. */
const halfWidth = (t: number): number => {
  if (t < 0.84) return 0.025 - 0.0085 * (t / 0.84);
  const k = (t - 0.84) / 0.16;
  return 0.0165 * Math.sqrt(Math.max(0, 1 - k * k)) + 0.0004;
};

/** A nick: where along the blade (0..1), which edge, how deep and long (metres). */
interface Nick {
  readonly t: number;
  readonly side: 1 | -1;
  readonly depth: number;
  readonly half: number;
}

/** Faceted skin over rings that share a point count: one flat face per ring edge, smooth along
 *  the length (a blade's bevels stay crisp where a smooth loft would round them). Closed: the
 *  first ring is capped flat, and each facet runs from the last ring to the `tip` point. */
function facets(
  rings: readonly (readonly Vec3[])[],
  tip: Vec3,
  color: (p: Vec3, k: number) => Vec3,
  strip: StripId,
  across: number,
): Mesh {
  const b = new MeshBuilder();
  const rect = stripRect(strip);
  const n = rings[0]?.length ?? 0;
  const z0 = rings[0]?.[0]?.[2] ?? 0;
  // The strip's V runs across the blade, centred on its axis.
  const x0 = ((rings[0]?.[0]?.[0] ?? 0) + (rings[0]?.[n / 2]?.[0] ?? 0)) / 2;
  const pt = (i: number, k: number): Vec3 => rings[i]?.[k % n] as Vec3;
  const uv = (p: Vec3): [number, number] => [
    rect.u0 + ((p[2] - z0) / rect.metres) * (rect.u1 - rect.u0),
    rect.v0 + (0.08 + 0.84 * (0.5 + (p[0] - x0) / across)) * (rect.v1 - rect.v0),
  ];
  const last = rings.length - 1;
  for (let k = 0; k < n; k++) {
    const idx: number[][] = [];
    let tipN: Vec3 = [0, 0, 1];
    for (let i = 0; i < rings.length; i++) {
      const a = pt(i, k);
      const c = pt(i, k + 1);
      const up = i < last ? pt(i + 1, k) : tip;
      const dn = pt(Math.max(0, i - 1), k);
      const e: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const l: Vec3 = [up[0] - dn[0], up[1] - dn[1], up[2] - dn[2]];
      let nx = e[1] * l[2] - e[2] * l[1];
      let ny = e[2] * l[0] - e[0] * l[2];
      let nz = e[0] * l[1] - e[1] * l[0];
      const len = dmath.hypot(nx, ny, nz) || 1;
      [nx, ny, nz] = [nx / len, ny / len, nz / len];
      tipN = [nx, ny, nz];
      const pair = [a, c].map((p, j) =>
        b.vertex({
          p,
          n: [nx, ny, nz],
          uv: uv(p),
          color: color(p, k + j),
        }),
      );
      idx.push(pair);
    }
    for (let i = 0; i < last; i++) {
      const [a = 0, c = 0] = idx[i] ?? [];
      const [d = 0, e = 0] = idx[i + 1] ?? [];
      b.quad(a, c, e, d);
    }
    // The point: this facet narrows from the last ring to one apex, on the facet's own normal.
    const [a = 0, c = 0] = idx[last] ?? [];
    const apex = b.vertex({
      p: tip,
      n: tipN,
      uv: uv(tip),
      color: color(tip, k),
    });
    b.tri(a, c, apex);
  }
  // The shoulders' flat end (sunk in the cross): a fan over the first ring, facing down the blade.
  const base = rings[0] ?? [];
  const fan = base.map((p) => b.vertex({ p, n: [0, 0, -1], uv: uv(p), color: color(p, 0) }));
  for (let k = 1; k < n - 1; k++) b.tri(fan[0] ?? 0, fan[k + 1] ?? 0, fan[k] ?? 0);
  return b.build();
}

function blade(ctx: BuildContext, base: Vec3, length: number, rng: Rng): Mesh {
  const [x, y, z] = base;
  const r = rng.fork('nicks');
  const nicks: Nick[] =
    ctx.lod === 0
      ? Array.from(
          { length: 7 },
          (_, i): Nick => ({
            t: 0.2 + 0.09 * i + r.range(-0.03, 0.03),
            side: i % 3 === 1 ? -1 : 1,
            // (Thumbnail-sized bites: at 2-4 mm they were under a pixel in the hero.)
            depth: r.range(0.004, 0.0085),
            half: r.range(0.006, 0.012),
          }),
        )
      : [];
  const count = ctx.pick([8, 3, 3]);
  const ts = new Set<number>();
  for (let i = 0; i <= count; i++) ts.add(Math.round(dmath.pow(i / count, 0.9) * 1e4) / 1e4);
  // The point's curve wants more stations than the straight taper.
  if (ctx.lod < 2) for (const t of [0.87, 0.91, 0.945, 0.97, 0.988]) ts.add(t);
  for (const n of nicks)
    for (const d of [-1, 0, 1]) ts.add(Math.round((n.t + (d * n.half) / length) * 1e4) / 1e4);
  // Stations stop short of the point: the facets close on one apex at t = 1.
  const stations = [...ts].filter((t) => t >= 0 && t < 1).sort((a, b) => a - b);
  const stain = valueNoise(rng.fork('patina'), { scale: 0.05, octaves: 3 });
  const bloom = valueNoise(rng.fork('rust'), { scale: 0.025, octaves: 2 });
  const rings = stations.map((t): Vec3[] => {
    const zz = z + length * t;
    const w = halfWidth(t);
    const cut = (side: 1 | -1): number =>
      nicks.reduce(
        (m, n) => (n.side === side && Math.abs(n.t - t) < 1e-4 ? Math.max(m, n.depth) : m),
        0,
      );
    const wp = w - Math.min(cut(1), w * 0.4);
    const wn = w - Math.min(cut(-1), w * 0.4);
    const th = Math.min(0.0027 - 0.0012 * t, w * 0.5);
    if (ctx.lod === 2)
      return [
        [x + wp, y, zz],
        [x, y + th, zz],
        [x - wn, y, zz],
        [x, y - th, zz],
      ];
    // Fuller: a third of the width, half the thickness deep, fading out by 70 % of the length.
    const f = w * 0.34;
    const d = th * 0.62 * Math.min(1, Math.max(0, (0.7 - t) / 0.08));
    const flat = w * 0.56;
    return [
      [x + wp, y, zz],
      [x + flat, y + th, zz],
      [x + f, y + th * 0.96, zz],
      [x, y + th - d, zz],
      [x - f, y + th * 0.96, zz],
      [x - flat, y + th, zz],
      [x - wn, y, zz],
      [x - flat, y - th, zz],
      [x - f, y - th * 0.96, zz],
      [x, y - (th - d), zz],
      [x + f, y - th * 0.96, zz],
      [x + flat, y - th, zz],
    ];
  });
  return facets(
    rings,
    [x, y, z + length],
    (p) => {
      const t = (p[2] - z) / length;
      const w = halfWidth(t);
      const off = Math.abs(p[0] - x) / w;
      // Honed edges stay bright; the flats keep the soft grey clouds of old polish.
      const cloud = Math.min(1, Math.max(0, stain(p) * 1.4 + 0.2));
      let c = mix(STEEL, PATINA, cloud * 0.55 * (1 - Math.max(0, off - 0.55) * 2.2));
      c = mix(c, EDGE, Math.max(0, off - 0.6) * 2.2);
      // Rust blooms only where wet sat: specks down the fuller, a stain against the cross.
      const speck = Math.min(1, Math.max(0, bloom(p) - 0.22) * 5);
      const fuller = Math.max(0, 1 - off * 2.6) * (t < 0.7 ? 0.55 : 0);
      const root = Math.max(0, 1 - t * 16);
      return mix(c, RUST, Math.min(1, fuller * speck + root * (0.35 + 0.65 * speck)) * 0.8);
    },
    'chrome',
    0.06,
  );
}

/** A ring in the plane x = const: an octagon-ish bar section, half-sizes ry × rz. */
const bar = (x: number, y: number, ry: number, rz: number, z: number, n: number): Vec3[] =>
  Array.from({ length: n }, (_, k): Vec3 => {
    const a = ((k + 0.5) / n) * Math.PI * 2;
    const sq = (v: number): number => Math.sign(v) * dmath.pow(Math.abs(v), 0.6);
    return [x, y + ry * sq(dmath.cos(a)), z + rz * sq(dmath.sin(a))];
  });

export function sword(ctx: BuildContext, o: SwordOptions): void {
  const [x, y, z] = o.at;
  const half = o.gripLength / 2;
  const R = o.gripRadius;
  const tarnish = valueNoise(o.rng.fork('brass'), { scale: 0.018, octaves: 2 });
  const brass = (rub: (p: Vec3) => number) => (p: Vec3) =>
    mix(mix(BRASS, TARNISH, Math.max(0, tarnish(p) * 0.9 + 0.45)), RUBBED, rub(p));
  // Grip: leather over a wooden core, bound with cord (ridges), a riser at each end; a slight
  // barrel so the middle fills the palm. The hand's sweat darkens it; the ends are rubbed pale.
  const turns = ctx.pick([5, 0, 0]);
  const profile: [number, number][] = [[R * 0.6, -half]];
  const barrel = (t: number): number => R * (0.9 + 0.1 * dmath.sin(Math.PI * t));
  // (The far grip is the bare barrel: its end risers are a millimetre and a half.)
  const riser = ctx.lod === 2 ? 0 : 0.0016;
  if (riser) profile.push([barrel(0) + riser, -half], [barrel(0) + riser, -half + 0.006]);
  const steps = ctx.lod === 2 ? 1 : Math.max(3, turns * 2);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ridge = turns > 0 && i % 2 === 1 ? 0.0018 : 0;
    profile.push([barrel(t) + ridge, -half + 0.007 + (o.gripLength - 0.014) * t]);
  }
  if (riser) profile.push([barrel(1) + riser, half - 0.006], [barrel(1) + riser, half]);
  profile.push([R * 0.6, half]);
  ctx.part(
    'sword_grip',
    repaint(
      lathe({
        profile,
        segments: ctx.pick([10, 6, 4]),
        color: LEATHER,
        strip: 'leather',
        at: o.at,
      }),
      (p) => {
        const d = Math.abs(p[2] - z) / half;
        // Sweat-dark where the fist holds it; the cord binding's turns stand paler, rubbed.
        const cord = Math.max(0, dmath.hypot(p[0] - x, p[1] - y) - barrel(0.5) - 0.0002) / 0.0016;
        const held = mix(SWEAT, LEATHER, Math.min(1, d * d * 0.8));
        return mix(
          mix(held, RUBBED, Math.min(1, cord) * 0.45),
          RUBBED,
          Math.max(0, d - 0.86) * 2.5,
        );
      },
    ),
  );
  // Cross: a forged bar, thick at the blade, waisted, flaring to the quillon ends, which lift
  // a little toward the blade.
  const guardZ = z + half;
  // Sunk 2 mm onto the grip's shoulder; the blade's shoulders sit 4 mm into the cross.
  const gz = guardZ + GUARD_H / 2 - 0.002;
  const span = o.guardSpan / 2;
  const cross: [number, number, number, number][] = [
    [1, 0.0075, 0.0072, 0.004],
    [0.93, 0.009, 0.0085, 0.0034],
    [0.8, 0.0066, 0.0062, 0.0022],
    [0.45, 0.0072, 0.0068, 0.0006],
    [0.2, 0.0105, 0.0088, 0],
    [0, 0.012, 0.009, 0],
  ];
  // (Far: tip, waist and centre only; the triangles saved keep the arm's belly rings.)
  const picked =
    ctx.lod === 2
      ? cross.filter((_, i) => i === 0 || i === 2 || i === 5)
      : ctx.lod > 0
        ? cross.filter((_, i) => i % 2 === 0 || i === 5)
        : cross;
  const sides = ctx.pick([8, 5, 4]);
  const stations = [
    ...picked.map(([t, ry, rz, lift]) => bar(x - span * t, y, ry, rz, gz + lift, sides)),
    ...picked
      .slice(0, -1)
      .reverse()
      .map(([t, ry, rz, lift]) => bar(x + span * t, y, ry, rz, gz + lift, sides)),
  ];
  const rubGuard = (p: Vec3): number => Math.max(0, Math.abs(p[0] - x) / span - 0.8) * 3;
  ctx.part(
    'sword_guard',
    loft({
      rings: stations,
      color: (_r, _i, p) => brass(rubGuard)(p),
      strip: 'brass',
      capStart: true,
      capEnd: true,
    }),
  );
  ctx.part('sword_blade', blade(ctx, [x, y, guardZ + GUARD_H - 0.006], o.bladeLength, o.rng));
  // Pommel: a scent-stopper turned from one piece, the tang peened over a small block under it.
  const pr = R * 1.5;
  const pz = -half;
  const pommel: [number, number][] =
    ctx.lod > 0
      ? [
          [0.0001, pz - pr * 1.9],
          [pr, pz - pr * 1.1],
          [R * 0.9, pz + 0.001],
        ]
      : [
          [0.0001, pz - pr * 2.02],
          [0.006, pz - pr * 2.02],
          [0.006, pz - pr * 1.86],
          [pr * 0.62, pz - pr * 1.8],
          [pr * 0.94, pz - pr * 1.45],
          [pr, pz - pr * 1.1],
          [pr * 0.9, pz - pr * 0.62],
          [pr * 0.66, pz - pr * 0.28],
          [R * 1.12, pz - pr * 0.12],
          [R * 1.12, pz + 0.001],
          [R * 0.6, pz + 0.001],
        ];
  const rubPommel = (p: Vec3): number =>
    Math.max(0, 1 - Math.abs(p[2] - (z + pz - pr * 1.1)) / (pr * 0.5)) * 0.7;
  ctx.part(
    'sword_pommel',
    repaint(
      lathe({
        profile: pommel,
        segments: ctx.pick([10, 6, 4]),
        color: BRASS,
        strip: 'brass',
        at: o.at,
      }),
      brass(rubPommel),
    ),
  );
}
