// Tune demo: a two-handled storage amphora whose ten proportions are `tune.params`. The defaults
// make a squat jar; `t3d tune` fits the front silhouette to the hand-drawn `target_front.svg` and
// commits the numbers to `tune.json`, imported below, so every build reads the same values
// (docs/idea/20-tuning.md). Body: a lathe through a monotone cubic profile (no overshoot between
// stations), closed at the base and inside the neck. Handles: tubes swept along a cubic from the
// neck to the shoulder, both ends sunk into the wall, seated on attachment pads. Surface: a
// recipe material (terracotta.ts: throw-ring relief, grit, matte) under vertex-colour story: a
// darker foot, burial soil caked to a ragged tide line, a wine-dark ring under the lip with runs
// down the neck toward the hero lens, a red-ochre titulus pictus and a potter's stamp on the
// shoulder; `weather()` chips the rolled lip and foot ring and dusts the shoulder. LOD2 keeps one
// profile station per feature (foot flare, belly, shoulder, lip roll) and colour only by height.
// Dossier: recipes/tune_demo/README.md.

import {
  cylinder,
  defineAsset,
  dmath,
  hex,
  lathe,
  type Mesh,
  merge,
  place,
  sweep,
  text,
  type Vec2,
  type Vec3,
  weather,
} from '@developerz.ai/ts23d';
import { TERRACOTTA } from './terracotta.ts';
import saved from './tune.json';

const H = 0.6;
const CLAY = hex('#c27a52');
const FOOT = hex('#8a5236');
/** The stamp's letters: the jar's own clay, a shade darker where the die pressed it. */
const STAMP: Vec3 = [CLAY[0] * 0.85, CLAY[1] * 0.85, CLAY[2] * 0.85];
const SOIL = hex('#a39582');
const RESIDUE = hex('#241a15');
const OCHRE = hex('#8e2b18');
const WALL = 0.012;
const TUBE = 0.013;

/** Fritsch–Carlson monotone cubic through (z, r) stations, z strictly increasing. */
function monotone(st: readonly Vec2[]): (z: number) => number {
  const n = st.length;
  const d = st.slice(1).map((p, i) => {
    const q = st[i] ?? p;
    return (p[1] - q[1]) / (p[0] - q[0]);
  });
  const m = st.map((_, i) => {
    if (i === 0) return d[0] ?? 0;
    if (i === n - 1) return d[n - 2] ?? 0;
    const a = d[i - 1] ?? 0;
    const b = d[i] ?? 0;
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  });
  return (z) => {
    let i = 0;
    while (i < n - 2 && z > (st[i + 1]?.[0] ?? z)) i++;
    const [z0, r0] = st[i] ?? [0, 0];
    const [z1, r1] = st[i + 1] ?? [z0 + 1, r0];
    const h = z1 - z0;
    const t = Math.min(1, Math.max(0, (z - z0) / h));
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * r0 +
      (t3 - 2 * t2 + t) * h * (m[i] ?? 0) +
      (-2 * t3 + 3 * t2) * r1 +
      (t3 - t2) * h * (m[i + 1] ?? 0)
    );
  };
}

const cubic = (p: readonly Vec3[], t: number): Vec3 => {
  const u = 1 - t;
  const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  const at = (k: 0 | 1 | 2): number => p.reduce((s, q, i) => s + (w[i] ?? 0) * q[k], 0);
  return [at(0), at(1), at(2)];
};

/** One residue run from the lip: angle (rad, about Z from +X), half-width (m), length (m). */
interface Run {
  readonly a: number;
  readonly w: number;
  readonly len: number;
}
/** Wine-dark residue runs from the pouring side, turned toward the hero lens (az −35°). */
const RUNS: readonly Run[] = [
  { a: -0.62, w: 0.014, len: 0.22 },
  { a: -0.38, w: 0.009, len: 0.14 },
  { a: -0.86, w: 0.011, len: 0.27 },
  { a: -1.15, w: 0.008, len: 0.11 },
  { a: -0.12, w: 0.01, len: 0.17 },
  { a: 0.2, w: 0.007, len: 0.08 },
  { a: -1.45, w: 0.009, len: 0.19 },
];

const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const band = (x: number, lo: number, hi: number): number =>
  Math.min(1, Math.max(0, (x - lo) / (hi - lo)));

/**
 * The jar's colour story, one colour per vertex: a darker, rougher-looking foot; soil caked in the
 * foot ring with a ragged tide line; a residue ring under the lip and, when `runs`, broad dark runs
 * down the neck onto the shoulder on the pouring side. Far LOD passes runs = false: only bands by
 * height, so a coarse mesh gets clean colour blocks instead of per-vertex checkers.
 */
