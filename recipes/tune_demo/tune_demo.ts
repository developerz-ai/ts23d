// Tune demo: a two-handled storage amphora whose ten proportions are `tune.params`. The defaults
// make a squat jar; `t3d tune` fits the front silhouette to the hand-drawn `target_front.svg` and
// commits the numbers to `tune.json`, imported below, so every build reads the same values
// (docs/idea/20-tuning.md). Body: a lathe through a monotone cubic profile (no overshoot between
// stations), closed at the base and inside the neck. Handles: tubes swept along a cubic from the
// neck to the shoulder, both ends sunk into the wall, seated on attachment pads. Surface: matte
// terracotta with throw rings toned in by height, a darker, rougher foot, a potter's stamp on the
// shoulder; wear from `weather()`: a chipped rolled lip and foot ring, dark residue run down from
// the lip, dust on the shoulder. Dossier: recipes/tune_demo/README.md.

import {
  box,
  cylinder,
  defineAsset,
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
import saved from './tune.json';

const H = 0.6;
const CLAY = hex('#c27a52');
const FOOT = hex('#8a5236');
const STAMP = hex('#9a5a3a');
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

/** Throw rings and a darker, sooted foot: tone the clay by height (one colour per vertex). */
function clayTone(m: Mesh): Mesh {
  const colors = new Float32Array(m.colors);
  for (let v = 0; v < colors.length / 3; v++) {
    const z = m.positions[v * 3 + 2] ?? 0;
    const ring = 0.94 + 0.06 * Math.sin(z * 2 * Math.PI * 60);
    const foot = Math.min(1, Math.max(0, (z - 0.015) / 0.035));
    for (let c = 0; c < 3; c++)
      colors[v * 3 + c] = ((FOOT[c] ?? 0) * (1 - foot) + (CLAY[c] ?? 0) * foot) * ring;
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
    const rows = ctx.pick([40, 20, 6]);
    const profile: Vec2[] = [[0, 0]];
    for (let i = 0; i <= rows; i++) {
      const z = (i / rows) * H;
      profile.push([r(z), z]);
    }
    const lip = v('neckR') * v('lipFlare');
    if (ctx.lod < 2) {
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
    } else profile.push([0, H]); // LOD2 closes the mouth: the opening is a pixel at that range.
    const body = clayTone(
      lathe({
        profile,
        segments: ctx.pick([36, 18, 14]),
        color: CLAY,
        strip: 'concrete',
        uv: 'metres',
      }),
    );
    // Use: chips on the lip bead and foot ring, oil-dark residue run down from the lip on the
    // pouring side (+X), dust settled on the shoulder.
    const worn = weather(
      ctx,
      { body },
      {
        name: 'amphora_wear',
        seed: 3,
        age: 0.7,
        resolution: [0, 0, 0],
        fasteners: [
          { at: [lip + 0.004, 0.02, H - 0.004], radius: 0.03 },
          { at: [lip + 0.002, -0.03, H - 0.004], radius: 0.025 },
        ],
        under: hex('#d9b08a'),
        effects: {
          chips: { where: 'convex-edges', amount: 0.12 },
          ...(ctx.lod < 2
            ? {
                rust: {
                  where: 'below-fasteners | fasteners',
                  amount: 0.5,
                  streaks: true,
                  streakLength: 0.22,
                  color: [0.06, 0.035, 0.025] as const,
                  strength: 0.85,
                },
              }
            : {}),
          dust: { where: 'up-facing', amount: 0.3, strength: 0.3 },
        },
      },
    );
    const extras: Mesh[] = [worn.body];
    if (ctx.lod === 0) {
      // Potter's stamp on the shoulder (+X): a sunk cartouche with raised letters, tilted to lie
      // on the sloping wall.
      const zS = v('neckZ') * H - 0.06;
      const slope = (r(zS + 0.005) - r(zS - 0.005)) / 0.01;
      const tilt = { at: [r(zS) - 0.0008, 0, zS] as Vec3, pitch: Math.atan(slope) };
      extras.push(
        place(box({ size: [0.002, 0.042, 0.016], at: [0, 0, -0.008], color: STAMP }), tilt),
        place(
          text('LCF', {
            origin: [0.001, 0, -0.004],
            height: 0.008,
            depth: 0.0012,
            align: 'centre',
            color: STAMP,
          }),
          tilt,
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
      const steps = ctx.pick([16, 9, 4]);
      const loop: Mesh[] = [
        sweep({
          section: { radius: TUBE, segments: ctx.pick([10, 7, 4]) },
          path: Array.from({ length: steps + 1 }, (_, i) => cubic(ctrl, i / steps)),
          color: CLAY,
          strip: 'concrete',
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
              strip: 'concrete',
              at: [0, s * (r(z) - 0.003), z],
              axis: 'y',
            }),
          );
      ctx.part(`handle_${side}`, merge(loop));
    }
  },
});
