// Sunstone deposit — the resource node of the Saltmarch kit (ORIGINAL design, see README.md and
// ../rts_faction/README.md): a faceted basalt outcrop (fracture planes and ledges) with a white
// salt crust packed into its crevices, and clusters of amber sunstone crystals (glowing cores,
// bright facet edges) growing out of fracture pockets, seated a quarter of their length deep. A
// crew has started on it: pick marks and a spoil heap beside one cluster, loose shards at the foot.
// `rts_resource_depleted` is the same seeded outcrop harvested: the main cluster quarried out of a
// deep scoop (drill holes in its walls, spoil and chips on its floor), two broken crystals still
// standing, the rest sheared to amber stubs with pale fracture tops, a spoil-dust fan on the side
// the crew worked from. Neutral rock, but a team claim stake (pennant on the `team` slot) says who
// mines it.

import {
  type BuildContext,
  box,
  cylinder,
  defineFamily,
  type Field,
  hex,
  type Lod,
  lathe,
  type Mesh,
  merge,
  place,
  prism,
  type Rng,
  sd,
  sdf,
  spanOf,
  stripRect,
  type Vec2,
  type Vec3,
  valueNoise,
  weather,
  weightedNormals,
} from '@developerz.ai/ts23d';
import { DUST, MUD } from '../_lib/rts/finish.ts';
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
const BASALT_LIGHT = hex('#5e5a55');
const BASALT_DEEP = hex('#1f1f24');
const SALT = hex('#e4e0d6');
/** Crystal colour from root (deep amber) to tip (pale gold), and the fracture's pale face. */
const ROOT = hex('#c2600c');
const TIP = hex('#ffd36e');
const FRACTURE = hex('#fff1cf');

const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const unit = (d: Vec3): Vec3 => {
  const l = Math.hypot(d[0], d[1], d[2]) || 1;
  return [d[0] / l, d[1] / l, d[2] / l];
};

/** Cluster anchors on the outcrop (base, lean, count, length scale): the top one leads. */
const CLUSTERS: readonly { at: Vec3; lean: Vec3; n: number; k: number }[] = [
  { at: [0.4, -0.3, 1.75], lean: [0.25, -0.15, 1], n: 5, k: 1 },
  { at: [1.25, 0.55, 1.0], lean: [0.7, 0.35, 0.85], n: 4, k: 0.8 },
  { at: [-0.95, -0.9, 0.95], lean: [-0.45, -0.6, 0.8], n: 4, k: 0.8 },
  { at: [-0.5, 0.95, 1.25], lean: [-0.25, 0.6, 0.9], n: 3, k: 0.8 },
];

export type CrystalState = 'whole' | 'stub' | 'broken';

/**
 * One faceted crystal along +Z, its root 25% of its length below z = 0 (seated in the rock): a
 * hexagonal prism with a pointed tip, sheared to a stub, or snapped half-way with a jagged top.
 * LOD0 has a vertex mid-face, so facet edges carry their own (brighter) colour; its normals are
 * re-derived from the hexagon's faces so each face shades flat.
 */
