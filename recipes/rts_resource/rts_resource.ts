// Sunstone deposit — the resource node of the Saltmarch kit (ORIGINAL design, see README.md and
// ../rts_faction/README.md): a basalt outcrop with a white salt crust on its upward faces and
// clusters of amber sunstone crystals (glowing) breaking out of it. `rts_resource_depleted` is
// the same seeded outcrop harvested: crystals sheared to stubs, a scooped quarry cut, drill
// holes, spoil. Neutral rock, but a team claim stake (pennant on the `team` slot) says who mines it.

import {
  type BuildContext,
  cylinder,
  defineFamily,
  type Field,
  hex,
  lathe,
  type Mesh,
  merge,
  place,
  prism,
  sd,
  sdf,
  type Vec3,
  valueNoise,
  weather,
} from '@developerz.ai/ts23d';
import { MUD } from '../_lib/rts/finish.ts';
import {
  BRASS,
  chevronPlan,
  IRON,
  SEG,
  SUNSTONE,
  TEAM,
  TEAM_PAINT,
  TEAM_VARIANTS,
  tube,
} from '../_lib/rts/style.ts';

const BASALT = hex('#3b3a3d');
const BASALT_LIGHT = hex('#5a5754');
const SALT = hex('#e4e0d6');
const SPENT = hex('#7a4a1c');
const BASALT_DEEP = hex('#25252a');
/** The rock stays on the greyscale `concrete` strip (grain without a UV pattern: an SDF's
 *  marching-cubes UVs fold, which a jointed strip like `cliff` shows as contour lines). */
const onRock = (c: Vec3): Vec3 => c;
/** Crystal colour from root (deep amber) to tip (pale gold): the inner-glow gradient. */
const ROOT = hex('#b8620f');
const TIP = hex('#ffd27a');

const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Cluster anchors on the outcrop (x, y, z of the base, outward lean direction). */
const CLUSTERS: readonly { at: Vec3; lean: Vec3; n: number }[] = [
  { at: [0.4, -0.3, 1.5], lean: [0.3, -0.2, 1], n: 5 },
  { at: [1.1, 0.6, 0.8], lean: [0.8, 0.4, 0.6], n: 4 },
  { at: [-0.9, -0.9, 0.7], lean: [-0.5, -0.7, 0.6], n: 4 },
  { at: [-0.4, 0.9, 1.1], lean: [-0.3, 0.7, 0.8], n: 3 },
];

/** One faceted crystal along +Z: a hexagonal prism with a pointed tip (tip cut off when sheared). */
const crystal = (lod: 0 | 1 | 2, r: number, h: number, sheared: boolean): Mesh =>
  lathe({
    profile: sheared
      ? [
          [r * 0.7, -0.4],
          [r, 0],
          [r * 0.95, h * 0.3],
          [r * 0.6, h * 0.36],
          [0.001, h * 0.36],
        ]
      : [
          [r * 0.7, -0.4],
          [r, 0],
          [r * 0.95, h * 0.72],
          [0.001, h],
        ],
    segments: SEG(lod, 6, 6, 4),
    color: sheared ? SPENT : SUNSTONE,
    creaseDeg: 20,
  });

/** Recolour a crystal along its axis (local z): deep amber root → pale gold tip. */
function glowRamp(m: Mesh, h: number): Mesh {
  const colors = new Float32Array(m.colors.length);
  for (let i = 0; i < colors.length; i += 3) {
    const t = Math.max(0, Math.min(1, (m.positions[i + 2] ?? 0) / h));
    colors.set(mix(ROOT, TIP, t * t), i);
  }
  return { ...m, colors };
}

/** Yaw / pitch that tilt +Z onto direction d. */
function aim(d: Vec3): { yaw: number; pitch: number } {
  const l = Math.hypot(d[0], d[1], d[2]) || 1;
  return { yaw: Math.atan2(d[1], d[0]), pitch: Math.acos(d[2] / l) };
}

