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
  dmath,
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
  dome,
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
/** Share of the near salt the far rock keeps: its mean value then matches the near rock's. */
const FAR_SALT = 0.25;
/** Fresh rock under the weathered skin, where a pick bit. */
const CHIPPED = hex('#8a847b');

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
  const l = dmath.hypot(d[0], d[1], d[2]) || 1;
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
          [r * 0.98, h * 0.22],
          [r * 0.96, h * 0.38],
          [0.001, h * 0.4],
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
  // LOD2 drops the shoulder at the seat: the root still reaches down into the pocket (one band
  // fewer), so the crystal stays seated whatever the far rock's cells do.
  const m = lathe({
    profile: lod === 2 ? [profile[0] ?? [r, root], ...profile.slice(2)] : profile,
    segments: n,
    color: SUNSTONE,
    strip: 'plastic',
    creaseDeg: 20,
  });
  const top = state === 'whole' ? h : state === 'broken' ? h * 0.6 : h * 0.33;
  // A stub is sheared clean: one flat cut plane across the prism, rising across its width.
  const cut = (x: number): number => h * (0.28 + 0.05 * (x / r));
  const colors = new Float32Array(m.colors.length);
  const positions = new Float32Array(m.positions);
  for (let i = 0; i < colors.length; i += 3) {
    const k = Math.round(dmath.atan2(m.positions[i + 1] ?? 0, m.positions[i] ?? 0) / (Math.PI / 6));
    // Mid-face vertices pulled onto the flat face (a true hexagon), and darker: the face glows
    // deep inside, its edges catch the light. Pulled in before the cut, so a sheared vertex lands
    // on the cut plane at its final x.
    const mid = lod === 0 && k % 2 !== 0;
    const pull = mid ? dmath.cos(Math.PI / 6) : 1;
    const x = (m.positions[i] ?? 0) * pull;
    const y = (m.positions[i + 1] ?? 0) * pull;
    positions[i] = x;
    positions[i + 1] = y;
    const sheared = state === 'stub' && (m.positions[i + 2] ?? 0) > cut(x) - 1e-6;
    const z = sheared ? cut(x) : (m.positions[i + 2] ?? 0);
    positions[i + 2] = z;
    const t = Math.max(0, Math.min(1, (z - root) / (top - root)));
    let c = mix(ROOT, TIP, t * t);
    // Facets: a deep amber core mid-face, bright edges where the light catches (LOD0).
    if (lod === 0) c = mid ? mix(c, ROOT, 0.55) : mix(c, TIP, 0.4);
    // A sheared or snapped face is fresh, pale fracture.
    if (sheared || (state === 'broken' && z > top * 0.85 && dmath.hypot(x, y) < r * 0.7))
      c = FRACTURE;
    colors.set(c, i);
  }
  // LOD0's reshaped hexagon keeps the lathe's twelve radial normals; re-derive them from the
  // faces, hard at the six corners (60°) and at the profile creases the lathe split (20°).
  // The sheared stub's cut needs its own flat normal at every LOD.
  return lod === 0 || state === 'stub'
    ? weightedNormals({ ...m, positions, colors }, { hardAngle: 20 })
    : { ...m, positions, colors };
}