export function crystal(lod: Lod, r: number, h: number, state: CrystalState): Mesh {
  const root = -h * 0.25;
  const profile: Vec2[] =
    state === 'stub'
      ? [
          [r * 0.8, root],
          [r, 0],
          [r * 0.95, h * 0.22],
          [r * 0.55, h * 0.27],
          [0.001, h * 0.25],
        ]
      : state === 'broken'
        ? [
            [r * 0.8, root],
            [r, 0],
            [r * 0.96, h * 0.45],
            [r * 0.45, h * 0.6],
            [0.001, h * 0.5],
          ]
        : [
            [r * 0.8, root],
            [r, 0],
            [r * 0.95, h * 0.72],
            [0.001, h],
          ];
  const n = SEG(lod, 12, 6, 4);
  const m = lathe({ profile, segments: n, color: SUNSTONE, strip: 'plastic', creaseDeg: 20 });
  const top = state === 'whole' ? h : state === 'broken' ? h * 0.6 : h * 0.27;
  const colors = new Float32Array(m.colors.length);
  const positions = new Float32Array(m.positions);
  for (let i = 0; i < colors.length; i += 3) {
    const x = m.positions[i] ?? 0;
    const y = m.positions[i + 1] ?? 0;
    const z = m.positions[i + 2] ?? 0;
    const t = Math.max(0, Math.min(1, (z - root) / (top - root)));
    const k = Math.round(Math.atan2(y, x) / (Math.PI / 6));
    // Mid-face vertices pulled onto the flat face (a true hexagon), and darker: the face glows
    // deep inside, its edges catch the light.
    const mid = lod === 0 && k % 2 !== 0;
    if (mid) {
      const c = Math.cos(Math.PI / 6);
      positions[i] = x * c;
      positions[i + 1] = y * c;
    }
    let c = mix(ROOT, TIP, t * t);
    if (lod === 0) c = mid ? mix(c, ROOT, 0.35) : mix(c, TIP, 0.25);
    // A sheared or snapped face is fresh, pale fracture.
    if (state !== 'whole' && z > top * 0.85 && Math.hypot(x, y) < r * 0.7) c = FRACTURE;
    colors.set(c, i);
  }
  // LOD0's reshaped hexagon keeps the lathe's twelve radial normals; re-derive them from the
  // faces, hard at the six corners (60°) and at the profile creases the lathe split (20°).
  return lod === 0
    ? weightedNormals({ ...m, positions, colors }, { hardAngle: 20 })
    : { ...m, positions, colors };
}

/** Yaw / pitch that tilt +Z onto direction d. */
function aim(d: Vec3): { yaw: number; pitch: number } {
  const l = Math.hypot(d[0], d[1], d[2]) || 1;
  return { yaw: Math.atan2(d[1], d[0]), pitch: Math.acos(d[2] / l) };
}

/** The outcrop's field: two masses and a block, cut by fracture planes, stepped by two ledges,
 *  pocketed where crystals grow; `depleted` scoops the main cluster out. */
function rockField(rng: Rng, depleted: boolean): Field {
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
    [[0.2, 0.9, 0.2], 1.85],
    [[-0.95, 0.1, 0.25], 1.9],
    // Top facets: the outcrop is a broken block, not a dome.
    [[0.25, -0.35, 1], 1.3],
    [[-0.4, 0.3, 1], 1.15],
    [[0.7, 0.45, 0.6], 1.45],
  ] as [Vec3, number][]) {
    const u = unit(n);
    f = sd.intersect(f, (p) => p[0] * u[0] + p[1] * u[1] + (p[2] - 0.6) * u[2] - d);
  }
  // Ledges: two stepped notches broken out of the flanks.
  f = sd.subtract(f, sd.box([1.75, -1.0, 0.95], [0.8, 0.8, 0.55], 0.04));
  f = sd.subtract(f, sd.box([-1.65, 0.95, 0.95], [0.7, 0.9, 0.45], 0.04));
  // Fracture pockets the crystals grow from.
  for (const c of CLUSTERS.slice(depleted ? 1 : 0))
    f = sd.smoothSubtract(0.12, f, sd.ellipsoid(c.at, [0.42, 0.42, 0.3]));
  if (depleted)
    // The quarry scoop where the main cluster was cut out: a metre deep below its rim.
    f = sd.smoothSubtract(0.2, f, sd.ellipsoid([0.5, -0.45, 2.0], [1.05, 0.95, 1.05]));
  const pits = valueNoise(rng.fork('pits'), { scale: 0.6, octaves: 3 });
  const rough = sd.displace(f, pits, 0.05);
  return (p) => Math.max(rough(p), -p[2]);
}

/** The rock's strip: greyscale fine grain (vertex colour is the basalt), no jointing to fold. */
const ROCK_STRIP = 'concrete';

