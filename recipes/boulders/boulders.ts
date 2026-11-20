// Boulders: four weathered granite rocks in three shape families — rounded (a long-weathered
// core-stone), angular (freshly split by frost) and a slab (sheeted granite) — meshed from
// signed-distance fields (surface nets, smooth gradient normals). The weathered mass is a blocky
// core of smooth-unioned ellipsoids and a rounded box, pitted by seeded fractal noise; fracture
// planes then cut it AFTER the pitting, so split faces stay flat and their edges crisp. Each rock
// is sunk 5–10 cm (its bearing face is a section through it, not its rounded underside), sits in a
// skirt of soil with a few half-buried pebbles, and carries its age in vertex colour: damp soil
// splash at the foot, moss thick on north (+Y) faces and in hollows, pale lichen rosettes on the
// sunny tops. Granite strip: granite.ts. Resolution (cell edge, m) is the LOD knob. README.md.

import {
  type BuildContext,
  defineAsset,
  dmath,
  type Field,
  hex,
  type Mesh,
  materialVariant,
  merge,
  place,
  planar,
  sd,
  sdf,
  type Vec3,
  valueNoise,
} from '@developerz.ai/ts23d';
import { reproject, tessellate } from '../_lib/finish/finish.ts';
import { GRANITE } from './granite.ts';

// Tints over the near-white granite strip: grey granite, darker and browner at the damp foot,
// moss green on north faces and in hollows, pale crusty lichen on top.
const STONE = hex('#a8a49c');
const FOOT = hex('#6a5e50');
const MOSS = hex('#3f5a1a');
const LICHEN = hex('#d2cfa6');

type Family = 'round' | 'angular' | 'slab';

/** Length (X), width (Y), height (Z) in metres; fracture planes; how deep it sits (m). */
const ROCKS: readonly {
  size: Vec3;
  family: Family;
  cuts: number;
  sink: number;
  /** Frost cracks: fissures cut into the surface. */
  cracks: number;
}[] = [
  // A tall frost-split block standing on end, so the set is not all low domes.
  { size: [0.6, 0.5, 0.85], family: 'angular', cuts: 3, sink: 0.05, cracks: 1 },
  { size: [1.3, 0.9, 0.42], family: 'slab', cuts: 2, sink: 0.06, cracks: 1 },
  // Half-buried: an erratic settled deep into the soil (its lower half below ground).
  { size: [1.6, 1.1, 1.3], family: 'round', cuts: 1, sink: 0.55, cracks: 1 },
  { size: [2.4, 1.7, 1.1], family: 'angular', cuts: 3, sink: 0.1, cracks: 2 },
];
/** Fissure half-width at the surface and depth into the rock, m (wider than a LOD0 cell). */
const CRACK = { half: 0.045, depth: 0.12 } as const;
const CRACK_DARK = hex('#4a443c');
/** Pebble colours: mixed river and frost-shattered stones, never one uniform pale. */
const PEBBLES = [hex('#6e6a64'), hex('#8a7460'), hex('#4c4844'), hex('#9a9282'), hex('#7a6248')];
/** Grus (decomposed granite, on the sand strip): damp and dark at the rock's foot, drying to the
 * pale of the ground at the feathered edge. */
const SOIL_DAMP = hex('#6a5a48');
const SOIL_DRY = hex('#ffffff');
/** The skirt's feathered rim: the sand strip greyed toward a neutral dusty ground. */
const SOIL_EDGE = hex('#d4d2d6');
/** How far the skirt reaches past the rock's outline, m. */
const SKIRT = 0.32;

/** A plane through `at` with outward normal `n` (unit): negative behind it. */
const plane =
  (at: Vec3, n: Vec3): Field =>
  (p) =>
    (p[0] - at[0]) * n[0] + (p[1] - at[1]) * n[1] + (p[2] - at[2]) * n[2];