/** Yaw / pitch that tilt +Z onto direction d. */
function aim(d: Vec3): { yaw: number; pitch: number } {
  const l = dmath.hypot(d[0], d[1], d[2]) || 1;
  return { yaw: dmath.atan2(d[1], d[0]), pitch: dmath.acos(d[2] / l) };
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
  // Cut deep enough that each plane leaves a flat face a metre or more across: the outline turns
  // angular (a broken block), not a dome.
  for (const [n, d] of [
    [[0.85, -0.3, 0.45], 1.25],
    [[-0.6, -0.75, 0.3], 1.18],
    [[-0.3, 0.8, 0.55], 1.22],
    [[0.2, 0.9, 0.2], 1.6],
    [[-0.95, 0.1, 0.25], 1.65],
    // Top facets.
    [[0.25, -0.35, 1], 1.12],
    [[-0.4, 0.3, 1], 1.02],
    [[0.7, 0.45, 0.6], 1.2],
    [[-0.5, -0.5, 0.7], 1.25],
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
    f = sd.smoothSubtract(0.12, f, sd.ellipsoid([0.5, -0.45, 1.85], [1.05, 0.95, 1.1]));
  const pits = valueNoise(rng.fork('pits'), { scale: 0.6, octaves: 3 });
  const rough = sd.displace(f, pits, 0.025);
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
    if (dmath.hypot(p[0] - from[0], p[1] - from[1], p[2] - from[2]) > 3) return null;
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
  // The near colour at a point of the rock surface with normal n.
  const near = (p: Vec3, n: Vec3, saltK = 1): Vec3 => {
    const h = Math.min(1, p[2] / 2);
    // Strata: lava flows laid in beds dipping gently to −X, their thickness wandering 15–45 cm
    // and their partings wavy, so they follow the rock's own layering instead of drawing straight
    // stitched rings round it; every other bed a lighter flow.
    const bed = (p[2] + p[0] * 0.12 + tone(p) * 0.22) / (0.3 + 0.15 * tone([p[1], p[0], p[2]]));
    const layer = Math.floor(bed) % 2 === 0 ? 0.45 : 0;
    const parting = smooth(0.08, 0.0, Math.abs(bed - Math.round(bed)));
    const base = mix(
      mix(mix(BASALT_DEEP, BASALT, 0.5 + h * 0.5), BASALT_LIGHT, layer),
      BASALT_DEEP,
      parting * 0.8,
    );
    const e = 0.4;
    // Measured from the point's own field value: a coarse far vertex sits off the true surface
    // (inside it on a convex face), and probing from there read every face as a salt crevice.
    const open = (field([p[0] + n[0] * e, p[1] + n[1] * e, p[2] + n[2] * e]) - field(p)) / e;
    const crevice = smooth(0.5, 0.25, open);
    // Salt: packed in crevices and dusted on near-level tops (where brine pools and dries),
    // never on the flanks; the scoop rim of a worked node is pale with spoil dust.
    const top = smooth(0.88, 0.97, n[2]) * smooth(1.0, 1.5, p[2]);
    const rim = depleted
      ? smooth(1.4, 0.7, dmath.hypot(p[0] - 0.5, p[1] + 0.45)) * smooth(1.3, 1.8, p[2])
      : 0;
    const salt = Math.max(crevice * 0.9, top * 0.55) * saltK;
    return mix(mix(mix(base, BASALT_DEEP, crevice * 0.4), SALT, salt), DUST, rim * 0.7);
  };
  // Far: each vertex the mean of the near colour over the patch of surface it stands for (5 × 5
  // points across ±half a cell in its tangent plane), so the beds average out. Its salt is cut to
  // `FAR_SALT`: the 88-triangle far rock is a few big faces whose smoothed normals count as
  // level tops and whose probes count as crevices, so at full salt it came out twice as light as
  // the near rock (a value pop at the switch; `rts_resource.test.ts` holds the two within 15 %).
  const cell = ctx.pick([0.11, 0.27, depleted ? 0.74 : 0.78]);
  const far = (p: Vec3, n: Vec3): Vec3 => {
    const a = unit(Math.abs(n[2]) < 0.9 ? [-n[1], n[0], 0] : [1, 0, 0]);
    const b: Vec3 = [
      n[1] * a[2] - n[2] * a[1],
      n[2] * a[0] - n[0] * a[2],
      n[0] * a[1] - n[1] * a[0],
    ];
    const sum = [0, 0, 0] as [number, number, number];
    for (let i = -2; i <= 2; i++)
      for (let j = -2; j <= 2; j++) {
        const [u, v] = [(i * cell) / 4, (j * cell) / 4];
        const c = near(
          [p[0] + a[0] * u + b[0] * v, p[1] + a[1] * u + b[1] * v, p[2] + a[2] * u + b[2] * v],
          n,
          FAR_SALT,
        );
        sum[0] += c[0] / 25;
        sum[1] += c[1] / 25;
        sum[2] += c[2] / 25;
      }
    return [sum[0], sum[1], sum[2]];
  };
  const raw = sdf({
    field,
    bounds: [
      [-2.6, -2.2, 0],
      [2.6, 2.2, 2.4],
    ],
    resolution: cell,
    strip: 'concrete',
    lipschitz: 1.6,
    color: lod === 2 ? far : near,
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
        // No dust: per-vertex dust spots on dark rock read as camouflage blotches. Mud only,
        // up the foot where boots and rain put it.
        mud: { where: 'ground-near', amount: 0.6, color: MUD, strength: 0.7 },
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
    // LOD2: every cluster keeps two crystals (a cluster, not a lone prism, at crowd distance);
    // a harvested node's side clusters, one stub each.
    const n = lod === 2 ? Math.min(depleted && ci > 0 ? 1 : 2, c.n) : c.n;
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
  if (lod === 2) {
    // Far: the spoil heap as one low mound, so the node still reads as worked.
    const at: Vec3 = depleted ? [1.8, -1.9, -0.02] : [2.35, 0.9, -0.02];
    ctx.part('spoil', dome(2, at, [0.6, 0.5, 0.28], BASALT_LIGHT), {
      connect: { as: 'rest', why: 'loose spoil lies where it was thrown' },
    });
    return;
  }
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
  // Pick marks: rows of pale fresh-chipped gouges (new rock under the weathered skin) round the
  // worked pocket, big enough to read from the hero camera.
  const side = CLUSTERS[1];
  if (side && lod === 0)
    for (let i = 0; i < 10; i++) {
      const from: Vec3 = [
        side.at[0] + 1.2,
        side.at[1] + rng.range(-0.8, 0.5),
        side.at[2] - 0.6 + rng.range(-0.25, 0.4),
      ];
      const p = surfaceAt(field, from, [-1, -0.2, 0.05]);
      if (!p) continue;
      marks.push(
        place(box({ size: [0.16, 0.07, 0.26], at: [0, 0, -0.13], color: CHIPPED }), {
          at: p,
          yaw: rng.range(-0.4, 0.4),
          roll: rng.range(-0.6, 0.6),
        }),
      );
    }
  // Trampled brine mud on the side the crew works from: a dark flat patch round the spoil.
  const mud: Vec2[] = [];
  const [mx, my] = depleted ? [1.7, -1.6] : [2.2, 0.6];
  for (let i = 0; i < (lod === 0 ? 12 : 7); i++) {
    const a = (i / (lod === 0 ? 12 : 7)) * Math.PI * 2;
    const k = rng.range(0.7, 1.1);
    mud.push([mx + dmath.cos(a) * 0.95 * k, my + dmath.sin(a) * 0.75 * k]);
  }
  ctx.part(
    'trampled',
    prism({
      profile: mud,
      depth: 0.01,
      plane: 'xy',
      centred: false,
      color: MUD,
      strip: ROCK_STRIP,
    }),
  );
  if (depleted && lod === 0) {
    // Drill holes round the scoop wall, and spoil on its floor with a few amber chips.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      // From the scoop's open middle out to its wall.
      const p = surfaceAt(field, [0.5, -0.45, 1.6], [dmath.cos(a), dmath.sin(a), 0.1]);
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
  // Out on open ground in front of the stake, clear of the rock's foot.
  const plaque = chevronPlan([at[0] + 0.3, at[1] + 0.1, 0], 1.25, 1.1, 0.4, 0.06, TEAM);
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
  // Crystals glow from within at 0.5, not the lamps' 1.2: lit, but their facets still shade.
  glow: [{ parts: ['crystals'], color: SUNSTONE, strength: 0.5 }],
  // Front-right 3/4: the claim stake at the side, the worked face and spoil toward the lens.
  hero: { azDeg: 30, elDeg: 24 },
});
export const rts_resource_depleted = deposit.variant({
  name: 'rts_resource_depleted',
  description:
    'Sunstone deposit, harvested: the main cluster quarried out to two snapped crystals, the rest sheared to stubs, drill holes and spoil.',
  params: { depleted: true },
  // Spoil thrown out on the worked (−Y) side widens the footprint.
  real: { length: 4.93, width: 4.34, height: 2.8 },
  // Mined out: the sheared stubs smoulder dimmer than a whole cluster.
  glow: [{ parts: ['crystal_stubs'], color: SUNSTONE, strength: 0.35 }],
  // From the north-east and higher, so the lens looks into the quarried scoop with the rock
  // centred; the claim stake stands behind it at the left instead of in the foreground.
  hero: { azDeg: 100, elDeg: 38 },
});
