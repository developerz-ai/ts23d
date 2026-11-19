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
  type Field,
  hex,
  type Mesh,
  materialVariant,
  merge,
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
const SOIL = hex('#a89880');

type Family = 'round' | 'angular' | 'slab';

/** Length (X), width (Y), height (Z) in metres; fracture planes; how deep it sits (m). */
const ROCKS: readonly { size: Vec3; family: Family; cuts: number; sink: number }[] = [
  { size: [0.6, 0.45, 0.35], family: 'angular', cuts: 2, sink: 0.05 },
  { size: [1.3, 0.9, 0.42], family: 'slab', cuts: 2, sink: 0.06 },
  { size: [1.6, 1.1, 0.85], family: 'round', cuts: 1, sink: 0.08 },
  { size: [2.4, 1.7, 1.1], family: 'angular', cuts: 3, sink: 0.1 },
];

/** A plane through `at` with outward normal `n` (unit): negative behind it. */
const plane =
  (at: Vec3, n: Vec3): Field =>
  (p) =>
    (p[0] - at[0]) * n[0] + (p[1] - at[1]) * n[1] + (p[2] - at[2]) * n[2];

const unit = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
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
  const { size, family, cuts, sink } = spec;
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
  // Sunk: the field drops by `sink`, the bearing face is the section at the ground.
  const lifted: Field = (p) => f([p[0], p[1], p[2] + sink]);
  const field: Field = (p) => Math.max(lifted(p), -p[2]);
  const lichen = valueNoise(rng.fork('lichen'), { scale: 0.12, octaves: 2 });
  const damp = valueNoise(rng.fork('moss'), { scale: 0.25, octaves: 3 });
  const pad = 0.15 * l;
  // Cells scale with the rock (the same cell count across each), LOD-gated.
  const cell = ctx.pick([0.037, 0.1, 0.3]) * Math.max(0.55, Math.min(1.3, l / 1.6));
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
      // Soil splash and damp at the foot (the bottom 12 cm), fading up.
      let col = mix(FOOT, STONE, Math.min(1, p[2] / 0.12) * 0.7 + 0.3 * t);
      // Moss: north faces and hollows, thickest low down; never on overhangs.
      const hollow = Math.max(0, -pits(p)) * 1.2;
      // …and in cushions wherever it stays damp (the noise), even on the tops.
      const cushion = Math.max(0, d - 0.62) * 2.2 * (0.4 + up);
      const moss =
        Math.min(1, north * 1.7 * (1 - 0.5 * t) + hollow * 0.8 + cushion + (t < 0.2 ? 0.35 : 0)) *
        (nrm[2] > -0.35 ? 1 : 0);
      col = mix(col, MOSS, Math.min(0.92, moss * (0.35 + 0.75 * d)));
      // Lichen rosettes on sunny tops.
      if (n > 0.3) col = mix(col, LICHEN, Math.min(0.8, (n - 0.3) * 3.2) * up);
      return col;
    },
  });
}

/** The soil skirt (an irregular polygon) and three half-buried pebbles around a rock's foot. */
function footing(
  ctx: BuildContext,
  i: number,
  size: Vec3,
  y: number,
): { soil: Mesh; pebbles: Mesh } {
  const rng = ctx.rng.fork(`foot-${i}`);
  const [l, w] = size;
  const n = ctx.pick([14, 10, 6]);
  const disc = planar({
    points: Array.from({ length: n }, (_, k): Vec3 => {
      const a = (k / n) * Math.PI * 2;
      const r = 1.18 + rng.range(-0.06, 0.1);
      return [(Math.cos(a) * l * r) / 2, y + (Math.sin(a) * w * r) / 2, 0.004];
    }),
    color: SOIL,
    strip: materialVariant('gravel', i + 1),
  });
  // Split and box-projected so the strip keeps true scale (planar UVs wrap V inside a triangle).
  const soil = ctx.lod === 2 ? disc : reproject(tessellate(disc, Math.max(0.2, l / 4)));
  const pebbles: Mesh[] = [];
  if (ctx.lod < 2)
    for (let k = 0; k < 3; k++) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(0.03, 0.07) * Math.max(1, l);
      const at: Vec3 = [(Math.cos(a) * l * 0.62) / 1, y + (Math.sin(a) * w * 0.62) / 1, 0];
      const bump = valueNoise(rng.fork(`pebble-${k}`), { scale: r, octaves: 2 });
      const s = r * 1.4;
      pebbles.push(
        sdf({
          field: sd.displace(
            sd.ellipsoid([at[0], at[1], r * 0.1], [s, r, r * 0.55]),
            bump,
            r * 0.18,
          ),
          bounds: [
            [at[0] - s * 1.3, at[1] - s * 1.3, -r],
            [at[0] + s * 1.3, at[1] + s * 1.3, r * 1.2],
          ],
          resolution: ctx.pick([r / 2, r / 1.2, r]),
          strip: materialVariant(GRANITE, 6),
          color: mix(STONE, FOOT, rng.range(0.1, 0.5)),
        }),
      );
    }
  return { soil, pebbles: merge(pebbles) };
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