/**
 * Box-projected UVs, re-done per vertex so no band ever folds horizontally: the vertical (or the
 * second plan axis on tops) runs along U, which tiles through the sampler, and the horizontal
 * runs along V, mirrored every half metre. The SDF's own UVs folded along height: contour lines.
 */
function boxUv(m: Mesh): Mesh {
  const rect = stripRect(ROCK_STRIP);
  const span = spanOf(ROCK_STRIP);
  const vm = 0.5;
  const half = 0.5 / 4096;
  const uvs = new Float32Array(m.uvs.length);
  for (let i = 0; i < uvs.length / 2; i++) {
    const x = m.positions[i * 3] ?? 0;
    const y = m.positions[i * 3 + 1] ?? 0;
    const z = m.positions[i * 3 + 2] ?? 0;
    const ax = Math.abs(m.normals[i * 3] ?? 0);
    const ay = Math.abs(m.normals[i * 3 + 1] ?? 0);
    const az = Math.abs(m.normals[i * 3 + 2] ?? 0);
    const [s, t] = az >= ax && az >= ay ? [y, x] : ax >= ay ? [z, y] : [z, x];
    const q = t / vm;
    const fold = q - 2 * Math.floor(q / 2);
    const frac = fold <= 1 ? fold : 2 - fold;
    uvs[i * 2] = rect.u0 + (s / span) * (rect.u1 - rect.u0);
    uvs[i * 2 + 1] = rect.v0 + half + frac * (rect.v1 - rect.v0 - 2 * half);
  }
  return { ...m, uvs };
}

/** March from `from` along `dir` to the rock surface (first point inside). */
function surfaceAt(field: Field, from: Vec3, dir: Vec3): Vec3 | null {
  const d = unit(dir);
  let p = from;
  for (let i = 0; i < 200; i++) {
    const v = field(p);
    if (v < 0.005) return p;
    if (Math.hypot(p[0] - from[0], p[1] - from[1], p[2] - from[2]) > 3) return null;
    const step = Math.max(0.01, v * 0.6);
    p = [p[0] + d[0] * step, p[1] + d[1] * step, p[2] + d[2] * step];
  }
  return null;
}

function outcrop(ctx: BuildContext, depleted: boolean): Field {
  const lod = ctx.lod;
  const rng = ctx.rng.fork('rock');
  const field = rockField(rng, depleted);
  const tone = valueNoise(rng.fork('tone'), { scale: 0.9, octaves: 2 });
  // Salt is crust packed into crevices and pockets: where the rock closes back over a point.
  const saltK = lod === 2 ? 0.45 : 0.9;
  const raw = sdf({
    field,
    bounds: [
      [-2.6, -2.2, 0],
      [2.6, 2.2, 2.4],
    ],
    resolution: ctx.pick([0.11, 0.27, depleted ? 0.74 : 0.7]),
    strip: 'concrete',
    lipschitz: 1.6,
    color: (p, n) => {
      const h = Math.min(1, p[2] / 2);
      const base = mix(
        mix(BASALT_DEEP, BASALT, 0.5 + h * 0.5),
        BASALT_LIGHT,
        Math.max(0, tone(p)) * 0.7,
      );
      const e = 0.4;
      const open = field([p[0] + n[0] * e, p[1] + n[1] * e, p[2] + n[2] * e]) / e;
      const crevice = smooth(0.72, 0.35, open);
      // Pockets and crevices: darker rock with salt packed in; the ground line: a brine rim.
      const rim = smooth(0.25, 0.05, p[2]) * 0.6;
      const salt = Math.max(crevice * 0.85, rim) * saltK;
      return mix(mix(base, BASALT_DEEP, crevice * 0.4), SALT, salt);
    },
  });
  const rock = boxUv(raw);
  const worn = weather(
    ctx,
    { rock },
    {
      name: 'outcrop',
      seed: 81,
      age: 0.8,
      resolution: [0, 0, 0],
      groundBand: 0.45,
      effects: {
        dust: { where: 'up-facing', amount: 0.18, color: DUST, strength: lod === 2 ? 0.2 : 0.3 },
        mud: { where: 'ground-near', amount: 0.5, color: MUD, strength: 0.6 },
      },
    },
  );
  ctx.part('rock', worn.rock);
  return field;
}