function outcrop(ctx: BuildContext, depleted: boolean): void {
  const rng = ctx.rng.fork('rock');
  let f: Field = sd.smoothUnion(
    0.35,
    sd.ellipsoid([0, 0, 0.6], [2.1, 1.7, 1.25]),
    sd.ellipsoid([0.5, -0.4, 1.0], [1.1, 1.0, 1.0]),
  );
  f = sd.smoothUnion(0.3, f, sd.box([-0.8, 0.5, 0.4], [1.6, 1.3, 1.0], 0.3));
  // Fracture planes: split faces make it read as rock, not a pebble.
  for (const [n, d] of [
    [[0.85, -0.3, 0.45], 1.55],
    [[-0.6, -0.75, 0.3], 1.45],
    [[-0.3, 0.8, 0.55], 1.5],
  ] as [Vec3, number][]) {
    const l = Math.hypot(...n);
    const u: Vec3 = [n[0] / l, n[1] / l, n[2] / l];
    f = sd.intersect(f, (p) => p[0] * u[0] + p[1] * u[1] + (p[2] - 0.6) * u[2] - d);
  }
  if (depleted)
    // The quarry scoop where the main cluster was cut out, plus drill holes.
    f = sd.smoothSubtract(0.25, f, sd.ellipsoid([0.5, -0.5, 1.6], [1.0, 0.9, 0.75]));
  const pits = valueNoise(rng.fork('pits'), { scale: 0.45, octaves: 4 });
  const rough = sd.displace(f, pits, 0.14);
  const field: Field = (p) => Math.max(rough(p), -p[2]);
  const rock = sdf({
    field,
    bounds: [
      [-2.6, -2.2, 0],
      [2.6, 2.2, 2.3],
    ],
    resolution: ctx.pick([0.09, 0.2, 0.58]),
    strip: 'concrete',
    lipschitz: 1.6,
    color: (p, n) => {
      // Salt crust on upward faces, basalt darkening toward the ground.
      const t = Math.min(1, p[2] / 1.8);
      const base = mix(BASALT, BASALT_LIGHT, t);
      const salt = n[2] > 0.8 ? Math.min(1, (n[2] - 0.8) * 5) * 0.8 : 0;
      // Strata: darker bedding bands every ~22 cm, strongest on steep fracture faces.
      const steep = 1 - Math.abs(n[2]);
      const band = 0.5 + 0.5 * Math.sin(p[2] * 28 + p[0] * 2.2);
      const bed = mix(base, BASALT_DEEP, steep * band * 0.6);
      return onRock(mix(bed, SALT, salt));
    },
  });
  // Measured wear: salt dust on the tops, brine mud round the foot. The crust colouring above
  // says where salt grows; this says where it settles.
  const worn = weather(
    ctx,
    { rock },
    {
      name: 'outcrop',
      seed: 81,
      age: 0.8,
      resolution: [0, 0, 0],
      groundBand: 0.4,
      effects: {
        dust: { where: 'up-facing', amount: 0.3, color: onRock(SALT), strength: 0.5 },
        mud: { where: 'ground-near', amount: 0.5, color: onRock(MUD), strength: 0.6 },
      },
    },
  );
  ctx.part('rock', worn.rock);
}

function crystals(ctx: BuildContext, depleted: boolean): void {
  const lod = ctx.lod;
  const rng = ctx.rng.fork('crystals');
  const out: Mesh[] = [];
  CLUSTERS.forEach((c, ci) => {
    const n = lod === 2 ? Math.min(2, c.n) : c.n;
    for (let i = 0; i < n; i++) {
      const lean: Vec3 = [
        c.lean[0] + rng.range(-0.35, 0.35),
        c.lean[1] + rng.range(-0.35, 0.35),
        c.lean[2],
      ];
      const big = i === 0 ? 1 : rng.range(0.45, 0.8);
      const h = (ci === 0 ? 2.2 : 1.7) * big + 0.3;
      const r = 0.22 * big + 0.06;
      const a = aim(lean);
      const at: Vec3 = [
        c.at[0] + rng.range(-0.25, 0.25),
        c.at[1] + rng.range(-0.25, 0.25),
        c.at[2] - 0.15,
      ];
      // Depleted: the main cluster is gone (quarried), the rest sheared to stubs.
      if (depleted && ci === 0) continue;
      const one = crystal(lod, r, h, depleted);
      out.push(place(depleted ? one : glowRamp(one, h), { at, yaw: a.yaw, pitch: a.pitch }));
    }
    ctx.socket(`mine_point_${ci}`, {
      kind: 'interact',
      at: c.at,
      dir: c.lean,
      data: { resource: 'sunstone' },
    });
  });
  if (out.length) ctx.part(depleted ? 'crystal_stubs' : 'crystals', merge(out));
}