function clayTone(m: Mesh, runs: boolean): Mesh {
  const colors = new Float32Array(m.colors);
  for (let v = 0; v < colors.length / 3; v++) {
    const x = m.positions[v * 3] ?? 0;
    const y = m.positions[v * 3 + 1] ?? 0;
    const z = m.positions[v * 3 + 2] ?? 0;
    const ang = dmath.atan2(y, x);
    const rad = dmath.hypot(x, y);
    let c = mix(FOOT, CLAY, band(z, 0.012, 0.045));
    // Burial soil caked on the foot and lower body: grey-buff against the orange clay, up to a
    // ragged tide line 8–18 cm high, thinning over its top 6 cm (four body stations) into the
    // clay: a graded dirt edge, not a staircase cut at one station.
    const tide =
      0.13 +
      0.035 * dmath.sin(ang * 3 + 0.7) +
      0.015 * dmath.sin(ang * 7 + 2) +
      0.008 * dmath.sin(ang * 13 + 4.1);
    const caked = 1 - band(z, tide - 0.045, tide + 0.015);
    c = mix(c, SOIL, 0.8 * caked * caked * (3 - 2 * caked));
    // Residue ring: the lip and the first 3 cm of neck, darkest at the rim.
    c = mix(c, RESIDUE, 0.8 * band(z, H - 0.03, H - 0.012));
    if (runs)
      for (const run of RUNS) {
        let d = ang - run.a;
        d = dmath.atan2(dmath.sin(d), dmath.cos(d));
        const across = Math.abs(d) * rad;
        const down = H - z;
        if (across > run.w || down > run.len) continue;
        const fade = 1 - down / run.len;
        c = mix(c, RESIDUE, 0.92 * (1 - dmath.pow(across / run.w, 4)) * (0.6 + 0.4 * fade));
      }
    colors.set(c, v * 3);
  }
  return { ...m, colors };
}