/** A small rock chunk (spoil), a broken box tumbled. */
const chunk = (rng: Rng, at: Vec3, s: number, color: Vec3): Mesh =>
  place(
    box({
      size: [s, s * rng.range(0.6, 1), s * rng.range(0.4, 0.7)],
      at: [0, 0, 0],
      color,
      strip: ROCK_STRIP,
    }),
    {
      at,
      yaw: rng.range(0, Math.PI),
      roll: rng.range(-0.25, 0.25),
    },
  );

function crystals(ctx: BuildContext, depleted: boolean): void {
  const lod = ctx.lod;
  const rng = ctx.rng.fork('crystals');
  const out: Mesh[] = [];
  CLUSTERS.forEach((c, ci) => {
    // LOD2: the lead cluster keeps two crystals, the side clusters one each (the amber read).
    const n = lod === 2 ? Math.min(ci === 0 ? 2 : 1, c.n) : c.n;
    for (let i = 0; i < n; i++) {
      const lean: Vec3 = [
        c.lean[0] + rng.range(-0.3, 0.3),
        c.lean[1] + rng.range(-0.3, 0.3),
        c.lean[2] + 0.15,
      ];
      const big = i === 0 ? 1 : rng.range(0.45, 0.8);
      const h = ((ci === 0 ? 1.95 : 1.7) * big + 0.35) * c.k;
      const r = (0.22 * big + 0.06) * c.k;
      const a = aim(lean);
      const at: Vec3 = [
        c.at[0] + rng.range(-0.18, 0.18),
        c.at[1] + rng.range(-0.18, 0.18),
        c.at[2] - 0.05,
      ];
      // Depleted: the main cluster quarried down to two snapped crystals, the rest sheared to stubs.
      if (depleted && ci === 0 && i >= 2) continue;
      const state: CrystalState = !depleted ? 'whole' : ci === 0 ? 'broken' : 'stub';
      const at0: Vec3 =
        depleted && ci === 0 ? [0.5 + (i - 0.5) * 0.45, -0.45 + (i - 0.5) * 0.2, 1.0] : at;
      const pose = { at: at0, yaw: a.yaw, pitch: a.pitch * (depleted && ci === 0 ? 0.4 : 1) };
      out.push(place(crystal(lod, r, h, state), pose));
    }
    ctx.socket(`mine_point_${ci}`, {
      kind: 'interact',
      at: c.at,
      dir: c.lean,
      data: { resource: 'sunstone' },
    });
  });
  if (lod < 2)
    // Loose shards at the foot: knocked off by the crew, lying on the ground.
    for (const [x, y, yaw] of [
      [2.05, -0.6, 0.4],
      [1.85, 1.35, 2.1],
      [-1.6, -1.65, 4.0],
      [0.6, -1.95, 1.2],
    ] as const) {
      const s = crystal(lod, 0.07, 0.42, 'whole');
      out.push(place(s, { at: [x, y, 0.06], yaw, pitch: Math.PI / 2 - 0.12 }));
    }
  if (out.length) ctx.part(depleted ? 'crystal_stubs' : 'crystals', merge(out));
}

/** The crew's work: spoil heap and pick marks by the side cluster; in a depleted node, spoil
 *  and chips on the scoop floor, drill holes in its walls, a spoil fan on the worked side. */