/** The team claim stake: a pole with a chevron pennant, planted at the front-left foot. */
function claim(ctx: BuildContext): void {
  const lod = ctx.lod;
  const at: Vec3 = [1.9, -1.6, 0];
  ctx.part(
    'claim_pole',
    merge([
      tube(lod, at, [at[0], at[1], 2.6], 0.045, 0.035, IRON),
      ...(lod < 2
        ? [
            lathe({
              profile: [
                [0.001, -0.04],
                [0.05, -0.04],
                [0.09, 0.05],
                [0.001, 0.12],
              ],
              segments: SEG(lod, 10, 6, 4),
              at: [at[0], at[1], 2.6],
              color: BRASS,
            }),
          ]
        : []),
    ]),
  );
  // A triangular pennant flying from a hem sleeve that wraps the pole (held over a face).
  const flag = prism({
    profile: [
      [0, 0.32],
      [1.3, 0.02],
      [1.3, -0.02],
      [0, -0.32],
    ],
    depth: 0.03,
    plane: 'xz',
    color: TEAM,
  });
  const pennant = merge([
    place(flag, { at: [at[0] - 0.02, at[1], 2.12], yaw: Math.PI }),
    cylinder({
      radius: 0.06,
      length: 0.7,
      segments: SEG(lod, 12, 8, 4),
      at: [at[0], at[1], 2.12],
      color: TEAM,
    }),
  ]);
  // A flat claim plaque at the stake's foot: the top-visible team mark on a neutral rock.
  const plaque = chevronPlan([at[0] + 0.1, at[1] + 0.25, 0], 1.6, 1.4, 0.5, 0.06, TEAM);
  ctx.part('claim_pennant', merge([pennant, plaque]), { paint: 'team' });
}

const deposit = defineFamily({
  kind: 'prop',
  description:
    'Sunstone deposit: original RTS resource node, a salt-crusted basalt outcrop with glowing amber crystals and a team claim stake.',
  tags: ['rts', 'saltmarch', 'resource', 'crystal', 'team-colour'],
  sources: [
    'recipes/rts_faction/README.md (original design brief)',
    'docs/playbooks/nature/rocks.md',
  ],
  budget: { triangles: [16000, 4000, 500] },
  paint: TEAM_PAINT,
  variants: TEAM_VARIANTS,
  defaults: { depleted: false },
  build(ctx, p) {
    outcrop(ctx, p.depleted);
    crystals(ctx, p.depleted);
    claim(ctx);
    ctx.emitter('glint', {
      kind: 'sparks',
      at: [0.4, -0.3, 2.2],
      rate: p.depleted ? 0.5 : 3,
      life: 0.6,
      size: [0.05, 0.02],
      color: [1, 0.7, 0.25],
      when: 'always',
    });
    if (p.depleted)
      ctx.emitter('dust', {
        kind: 'dust',
        at: [0.5, -0.5, 1.2],
        rate: 4,
        life: 2,
        size: [0.3, 1.2],
        when: 'always',
      });
  },
});

export const rts_resource = deposit.variant({
  name: 'rts_resource',
  real: { length: 4.93, width: 4.36, height: 3.56 },
  glow: [{ parts: ['crystals'], color: SUNSTONE, strength: 4 }],
});
export const rts_resource_depleted = deposit.variant({
  name: 'rts_resource_depleted',
  description:
    'Sunstone deposit, harvested: crystals sheared to stubs, the main cluster quarried out, spoil dust.',
  params: { depleted: true },
  real: { length: 4.93, width: 3.78, height: 2.8 },
});