export const tune_demo = defineAsset({
  name: 'tune_demo',
  kind: 'prop',
  description:
    'Two-handled storage amphora whose proportions were fitted to a drawn front silhouette by `t3d tune`',
  tags: ['tune', 'demo', 'amphora', 'pottery', 'lathe'],
  license: 'CC0-1.0',
  budget: { triangles: [5000, 1500, 400] },
  tune: {
    params: {
      footR: { min: 0.03, max: 0.12, default: 0.1, step: 0.0005 },
      bellyR: { min: 0.08, max: 0.24, default: 0.2, step: 0.0005 },
      bellyZ: { min: 0.25, max: 0.6, default: 0.35, step: 0.0025 },
      shoulder: { min: 0, max: 1, default: 0.5, step: 0.005 },
      neckR: { min: 0.03, max: 0.1, default: 0.09, step: 0.0005 },
      neckZ: { min: 0.65, max: 0.88, default: 0.7, step: 0.0025 },
      lipFlare: { min: 0.9, max: 1.7, default: 1.1, step: 0.005 },
      handleReach: { min: 0, max: 0.12, default: 0.01, step: 0.0005 },
      handleTop: { min: 0.2, max: 0.9, default: 0.45, step: 0.005 },
      handleRise: { min: 0, max: 0.08, default: 0.03, step: 0.0005 },
    },
    objectives: [{ kind: 'silhouette', view: '+X', mask: 'target_front.svg' }],
    saved,
  },
  build(ctx) {
    const v = (n: string): number => ctx.tuned(n);
    const zB = v('bellyZ') * H;
    const zN = v('neckZ') * H;
    const r = monotone([
      [0, v('footR')],
      [0.05 * H, v('footR') * 0.72],
      [zB, v('bellyR')],
      [(zB + zN) / 2, v('neckR') + v('shoulder') * (v('bellyR') - v('neckR'))],
      [zN, v('neckR')],
      [0.95 * H, v('neckR') * 0.96],
      [H, v('neckR') * v('lipFlare')],
    ]);
    const lip = v('neckR') * v('lipFlare');
    const profile: Vec2[] = [[0, 0]];
    if (ctx.lod < 2) {
      const rows = ctx.pick([40, 20, 20]);
      for (let i = 0; i <= rows; i++) {
        const z = (i / rows) * H;
        profile.push([r(z), z]);
      }
      // Rolled lip: a bead turned over the rim, then down inside the neck to its floor.
      profile.pop();
      profile.push(
        [lip, H - 0.012],
        [lip + 0.005, H - 0.006],
        [lip + 0.004, H],
        [lip - 0.003, H + 0.004],
        [lip - WALL, H],
        [v('neckR') * 0.96 - WALL, H - 0.06],
        [0, H - 0.06],
      );
    } else {
      // LOD2: one station per feature, so the foot flare, belly, shoulder and the lip roll
      // survive at 14 sides inside the 300-triangle prop band; the mouth closes (the opening is a
      // pixel at that range).
      for (const z of [0, 0.03, 0.3 * H, zB, (zB + zN) / 2, zN]) profile.push([r(z), z]);
      profile.push([lip, H - 0.012], [lip + 0.005, H - 0.004], [0, H]);
    }
    const body = clayTone(
      lathe({
        profile,
        segments: ctx.pick([36, 18, 14]),
        color: CLAY,
        strip: TERRACOTTA,
        uv: 'metres',
      }),
      ctx.lod < 2,
    );
    // Use: chips on the lip bead and foot ring (LOD0/1: on a coarse ring they would be checkers),
    // dust settled on the shoulder.
    const worn = weather(
      ctx,
      { body },
      {
        name: 'amphora_wear',
        seed: 3,
        age: 0.7,
        resolution: [0, 0, 0],
        under: hex('#d9b08a'),
        effects: {
          ...(ctx.lod < 2 ? { chips: { where: 'convex-edges', amount: 0.12 } } : {}),
          dust: { where: 'up-facing', amount: 0.3, strength: 0.3 },
        },
      },
    );
    const extras: Mesh[] = [worn.body];
    if (ctx.lod === 0) {
      // Potter's stamp on the shoulder (+X): the maker's letters pressed in relief in the jar's
      // own clay and strip, bent to the wall's curve so every stroke sits on it (a flat cartouche
      // plate stood off the curved shoulder and read as a pale label).
      const zS = v('neckZ') * H - 0.06;
      const rS = r(zS);
      extras.push(
        place(
          text('LCF', {
            origin: [rS - 0.0004, 0, 0],
            height: 0.01,
            depth: 0.0014,
            align: 'centre',
            color: STAMP,
            strip: TERRACOTTA,
            surface: (u, w) => Math.sqrt(Math.max(0, dmath.pow(r(zS + w), 2) - u * u)) - rS,
          }),
          { at: [0, 0, zS] },
        ),
      );
      // Titulus pictus: the merchant's red-ochre brush note on the shoulder, turned toward the
      // hero lens and bent to the wall's curve so every stroke sits on the clay.
      const zT = zN - 0.1;
      const rT = r(zT);
      extras.push(
        place(
          text('VIN XII', {
            origin: [rT - 0.0003, 0, 0],
            height: 0.014,
            depth: 0.0006,
            align: 'centre',
            color: OCHRE,
            surface: (u, w) => Math.sqrt(Math.max(0, dmath.pow(r(zT + w), 2) - u * u)) - rT,
          }),
          { at: [0, 0, zT], yaw: -0.3 },
        ),
      );
    }
    ctx.part('body', merge(extras));

    // Loop handles at ±Y, neck → shoulder; ends sunk WALL into the vessel so they touch it.
    const zA = zN + v('handleTop') * (0.95 * H - zN);
    const zS = zN - 0.4 * (zN - zB);
    const reach = v('handleReach');
    for (const [side, s] of [
      ['l', 1],
      ['r', -1],
    ] as const) {
      const ctrl: Vec3[] = [
        [0, s * (r(zA) - WALL), zA],
        [0, s * (r(zA) + reach + 0.05), zA + v('handleRise')],
        [0, s * (r(zS) + reach + 0.04), zS + 0.06],
        [0, s * (r(zS) - WALL), zS],
      ];
      const steps = ctx.pick([16, 9, 3]);
      const loop: Mesh[] = [
        sweep({
          section: { radius: TUBE, segments: ctx.pick([10, 7, 4]) },
          path: Array.from({ length: steps + 1 }, (_, i) => cubic(ctrl, i / steps)),
          color: CLAY,
          strip: TERRACOTTA,
          caps: true,
        }),
      ];
      // Attachment pads: the potter's thumb-pressed clay where each end joins the wall (LOD0/1).
      if (ctx.lod < 2)
        for (const z of [zA, zS])
          loop.push(
            cylinder({
              radius: 0.018,
              length: 0.008,
              segments: ctx.pick([12, 8, 6]),
              color: CLAY,
              strip: TERRACOTTA,
              at: [0, s * (r(z) - 0.003), z],
              axis: 'y',
            }),
          );
      ctx.part(`handle_${side}`, merge(loop));
    }
  },
});