function workings(ctx: BuildContext, field: Field, depleted: boolean): void {
  const lod = ctx.lod;
  if (lod === 2) return;
  const rng = ctx.rng.fork('spoil');
  const spoil: Mesh[] = [];
  const marks: Mesh[] = [];
  const heap = (cx: number, cy: number, n: number, spread: number): void => {
    for (let i = 0; i < n; i++) {
      const s = rng.range(0.08, 0.26);
      const k = rng.range(0.7, 1.15);
      spoil.push(
        chunk(rng, [cx + rng.range(-spread, spread), cy + rng.range(-spread, spread), -0.03], s, [
          BASALT_LIGHT[0] * k,
          BASALT_LIGHT[1] * k,
          BASALT_LIGHT[2] * k,
        ]),
      );
    }
  };
  heap(2.35, 0.9, lod === 0 ? 14 : 5, 0.45);
  if (depleted) heap(1.8, -1.9, lod === 0 ? 18 : 6, 0.7);
  // Pick marks: dark gouges chipped into the rock face beside the side cluster.
  const side = CLUSTERS[1];
  if (side && lod === 0)
    for (let i = 0; i < 5; i++) {
      const from: Vec3 = [
        side.at[0] + 1.2,
        side.at[1] + rng.range(-0.6, 0.4),
        side.at[2] - 0.5 + rng.range(-0.2, 0.3),
      ];
      const p = surfaceAt(field, from, [-1, -0.2, 0.05]);
      if (!p) continue;
      marks.push(
        place(box({ size: [0.1, 0.05, 0.16], at: [0, 0, -0.08], color: hex('#18171a') }), {
          at: p,
          yaw: rng.range(-0.4, 0.4),
          roll: rng.range(-0.5, 0.5),
        }),
      );
    }
  if (depleted && lod === 0) {
    // Drill holes round the scoop wall, and spoil on its floor with a few amber chips.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      // From the scoop's open middle out to its wall.
      const p = surfaceAt(field, [0.5, -0.45, 1.6], [Math.cos(a), Math.sin(a), 0.1]);
      if (!p) continue;
      marks.push(
        cylinder({
          radius: 0.03,
          length: 0.12,
          segments: 6,
          axis: 'z',
          at: p,
          color: hex('#121114'),
        }),
      );
    }
    for (let i = 0; i < 7; i++) {
      const q = surfaceAt(
        field,
        [0.5 + rng.range(-0.35, 0.35), -0.45 + rng.range(-0.3, 0.3), 2.6],
        [0, 0, -1],
      );
      if (!q) continue;
      spoil.push(
        chunk(
          rng,
          [q[0], q[1], q[2] - 0.04],
          rng.range(0.08, 0.18),
          i % 3 === 0 ? SUNSTONE : BASALT_LIGHT,
        ),
      );
    }
  }
  if (spoil.length)
    ctx.part('spoil', merge(spoil), {
      connect: { as: 'rest', why: 'loose spoil lies where it was thrown' },
    });
  if (marks.length) ctx.part('tool_marks', merge(marks));
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
    const field = outcrop(ctx, p.depleted);
    crystals(ctx, p.depleted);
    workings(ctx, field, p.depleted);
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
  // Side clusters 20% smaller than the lead cluster, all seated a quarter deep in their pockets.
  real: { length: 4.93, width: 3.78, height: 3.9 },
  // Saltmarch glow strength 1.2 across the RTS set: amber facets lit, not blown to white.
  glow: [{ parts: ['crystals'], color: SUNSTONE, strength: 1.2 }],
});
export const rts_resource_depleted = deposit.variant({
  name: 'rts_resource_depleted',
  description:
    'Sunstone deposit, harvested: the main cluster quarried out to two snapped crystals, the rest sheared to stubs, drill holes and spoil.',
  params: { depleted: true },
  // Spoil thrown out on the worked (−Y) side widens the footprint.
  real: { length: 4.93, width: 4.34, height: 2.8 },
  // Mined out: the sheared stubs smoulder dimmer than a whole cluster.
  glow: [{ parts: ['crystal_stubs'], color: SUNSTONE, strength: 0.8 }],
});