const unit = (v: Vec3): Vec3 => {
  const l = dmath.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const mix = (a: Vec3, b: Vec3, k: number): Vec3 => [
  a[0] + (b[0] - a[0]) * k,
  a[1] + (b[1] - a[1]) * k,
  a[2] + (b[2] - a[2]) * k,
];

/** The weathered mass before any fracture, centred on (0, y), its base at z = −sink. */
function core(ctx: BuildContext, i: number, size: Vec3, family: Family, y: number): Field {
  const rng = ctx.rng.fork(`rock-${i}`);
  const [l, w, h] = size;
  const c: Vec3 = [0, y, h * 0.45];
  if (family === 'slab') {
    // Sheeted granite: a rounded slab, its top tilted along the sheeting joint.
    const slab = sd.box([0, y, c[2]], [l, w, h], 0.12 * h);
    return sd.smoothUnion(
      0.2 * h,
      slab,
      sd.ellipsoid([l * 0.2, y - w * 0.1, h * 0.55], [l * 0.35, w * 0.4, h * 0.4]),
    );
  }
  const round = family === 'round';
  let f: Field = sd.smoothUnion(
    (round ? 0.3 : 0.12) * h,
    sd.ellipsoid(c, [l * 0.5, w * 0.5, h * 0.6]),
    sd.box(
      [c[0] + rng.range(-0.1, 0.1) * l, y, c[2] - 0.05 * h],
      round ? [l * 0.7, w * 0.65, h * 0.8] : [l * 0.8, w * 0.75, h * 0.9],
      (round ? 0.35 : 0.15) * h,
    ),
  );
  f = sd.smoothUnion(
    0.1 * h,
    f,
    sd.ellipsoid(
      [l * rng.range(0.15, 0.3), y + w * rng.range(-0.2, 0.2), h * 0.6],
      [l * 0.3, w * 0.35, h * 0.35],
    ),
  );
  return f;
}

function rock(ctx: BuildContext, i: number, spec: (typeof ROCKS)[number], y: number): Mesh {
  const { size, family, cuts, sink, cracks } = spec;
  const rng = ctx.rng.fork(`rock-${i}`);
  const [l, w, h] = size;
  // Weathering first: pits and grus hollows on the old mass.
  const pits = valueNoise(rng.fork('pits'), { scale: Math.max(0.12, l * 0.18), octaves: 4 });
  let f = sd.displace(core(ctx, i, size, family, y), pits, (family === 'round' ? 0.06 : 0.08) * h);
  // A finer weathering octave where the cells can carry it (LOD0): grus pocks and flaking.
  if (ctx.lod === 0) {
    const pock = valueNoise(rng.fork('pock'), { scale: 0.06, octaves: 2 });
    f = sd.displace(f, pock, 0.012);
  }
  // Then the fractures: flat, crisp faces with only a fine grain.
  const grain = valueNoise(rng.fork('grain'), { scale: 0.05, octaves: 2 });
  for (let k = 0; k < cuts; k++) {
    // Slab: a tilted sheeting plane on top and a diagonal break at one end; others split anyhow.
    const n: Vec3 =
      family === 'slab'
        ? k === 0
          ? unit([rng.range(0.15, 0.25), rng.range(-0.15, 0.15), 1])
          : unit([0.75, rng.range(0.5, 0.7), 0.25])
        : unit([rng.range(-1, 1), rng.range(-1, 1), 0.3]);
    const reach = family === 'slab' ? (k === 0 ? h * 0.42 : l * 0.36) : 0;
    const d = rng.range(0.28, 0.38);
    const at: Vec3 =
      family === 'slab'
        ? [n[0] * reach, y + n[1] * reach, h * 0.45 + n[2] * reach]
        : [n[0] * l * d, y + n[1] * w * d, h * 0.45];
    const cut = plane(at, n);
    f = sd.intersect(f, (p) => cut(p) + grain(p) * 0.008);
  }
  // Frost cracks: a thin slab removed only within CRACK.depth of the surface (no split rock).
  const fissures: Field[] = [];
  for (let k = 0; k < cracks; k++) {
    const n = unit([rng.range(-1, 1), rng.range(-1, 1), rng.range(-0.3, 0.3)]);
    const flat = plane([rng.range(-0.15, 0.15) * l, y + rng.range(-0.15, 0.15) * w, h * 0.5], n);
    // Wandering, not ruled: the crack plane is bent by the grain noise.
    fissures.push((p) => flat(p) + grain(p) * 0.03);
  }
  const solid = f;
  // Geometry only at LOD0 (cells finer than the fissure); far LODs keep the dark line in colour.
  for (const q of ctx.lod === 0 ? fissures : []) {
    const depth = Math.min(CRACK.depth, 0.22 * h);
    // A V-groove: CRACK.half wide at the surface closing to nothing at `depth` (a wedge meshes
    // cleanly where a parallel slot one cell wide stair-steps).
    const crack: Field = (p) => {
      const s = solid(p);
      return Math.max(Math.abs(q(p)) - CRACK.half * Math.max(0, 1 + s / depth), -(s + depth));
    };
    const prev = f;
    f = (p) => Math.max(prev(p), -crack(p));
  }
  const inCrack = (p: Vec3): number => {
    let k = 0;
    for (const q of fissures) k = Math.max(k, 1 - Math.abs(q(p)) / (CRACK.half * 2.2));
    return Math.max(0, k);
  };
  // Sunk: the field drops by `sink`, the bearing face is the section at the ground.
  const lifted: Field = (p) => f([p[0], p[1], p[2] + sink]);
  const field: Field = (p) => Math.max(lifted(p), -p[2]);
  const lichen = valueNoise(rng.fork('lichen'), { scale: 0.12, octaves: 2 });
  const damp = valueNoise(rng.fork('moss'), { scale: 0.25, octaves: 3 });
  const pad = 0.15 * l;
  // Cells scale with the rock's largest side (about the same cell count across each), LOD-gated.
  const cell = ctx.pick([0.037, 0.1, 0.3]) * Math.max(0.8, Math.min(1.45, Math.max(l, h) / 1.5));
  return sdf({
    field,
    bounds: [
      [-l / 2 - pad, y - w / 2 - pad, 0],
      [l / 2 + pad, y + w / 2 + pad, h * 1.15],
    ],
    resolution: cell,
    strip: materialVariant(GRANITE, i + 1),
    lipschitz: 1.6,
    color: (p, nrm) => {
      const up = Math.max(0, nrm[2]);
      const north = Math.max(0, nrm[1]);
      const t = Math.min(1, p[2] / h);
      const n = lichen(p);
      const d = damp(p) * 0.5 + 0.5;
      // Soil splash and a dark damp band at the foot (the bottom 25 cm), fading up.
      const foot = Math.min(1, p[2] / 0.25);
      let col = mix(mix(FOOT, CRACK_DARK, 0.35), STONE, foot * foot * 0.75 + 0.25 * t);
      // Moss: north faces and hollows, thickest low down; never on overhangs.
      const hollow = Math.max(0, -pits(p)) * 1.2;
      // …and in cushions wherever it stays damp (the noise), even on the tops.
      const cushion = Math.max(0, d - 0.62) * 2.2 * (0.4 + up);
      const moss =
        Math.min(1, north * 1.7 * (1 - 0.5 * t) + hollow * 0.8 + cushion + (t < 0.2 ? 0.35 : 0)) *
        (nrm[2] > -0.35 ? 1 : 0);
      col = mix(col, MOSS, Math.min(0.92, moss * (0.35 + 0.75 * d)));
      // Far LOD: 0.3 m cells miss most moss and lichen cushions and the stone read plain pale
      // grey at the switch; a broad green-grey film keeps LOD0's mean tint.
      if (ctx.lod === 2) col = mix(col, MOSS, 0.18);
      // Fissures: dark and damp inside, moss in their lips.
      const c = inCrack([p[0], p[1], p[2] + sink]);
      if (c > 0) col = mix(mix(col, MOSS, 0.4 * c), CRACK_DARK, Math.min(1, c * 1.4));
      // Lichen rosettes on sunny tops.
      if (n > 0.3) col = mix(col, LICHEN, Math.min(0.8, (n - 0.3) * 3.2) * up);
      return col;
    },
  });
}

/** LOD2's soil on the plain row: the mid soil tone times the sand strip's mean albedo (#aaa07e,
 * read off the sheet), so the far skirt keeps LOD0's colour without the texture. */
const SAND_MEAN = hex('#aaa07e');
const FAR_SOIL: Vec3 = [0, 1, 2].map(
  (k) => (mix(SOIL_DAMP, SOIL_DRY, 0.55)[k] ?? 0) * (SAND_MEAN[k] ?? 1),
) as unknown as Vec3;

/** Soil colour at `r` (0 at the rock, 1 at the skirt's edge): damp → dry, mottled, feathered. */
function soilAt(r: number, n: number): Vec3 {
  const t = Math.min(1, Math.max(0, r));
  const base = mix(SOIL_DAMP, SOIL_DRY, Math.min(1, Math.max(0, t * 0.8 + 0.25 * n)));
  // The outer half fades to a pale, grey-washed dust (the strip's tan muted), so the skirt thins
  // out into the ground instead of ending in a tan mat edge.
  const e = Math.max(0, (t - 0.5) / 0.5);
  return mix(base, SOIL_EDGE, e * e * (3 - 2 * e));
}

/**
 * Where (x, y) lies across a skirt whose edge at bearing a is (cos a · (l/2 + R), sin a · (w/2 +
 * R)), R = `reach(a)`: 0 on the rock's own outline (the l × w ellipse), 1 on the skirt's edge,
 * negative inside the rock. Solves for the offset ellipse (semi-axes l/2 + s, w/2 + s) through
 * the point, then divides s by the reach at that ellipse's bearing.
 */
export function skirtFraction(
  x: number,
  y: number,
  l: number,
  w: number,
  reach: (a: number) => number,
): number {
  const f = (s: number): number => {
    const [u, v] = [x / (l / 2 + s), y / (w / 2 + s)];
    return u * u + v * v - 1;
  };
  let lo = -Math.min(l, w) / 2 + 1e-6;
  let hi = Math.max(l, w);
  if (f(lo) <= 0) return lo / Math.max(1e-6, reach(0));
  while (f(hi) > 0) hi *= 2;
  for (let k = 0; k < 48; k++) {
    const m = (lo + hi) / 2;
    if (f(m) > 0) lo = m;
    else hi = m;
  }
  const s = (lo + hi) / 2;
  return s / reach(dmath.atan2(y / (w / 2 + s), x / (l / 2 + s)));
}

/** The soil skirt (an irregular polygon) and half-buried pebbles around a rock's foot. */
function footing(
  ctx: BuildContext,
  i: number,
  size: Vec3,
  y: number,
): { soil: Mesh; pebbles: Mesh } {
  const rng = ctx.rng.fork(`foot-${i}`);
  const [l, w] = size;
  const n = ctx.pick([28, 16, 12]);
  // A lobed outline from three soft waves (not a random radius per point, which drew a jagged
  // saw-tooth rim), lying 1 mm over the ground: flush, no drop-shadow step under its edge.
  const lobes = rng.fork('outline');
  const phase = [lobes.range(0, 6.28), lobes.range(0, 6.28), lobes.range(0, 6.28)];
  const reach = (a: number): number =>
    SKIRT *
    (1 +
      0.18 * dmath.sin(2 * a + (phase[0] ?? 0)) +
      0.1 * dmath.sin(3 * a + (phase[1] ?? 0)) +
      0.05 * dmath.sin(5 * a + (phase[2] ?? 0)));
  const disc = planar({
    points: Array.from({ length: n }, (_, k): Vec3 => {
      const a = (k / n) * Math.PI * 2;
      const r = reach(a);
      return [dmath.cos(a) * (l / 2 + r), y + dmath.sin(a) * (w / 2 + r), 0.001];
    }),
    color: SOIL_DRY,
    // LOD2: flat colour (below). One fan of long triangles cannot carry the strip at true scale:
    // V is squeezed into each, which drew straight plank-like streaks across the far soil.
    strip: ctx.lod === 2 ? 'plain' : materialVariant('sand', i + 1),
  });
  // Split and box-projected so the strip keeps true scale (planar UVs wrap V inside a triangle).
  const tess =
    ctx.lod === 2 ? disc : reproject(tessellate(disc, Math.max(0.15, l / ctx.pick([5, 2.5, 1]))));
  const mottle = valueNoise(rng.fork('soil'), { scale: 0.3, octaves: 2 });
  const colors = new Float32Array(tess.colors);
  for (let v = 0; v < tess.positions.length / 3; v++) {
    const x = tess.positions[v * 3] ?? 0;
    const yy = (tess.positions[v * 3 + 1] ?? 0) - y;
    const r = skirtFraction(x, yy, l, w, reach);
    colors.set(ctx.lod === 2 ? FAR_SOIL : soilAt(r, mottle([x, yy, 0])), v * 3);
  }
  const soil = { ...tess, colors };
  const pebbles: Mesh[] = [];
  const count = ctx.lod === 0 ? 6 : 3;
  if (ctx.lod < 2)
    for (let k = 0; k < count; k++) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(0.025, 0.065) * Math.max(1, l);
      const far = rng.range(0.6, 0.78);
      const at: Vec3 = [
        dmath.cos(a) * (l / 2 + 0.1) * far * 1.6,
        y + dmath.sin(a) * (w / 2 + 0.1) * far * 1.6,
        0,
      ];
      const bump = valueNoise(rng.fork(`pebble-${k}`), { scale: r * 0.8, octaves: 2 });
      const s = r * rng.range(1.1, 1.6);
      pebbles.push(
        sdf({
          field: sd.displace(
            sd.ellipsoid([at[0], at[1], r * 0.05], [s, r, r * rng.range(0.5, 0.62)]),
            bump,
            r * 0.16,
          ),
          bounds: [
            [at[0] - s * 1.3, at[1] - s * 1.3, -r],
            [at[0] + s * 1.3, at[1] + s * 1.3, r * 1.2],
          ],
          resolution: ctx.pick([r / 2, r / 1.2, r]),
          strip: materialVariant(GRANITE, 6),
          color: PEBBLES[(i + k * 3) % PEBBLES.length] ?? STONE,
        }),
      );
    }
  // Each pebble rests on the soil, nothing below z = 0: the studio floor is the asset's lowest
  // point, and the pebbles' buried halves put it 3 cm under the skirts, which then cast a drop
  // shadow round their edges.
  const rest = (m: Mesh): Mesh => {
    let low = 0;
    for (let k = 2; k < m.positions.length; k += 3) low = Math.min(low, m.positions[k] ?? 0);
    return place(m, { at: [0, 0, -low] });
  };
  return { soil, pebbles: merge(pebbles.map(rest)) };
}

export const boulders = defineAsset({
  name: 'boulders',
  kind: 'prop',
  description:
    'Four weathered granite boulders (0.6–2.4 m), rounded, angular and slab: SDF masses, crisp fracture faces, pitting, sunk in soil with pebbles, north-side moss, lichen.',
  tags: ['rock', 'boulder', 'nature', 'sdf', 'scatter'],
  seed: 7,
  budget: { triangles: [40000, 9000, 2000] },
  build(ctx) {
    let y = 0;
    ROCKS.forEach((spec, i) => {
      const cy = y + spec.size[1] / 2;
      ctx.part(`boulder_${i}`, rock(ctx, i, spec, cy));
      const { soil, pebbles } = footing(ctx, i, spec.size, cy);
      ctx.part(`soil_${i}`, soil);
      if (pebbles.indices.length > 0) ctx.part(`pebbles_${i}`, pebbles);
      y += spec.size[1] + 0.5;
    });
  },
});
